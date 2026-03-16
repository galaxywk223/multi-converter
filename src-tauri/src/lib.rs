mod history;

use std::{
    collections::{HashMap, HashSet},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Arc,
    thread,
};

use chrono::Utc;
use history::HistoryStore;
use parking_lot::Mutex;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartJobPayload {
    pub job_type: String,
    pub inputs: Vec<String>,
    pub output_dir: String,
    pub model_name: String,
    pub model_dir: Option<String>,
    pub language: String,
    pub device: String,
    pub ffmpeg_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureModelPayload {
    pub model_id: String,
    pub local_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentInfo {
    pub python_version: String,
    pub device: String,
    pub ffmpeg_available: bool,
    pub ffmpeg_version: Option<String>,
    pub default_model_dir: String,
    pub model_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureModelResult {
    pub model_name: String,
    pub device: String,
    pub model_dir: String,
    pub model_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRecord {
    pub task_id: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub status: String,
    pub created_at: String,
    pub finished_at: String,
    pub inputs: Vec<String>,
    pub output_dir: String,
    pub outputs: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskHandle {
    pub task_id: String,
}

#[derive(Debug, Deserialize)]
struct WorkerEnvelope {
    event: String,
    payload: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerDonePayload {
    task_id: String,
    outputs: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerErrorPayload {
    task_id: String,
    message: String,
}

#[derive(Clone)]
struct DesktopState {
    history: HistoryStore,
    jobs: Arc<Mutex<HashMap<String, Arc<Mutex<Child>>>>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
}

impl DesktopState {
    fn new(app: AppHandle) -> Result<Self, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        let history = HistoryStore::new(app_data_dir.join("history.sqlite3"))?;

        Ok(Self {
            history,
            jobs: Arc::new(Mutex::new(HashMap::new())),
            cancelled: Arc::new(Mutex::new(HashSet::new())),
        })
    }
}

#[allow(non_snake_case)]
#[tauri::command]
fn detectEnvironment(app: AppHandle) -> Result<EnvironmentInfo, String> {
    let model_dir = resolve_model_dir(&app);
    let ffmpeg_path = resolve_ffmpeg_path(&app);
    run_worker_json(
        &app,
        &[
            "detect-environment".to_string(),
            "--ffmpeg-path".to_string(),
            ffmpeg_path,
            "--model-dir".to_string(),
            model_dir.to_string_lossy().to_string(),
        ],
    )
}

#[allow(non_snake_case)]
#[tauri::command]
fn ensureModel(app: AppHandle, payload: EnsureModelPayload) -> Result<EnsureModelResult, String> {
    let model_dir = payload
        .local_path
        .map(PathBuf::from)
        .unwrap_or_else(|| resolve_model_dir(&app));
    run_worker_json(
        &app,
        &[
            "ensure-model".to_string(),
            "--model-name".to_string(),
            payload.model_id,
            "--model-dir".to_string(),
            model_dir.to_string_lossy().to_string(),
        ],
    )
}

#[allow(non_snake_case)]
#[tauri::command]
fn listHistory(state: State<DesktopState>) -> Result<Vec<HistoryRecord>, String> {
    state.history.list()
}

#[allow(non_snake_case)]
#[tauri::command]
fn startJob(
    app: AppHandle,
    state: State<DesktopState>,
    payload: StartJobPayload,
) -> Result<TaskHandle, String> {
    let task_id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();

    let mut command = worker_command(&app)?;
    command
        .arg("run")
        .arg("--task-id")
        .arg(&task_id)
        .arg("--job-type")
        .arg(&payload.job_type)
        .arg("--output-dir")
        .arg(&payload.output_dir)
        .arg("--model-name")
        .arg(&payload.model_name)
        .arg("--model-dir")
        .arg(
            payload
                .model_dir
                .clone()
                .unwrap_or_else(|| resolve_model_dir(&app).to_string_lossy().to_string()),
        )
        .arg("--language")
        .arg(&payload.language)
        .arg("--device")
        .arg(&payload.device)
        .arg("--ffmpeg-path")
        .arg(payload.ffmpeg_path.clone().unwrap_or_else(|| resolve_ffmpeg_path(&app)));

    for input in &payload.inputs {
        command.arg("--input").arg(input);
    }

    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Worker stdout unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Worker stderr unavailable".to_string())?;

    let child_handle = Arc::new(Mutex::new(child));
    let desktop = state.inner().clone();
    desktop
        .jobs
        .lock()
        .insert(task_id.clone(), Arc::clone(&child_handle));

    let app_for_stdout = app.clone();
    let desktop_for_stdout = desktop.clone();
    let payload_for_stdout = payload.clone();
    let task_id_for_stdout = task_id.clone();
    thread::spawn(move || {
        read_worker_stderr(app_for_stdout.clone(), &task_id_for_stdout, stderr);
        process_worker_stdout(
            app_for_stdout,
            desktop_for_stdout,
            task_id_for_stdout,
            created_at,
            payload_for_stdout,
            child_handle,
            stdout,
        );
    });

    Ok(TaskHandle { task_id })
}

#[allow(non_snake_case)]
#[tauri::command]
fn cancelJob(task_id: String, state: State<DesktopState>) -> Result<(), String> {
    state.cancelled.lock().insert(task_id.clone());
    if let Some(child) = state.jobs.lock().get(&task_id).cloned() {
        child.lock().kill().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[allow(non_snake_case)]
#[tauri::command]
fn openPath(path: String) -> Result<(), String> {
    open_path_with_os(&path)
}

fn process_worker_stdout(
    app: AppHandle,
    state: DesktopState,
    task_id: String,
    created_at: String,
    payload: StartJobPayload,
    child: Arc<Mutex<Child>>,
    stdout: impl std::io::Read,
) {
    let mut completed = false;
    let reader = BufReader::new(stdout);

    for line in reader.lines() {
        let Ok(line) = line else {
            continue;
        };

        if line.trim().is_empty() {
            continue;
        }

        match serde_json::from_str::<WorkerEnvelope>(&line) {
            Ok(message) => {
                let event_name = map_worker_event(&message.event);
                match message.event.as_str() {
                    "job.done" => {
                        if let Ok(done) = serde_json::from_value::<WorkerDonePayload>(message.payload.clone()) {
                            let record = HistoryRecord {
                                task_id: done.task_id.clone(),
                                r#type: payload.job_type.clone(),
                                status: "succeeded".to_string(),
                                created_at: created_at.clone(),
                                finished_at: Utc::now().to_rfc3339(),
                                inputs: payload.inputs.clone(),
                                output_dir: payload.output_dir.clone(),
                                outputs: done.outputs.clone(),
                                error: None,
                            };
                            let _ = state.history.upsert(&record);
                        }
                        completed = true;
                    }
                    "job.error" => {
                        if let Ok(error) = serde_json::from_value::<WorkerErrorPayload>(message.payload.clone()) {
                            let record = HistoryRecord {
                                task_id: error.task_id.clone(),
                                r#type: payload.job_type.clone(),
                                status: if state.cancelled.lock().contains(&task_id) {
                                    "cancelled".to_string()
                                } else {
                                    "failed".to_string()
                                },
                                created_at: created_at.clone(),
                                finished_at: Utc::now().to_rfc3339(),
                                inputs: payload.inputs.clone(),
                                output_dir: payload.output_dir.clone(),
                                outputs: Vec::new(),
                                error: Some(error.message.clone()),
                            };
                            let _ = state.history.upsert(&record);
                        }
                        completed = true;
                    }
                    _ => {}
                }

                let _ = app.emit(event_name, message.payload);
            }
            Err(_) => {
                let payload = serde_json::json!({
                    "taskId": task_id,
                    "level": "debug",
                    "message": line,
                });
                let _ = app.emit("job://log", payload);
            }
        }
    }

    let exit_status = child.lock().wait();
    state.jobs.lock().remove(&task_id);
    let cancelled = state.cancelled.lock().remove(&task_id);

    if completed {
        return;
    }

    if cancelled {
        let record = HistoryRecord {
            task_id: task_id.clone(),
            r#type: payload.job_type.clone(),
            status: "cancelled".to_string(),
            created_at,
            finished_at: Utc::now().to_rfc3339(),
            inputs: payload.inputs,
            output_dir: payload.output_dir,
            outputs: Vec::new(),
            error: Some("任务已取消。".to_string()),
        };
        let _ = state.history.upsert(&record);
        return;
    }

    if let Ok(status) = exit_status {
        if !status.success() {
            let payload = serde_json::json!({
                "taskId": task_id,
                "code": "WORKER_EXIT",
                "message": format!("Worker exited with status: {status}"),
            });
            let _ = app.emit("job://error", payload);
        }
    }
}

fn read_worker_stderr(app: AppHandle, task_id: &str, stderr: impl std::io::Read) {
    let reader = BufReader::new(stderr);
    for line in reader.lines() {
        let Ok(line) = line else {
            continue;
        };
        if line.trim().is_empty() {
            continue;
        }
        let payload = serde_json::json!({
            "taskId": task_id,
            "level": "error",
            "message": line,
        });
        let _ = app.emit("job://log", payload);
    }
}

fn run_worker_json<T: DeserializeOwned>(app: &AppHandle, args: &[String]) -> Result<T, String> {
    let output = worker_command(app)?
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if !stderr.is_empty() { stderr } else { stdout });
    }

    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

fn worker_command(app: &AppHandle) -> Result<Command, String> {
    let root = resolve_runtime_root(app);
    let python = resolve_python_executable(app);
    let mut command = Command::new(python);
    command.current_dir(&root);
    command.env("PYTHONUTF8", "1");
    command.env("PYTHONPATH", root.to_string_lossy().to_string());
    command.arg("-m").arg("worker.cli");
    Ok(command)
}

fn resolve_runtime_root(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")))
            .to_path_buf()
    } else {
        app.path()
            .resource_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
    }
}

fn resolve_python_executable(app: &AppHandle) -> PathBuf {
    let root = resolve_runtime_root(app);
    let venv_python = root.join("venv").join("Scripts").join("python.exe");
    if venv_python.exists() {
        return venv_python;
    }

    let packaged_python = root.join("python").join("python.exe");
    if packaged_python.exists() {
        return packaged_python;
    }

    PathBuf::from("python")
}

fn resolve_model_dir(app: &AppHandle) -> PathBuf {
    if let Some(base) = dirs::data_local_dir() {
        return base.join("AudioToText").join("models");
    }

    resolve_runtime_root(app).join("models")
}

fn resolve_ffmpeg_path(app: &AppHandle) -> String {
    let root = resolve_runtime_root(app);
    let candidates = [
        root.join("ffmpeg-x86_64-pc-windows-msvc.exe"),
        root.join("src-tauri")
            .join("binaries")
            .join("ffmpeg-x86_64-pc-windows-msvc.exe"),
    ];

    for candidate in candidates {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }

    "ffmpeg".to_string()
}

fn map_worker_event(name: &str) -> &str {
    match name {
        "job.progress" => "job://progress",
        "job.log" => "job://log",
        "job.done" => "job://done",
        "job.error" => "job://error",
        _ => "job://log",
    }
}

fn open_path_with_os(path: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err(format!("Unsupported platform for path opening: {path}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = DesktopState::new(app.handle().clone())
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            detectEnvironment,
            ensureModel,
            listHistory,
            startJob,
            cancelJob,
            openPath
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
