mod history;
mod settings;

use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
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
use serde_json::{json, Value};
use settings::{AppSettings, SettingsStore};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct StartJobPayload {
    pub job_type: String,
    pub inputs: Vec<String>,
    pub output_dir: String,
    pub output_mode: String,
    pub output_name: Option<String>,
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
    pub ocr_available: bool,
    pub ffmpeg_path: String,
    pub default_model_dir: String,
    pub model_exists: bool,
    pub app_data_dir: String,
    pub app_data_writable: bool,
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
    pub payload_json: StartJobPayload,
    pub settings_snapshot: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedInput {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizeInputsResult {
    pub accepted: Vec<String>,
    pub skipped: Vec<SkippedInput>,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerEnvironmentInfo {
    python_version: String,
    device: String,
    ffmpeg_available: bool,
    ffmpeg_version: Option<String>,
    ocr_available: bool,
    default_model_dir: String,
    model_exists: bool,
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
    code: Option<String>,
    details: Option<String>,
}

#[derive(Clone)]
struct DesktopState {
    history: HistoryStore,
    settings: SettingsStore,
    runtime: Arc<Mutex<RuntimeState>>,
}

#[derive(Default)]
struct RuntimeState {
    active_task: Option<String>,
    queue: VecDeque<QueuedJob>,
    running: HashMap<String, Arc<Mutex<Child>>>,
    cancelled: HashSet<String>,
}

#[derive(Clone)]
struct QueuedJob {
    task_id: String,
    created_at: String,
    payload: StartJobPayload,
    settings_snapshot: AppSettings,
}

impl DesktopState {
    fn new(app: AppHandle) -> Result<Self, String> {
        let app_data_dir = resolve_app_data_dir(&app)?;
        fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;

        let history = HistoryStore::new(app_data_dir.join("history.sqlite3"))?;
        let settings = SettingsStore::new(app_data_dir.join("settings.json"))?;

        Ok(Self {
            history,
            settings,
            runtime: Arc::new(Mutex::new(RuntimeState::default())),
        })
    }
}

#[allow(non_snake_case)]
#[tauri::command]
fn detectEnvironment(
    app: AppHandle,
    state: State<DesktopState>,
) -> Result<EnvironmentInfo, String> {
    let settings = state.settings.load()?;
    detect_environment_with_settings(&app, &settings)
}

#[allow(non_snake_case)]
#[tauri::command]
fn loadSettings(state: State<DesktopState>) -> Result<AppSettings, String> {
    state.settings.load()
}

#[allow(non_snake_case)]
#[tauri::command]
fn saveSettings(state: State<DesktopState>, settings: AppSettings) -> Result<AppSettings, String> {
    state.settings.save(&settings)
}

#[allow(non_snake_case)]
#[tauri::command]
fn ensureModel(
    app: AppHandle,
    state: State<DesktopState>,
    payload: EnsureModelPayload,
) -> Result<EnsureModelResult, String> {
    let settings = state.settings.load().unwrap_or_default();
    let model_dir = payload
        .local_path
        .map(PathBuf::from)
        .or_else(|| settings.model_path.map(PathBuf::from))
        .unwrap_or_else(resolve_default_model_dir);

    run_worker_json(
        &app,
        &[
            "ensure-model".to_string(),
            "--model-name".to_string(),
            payload.model_id,
            "--model-dir".to_string(),
            model_dir.to_string_lossy().to_string(),
            "--device".to_string(),
            settings.device_preference,
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
fn normalizeInputs(paths: Vec<String>, job_type: String) -> Result<NormalizeInputsResult, String> {
    Ok(normalize_input_paths(&paths, &job_type))
}

#[allow(non_snake_case)]
#[tauri::command]
fn startJob(
    app: AppHandle,
    state: State<DesktopState>,
    payload: StartJobPayload,
) -> Result<TaskHandle, String> {
    let settings = state.settings.load()?;
    let queued_job = prepare_job(&app, payload, settings)?;
    let task_id = queued_job.task_id.clone();
    let total_files = queued_job.payload.inputs.len();

    {
        let mut runtime = state.runtime.lock();
        runtime.queue.push_back(queued_job);
    }

    emit_progress(
        &app,
        &task_id,
        "queueing",
        0.0,
        None,
        total_files,
        "任务已进入队列，等待执行。",
        None,
    );
    maybe_start_next_job(app, state.inner().clone());

    Ok(TaskHandle { task_id })
}

#[allow(non_snake_case)]
#[tauri::command]
fn rerunHistory(
    app: AppHandle,
    state: State<DesktopState>,
    task_id: String,
) -> Result<TaskHandle, String> {
    let record = state
        .history
        .get(&task_id)?
        .ok_or_else(|| format!("未找到历史任务: {task_id}"))?;
    let settings = state.settings.load()?;
    let queued_job = prepare_job(&app, record.payload_json.clone(), settings)?;
    let next_task_id = queued_job.task_id.clone();
    let total_files = queued_job.payload.inputs.len();

    {
        let mut runtime = state.runtime.lock();
        runtime.queue.push_back(queued_job);
    }

    emit_progress(
        &app,
        &next_task_id,
        "queueing",
        0.0,
        None,
        total_files,
        "历史任务已重新加入队列。",
        None,
    );
    maybe_start_next_job(app, state.inner().clone());

    Ok(TaskHandle {
        task_id: next_task_id,
    })
}

#[allow(non_snake_case)]
#[tauri::command]
fn cancelJob(app: AppHandle, task_id: String, state: State<DesktopState>) -> Result<(), String> {
    let queued_job = {
        let mut runtime = state.runtime.lock();
        runtime.cancelled.insert(task_id.clone());

        if let Some(position) = runtime.queue.iter().position(|job| job.task_id == task_id) {
            runtime.queue.remove(position)
        } else if let Some(child) = runtime.running.get(&task_id).cloned() {
            drop(runtime);
            child.lock().kill().map_err(|error| error.to_string())?;
            return Ok(());
        } else {
            return Err(format!("未找到任务: {task_id}"));
        }
    };

    if let Some(job) = queued_job {
        let record = build_history_record(
            &job.task_id,
            &job.payload,
            &job.settings_snapshot,
            "cancelled",
            &job.created_at,
            Vec::new(),
            Some("任务已取消。".to_string()),
        );
        state.history.upsert(&record)?;
        emit_cancelled(&app, &job.task_id);
        state.runtime.lock().cancelled.remove(&job.task_id);
    }
    Ok(())
}

#[allow(non_snake_case)]
#[tauri::command]
fn openPath(path: String) -> Result<(), String> {
    open_path_with_os(&path)
}

fn maybe_start_next_job(app: AppHandle, state: DesktopState) {
    loop {
        let next_job = {
            let mut runtime = state.runtime.lock();
            if runtime.active_task.is_some() {
                return;
            }
            runtime.queue.pop_front()
        };

        let Some(job) = next_job else {
            return;
        };

        match spawn_queued_job(&app, state.clone(), job.clone()) {
            Ok(()) => return,
            Err(error) => {
                let record = build_history_record(
                    &job.task_id,
                    &job.payload,
                    &job.settings_snapshot,
                    "failed",
                    &job.created_at,
                    Vec::new(),
                    Some(error.clone()),
                );
                let _ = state.history.upsert(&record);
                let _ = app.emit(
                    "job://error",
                    json!({
                        "taskId": job.task_id,
                        "code": "PRELAUNCH_FAILED",
                        "message": error,
                    }),
                );
            }
        }
    }
}

fn spawn_queued_job(app: &AppHandle, state: DesktopState, job: QueuedJob) -> Result<(), String> {
    let mut command = worker_command(app)?;
    command
        .arg("run")
        .arg("--task-id")
        .arg(&job.task_id)
        .arg("--job-type")
        .arg(&job.payload.job_type)
        .arg("--output-dir")
        .arg(&job.payload.output_dir)
        .arg("--output-mode")
        .arg(&job.payload.output_mode)
        .arg("--model-name")
        .arg(&job.payload.model_name)
        .arg("--model-dir")
        .arg(
            job.payload
                .model_dir
                .clone()
                .unwrap_or_else(|| resolve_default_model_dir().to_string_lossy().to_string()),
        )
        .arg("--language")
        .arg(&job.payload.language)
        .arg("--device")
        .arg(&job.payload.device)
        .arg("--ffmpeg-path")
        .arg(resolve_ffmpeg_path(app, job.payload.ffmpeg_path.as_deref()));

    if let Some(output_name) = &job.payload.output_name {
        command.arg("--output-name").arg(output_name);
    }

    for input in &job.payload.inputs {
        command.arg("--input").arg(input);
    }

    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    emit_progress(
        app,
        &job.task_id,
        "preflight",
        2.0,
        None,
        job.payload.inputs.len(),
        "环境检查完成，正在启动本地 worker。",
        None,
    );

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
    {
        let mut runtime = state.runtime.lock();
        runtime.active_task = Some(job.task_id.clone());
        runtime
            .running
            .insert(job.task_id.clone(), Arc::clone(&child_handle));
    }

    let stderr_app = app.clone();
    let stderr_task_id = job.task_id.clone();
    let stderr_runtime = Arc::clone(&state.runtime);
    thread::spawn(move || {
        read_worker_stderr(stderr_app, stderr_task_id, stderr_runtime, stderr);
    });

    let stdout_app = app.clone();
    thread::spawn(move || {
        process_worker_stdout(stdout_app, state, job, child_handle, stdout);
    });

    Ok(())
}

fn process_worker_stdout(
    app: AppHandle,
    state: DesktopState,
    job: QueuedJob,
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
                let cancelled = state.runtime.lock().cancelled.contains(&job.task_id);
                match message.event.as_str() {
                    "job.done" => {
                        if let Ok(done) =
                            serde_json::from_value::<WorkerDonePayload>(message.payload.clone())
                        {
                            let record = build_history_record(
                                &done.task_id,
                                &job.payload,
                                &job.settings_snapshot,
                                "succeeded",
                                &job.created_at,
                                done.outputs.clone(),
                                None,
                            );
                            let _ = state.history.upsert(&record);
                        }
                        let _ = app.emit("job://done", message.payload);
                        completed = true;
                    }
                    "job.error" => {
                        if let Ok(error) =
                            serde_json::from_value::<WorkerErrorPayload>(message.payload.clone())
                        {
                            let status = if cancelled { "cancelled" } else { "failed" };
                            let record = build_history_record(
                                &error.task_id,
                                &job.payload,
                                &job.settings_snapshot,
                                status,
                                &job.created_at,
                                Vec::new(),
                                Some(if cancelled {
                                    "任务已取消。".to_string()
                                } else {
                                    error.message.clone()
                                }),
                            );
                            let _ = state.history.upsert(&record);

                            if cancelled {
                                emit_cancelled(&app, &job.task_id);
                            } else {
                                let _ = app.emit(
                                    "job://error",
                                    json!({
                                        "taskId": error.task_id,
                                        "code": error.code.unwrap_or_else(|| "JOB_FAILED".to_string()),
                                        "message": error.message,
                                        "details": error.details,
                                    }),
                                );
                            }
                        }
                        completed = true;
                    }
                    "job.progress" => {
                        let _ = app.emit("job://progress", message.payload);
                    }
                    "job.log" => {
                        let _ = app.emit("job://log", message.payload);
                    }
                    _ => {
                        let _ = app.emit("job://log", message.payload);
                    }
                }
            }
            Err(_) => {
                let _ = app.emit(
                    "job://log",
                    json!({
                        "taskId": job.task_id,
                        "level": "debug",
                        "message": line,
                    }),
                );
            }
        }
    }

    let exit_status = child.lock().wait();
    finalize_task_state(&state, &job.task_id);
    let cancelled = state.runtime.lock().cancelled.remove(&job.task_id);

    if !completed {
        if cancelled {
            let record = build_history_record(
                &job.task_id,
                &job.payload,
                &job.settings_snapshot,
                "cancelled",
                &job.created_at,
                Vec::new(),
                Some("任务已取消。".to_string()),
            );
            let _ = state.history.upsert(&record);
            emit_cancelled(&app, &job.task_id);
        } else if let Ok(status) = exit_status {
            if !status.success() {
                let message = format!("Worker exited with status: {status}");
                let record = build_history_record(
                    &job.task_id,
                    &job.payload,
                    &job.settings_snapshot,
                    "failed",
                    &job.created_at,
                    Vec::new(),
                    Some(message.clone()),
                );
                let _ = state.history.upsert(&record);
                let _ = app.emit(
                    "job://error",
                    json!({
                        "taskId": job.task_id,
                        "code": "WORKER_EXIT",
                        "message": message,
                    }),
                );
            }
        }
    }

    maybe_start_next_job(app, state);
}

fn read_worker_stderr(
    app: AppHandle,
    task_id: String,
    runtime: Arc<Mutex<RuntimeState>>,
    stderr: impl std::io::Read,
) {
    let reader = BufReader::new(stderr);
    for line in reader.lines() {
        let Ok(line) = line else {
            continue;
        };
        if line.trim().is_empty() {
            continue;
        }
        if runtime.lock().cancelled.contains(&task_id) {
            continue;
        }
        let _ = app.emit(
            "job://log",
            json!({
                "taskId": task_id,
                "level": "error",
                "message": line,
            }),
        );
    }
}

fn prepare_job(
    app: &AppHandle,
    payload: StartJobPayload,
    settings: AppSettings,
) -> Result<QueuedJob, String> {
    if payload.inputs.is_empty() {
        return Err("请先添加至少一个输入文件或文件夹。".to_string());
    }

    let missing_inputs = payload
        .inputs
        .iter()
        .filter(|item| !Path::new(item.as_str()).exists())
        .cloned()
        .collect::<Vec<_>>();
    if !missing_inputs.is_empty() {
        return Err(format!("以下输入路径不存在：{}", missing_inputs.join("；")));
    }

    let normalized = normalize_input_paths(&payload.inputs, &payload.job_type);
    if normalized.accepted.is_empty() {
        return Err("未找到可处理的输入文件。".to_string());
    }

    let output_dir = payload.output_dir.trim().to_string();
    if output_dir.is_empty() {
        return Err("请先设置输出目录。".to_string());
    }

    let settings_snapshot = settings_snapshot_for_payload(&settings, &payload);
    let ffmpeg_path = resolve_ffmpeg_path(
        app,
        payload
            .ffmpeg_path
            .as_deref()
            .or(settings_snapshot.ffmpeg_path.as_deref()),
    );
    let model_dir = payload
        .model_dir
        .clone()
        .or_else(|| settings_snapshot.model_path.clone())
        .unwrap_or_else(|| resolve_default_model_dir().to_string_lossy().to_string());

    let environment = detect_environment_for_paths(app, &ffmpeg_path, &model_dir)?;
    if requires_ffmpeg(&payload.job_type) && !environment.ffmpeg_available {
        return Err(
            "未检测到 ffmpeg。请在设置页配置 ffmpegPath，或把 ffmpeg 放进系统 PATH。".to_string(),
        );
    }
    if !environment.app_data_writable {
        return Err("应用数据目录不可写，请检查当前用户权限或磁盘状态。".to_string());
    }
    if requires_whisper_model(&payload.job_type) && !environment.model_exists {
        return Err("未检测到可用模型，请先在模型管理页安装模型，或选择已有模型目录。".to_string());
    }
    if payload.job_type == "image_ocr" && !environment.ocr_available {
        return Err("未检测到图片 OCR 依赖，请先执行 npm run setup:windows。".to_string());
    }

    let prepared_payload = StartJobPayload {
        job_type: payload.job_type,
        inputs: normalized.accepted,
        output_dir,
        output_mode: normalize_output_mode(&payload.output_mode),
        output_name: payload
            .output_name
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        model_name: if payload.model_name.trim().is_empty() {
            settings_snapshot.model_id.clone()
        } else {
            payload.model_name.trim().to_string()
        },
        model_dir: Some(model_dir),
        language: if payload.language.trim().is_empty() {
            settings_snapshot.language.clone()
        } else {
            payload.language.trim().to_string()
        },
        device: normalize_device(if payload.device.trim().is_empty() {
            &settings_snapshot.device_preference
        } else {
            &payload.device
        }),
        ffmpeg_path: Some(ffmpeg_path),
    };

    Ok(QueuedJob {
        task_id: Uuid::new_v4().to_string(),
        created_at: Utc::now().to_rfc3339(),
        payload: prepared_payload,
        settings_snapshot,
    })
}

fn settings_snapshot_for_payload(settings: &AppSettings, payload: &StartJobPayload) -> AppSettings {
    AppSettings {
        output_dir: if payload.output_dir.trim().is_empty() {
            settings.output_dir.clone()
        } else {
            payload.output_dir.trim().to_string()
        },
        model_id: if payload.model_name.trim().is_empty() {
            settings.model_id.clone()
        } else {
            payload.model_name.trim().to_string()
        },
        model_path: payload
            .model_dir
            .clone()
            .or_else(|| settings.model_path.clone()),
        language: if payload.language.trim().is_empty() {
            settings.language.clone()
        } else {
            payload.language.trim().to_string()
        },
        device_preference: normalize_device(if payload.device.trim().is_empty() {
            &settings.device_preference
        } else {
            &payload.device
        }),
        ffmpeg_path: payload
            .ffmpeg_path
            .clone()
            .or_else(|| settings.ffmpeg_path.clone()),
        temp_policy: settings.temp_policy.clone(),
        concurrency: 1,
    }
}

fn detect_environment_with_settings(
    app: &AppHandle,
    settings: &AppSettings,
) -> Result<EnvironmentInfo, String> {
    let model_dir = settings
        .model_path
        .clone()
        .unwrap_or_else(|| resolve_default_model_dir().to_string_lossy().to_string());
    let ffmpeg_path = resolve_ffmpeg_path(app, settings.ffmpeg_path.as_deref());
    detect_environment_for_paths(app, &ffmpeg_path, &model_dir)
}

fn detect_environment_for_paths(
    app: &AppHandle,
    ffmpeg_path: &str,
    model_dir: &str,
) -> Result<EnvironmentInfo, String> {
    let worker_info: WorkerEnvironmentInfo = run_worker_json(
        app,
        &[
            "detect-environment".to_string(),
            "--ffmpeg-path".to_string(),
            ffmpeg_path.to_string(),
            "--model-dir".to_string(),
            model_dir.to_string(),
        ],
    )?;

    let app_data_dir = resolve_app_data_dir(app)?;
    let app_data_writable = ensure_directory_writable(&app_data_dir);

    Ok(EnvironmentInfo {
        python_version: worker_info.python_version,
        device: worker_info.device,
        ffmpeg_available: worker_info.ffmpeg_available,
        ffmpeg_version: worker_info.ffmpeg_version,
        ocr_available: worker_info.ocr_available,
        ffmpeg_path: ffmpeg_path.to_string(),
        default_model_dir: worker_info.default_model_dir,
        model_exists: worker_info.model_exists,
        app_data_dir: app_data_dir.to_string_lossy().to_string(),
        app_data_writable,
    })
}

fn normalize_input_paths(paths: &[String], job_type: &str) -> NormalizeInputsResult {
    let mut accepted = Vec::new();
    let mut skipped = Vec::new();
    let mut seen = HashSet::new();

    for raw_path in paths {
        let path = PathBuf::from(raw_path);
        if !path.exists() {
            skipped.push(SkippedInput {
                path: raw_path.clone(),
                reason: "路径不存在".to_string(),
            });
            continue;
        }

        if path.is_file() {
            match normalize_file_path(&path, job_type, &mut seen) {
                Some(item) => accepted.push(item),
                None => skipped.push(SkippedInput {
                    path: raw_path.clone(),
                    reason: "不支持的文件类型".to_string(),
                }),
            }
            continue;
        }

        if path.is_dir() {
            let mut folder_hits = Vec::new();
            collect_supported_files(&path, job_type, &mut seen, &mut folder_hits);
            if folder_hits.is_empty() {
                skipped.push(SkippedInput {
                    path: raw_path.clone(),
                    reason: "文件夹内未找到支持的媒体文件".to_string(),
                });
            } else {
                accepted.extend(folder_hits);
            }
        }
    }

    NormalizeInputsResult { accepted, skipped }
}

fn collect_supported_files(
    dir: &Path,
    job_type: &str,
    seen: &mut HashSet<String>,
    accepted: &mut Vec<String>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    let mut paths = entries
        .filter_map(|entry| entry.ok().map(|value| value.path()))
        .collect::<Vec<_>>();
    paths.sort();

    for path in paths {
        if path.is_dir() {
            collect_supported_files(&path, job_type, seen, accepted);
        } else if let Some(item) = normalize_file_path(&path, job_type, seen) {
            accepted.push(item);
        }
    }
}

fn normalize_file_path(path: &Path, job_type: &str, seen: &mut HashSet<String>) -> Option<String> {
    if !is_supported_media(path, job_type) {
        return None;
    }

    let canonical = fs::canonicalize(path).ok()?;
    let canonical_string = canonical.to_string_lossy().to_string();
    if seen.insert(canonical_string.clone()) {
        Some(canonical_string)
    } else {
        None
    }
}

fn is_supported_media(path: &Path, job_type: &str) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    let audio = ["mp3", "wav", "m4a", "flac", "aac", "ogg"];
    let video = ["mp4", "mkv", "mov", "avi", "webm", "flv", "m4v"];
    let image = ["png", "jpg", "jpeg", "bmp", "webp", "tif", "tiff"];

    match job_type {
        "video_extract_audio" | "video_transcribe" => video.contains(&extension.as_str()),
        "image_ocr" => image.contains(&extension.as_str()),
        _ => audio.contains(&extension.as_str()) || extension == "mp4",
    }
}

fn build_history_record(
    task_id: &str,
    payload: &StartJobPayload,
    settings_snapshot: &AppSettings,
    status: &str,
    created_at: &str,
    outputs: Vec<String>,
    error: Option<String>,
) -> HistoryRecord {
    HistoryRecord {
        task_id: task_id.to_string(),
        r#type: payload.job_type.clone(),
        status: status.to_string(),
        created_at: created_at.to_string(),
        finished_at: Utc::now().to_rfc3339(),
        inputs: payload.inputs.clone(),
        output_dir: payload.output_dir.clone(),
        outputs,
        error,
        payload_json: payload.clone(),
        settings_snapshot: settings_snapshot.clone(),
    }
}

fn finalize_task_state(state: &DesktopState, task_id: &str) {
    let mut runtime = state.runtime.lock();
    runtime.running.remove(task_id);
    if runtime.active_task.as_deref() == Some(task_id) {
        runtime.active_task = None;
    }
}

fn emit_progress(
    app: &AppHandle,
    task_id: &str,
    stage: &str,
    percent: f64,
    current_file: Option<&str>,
    total_files: usize,
    message: &str,
    eta: Option<f64>,
) {
    let mut payload = json!({
        "taskId": task_id,
        "stage": stage,
        "percent": percent,
        "currentFile": current_file,
        "totalFiles": total_files,
        "message": message,
    });
    if let Some(eta) = eta {
        payload["eta"] = json!(eta);
    }
    let _ = app.emit("job://progress", payload);
}

fn emit_cancelled(app: &AppHandle, task_id: &str) {
    let _ = app.emit(
        "job://error",
        json!({
            "taskId": task_id,
            "code": "JOB_CANCELLED",
            "message": "任务已取消。",
        }),
    );
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

fn resolve_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

fn resolve_default_model_dir() -> PathBuf {
    if let Some(base) = dirs::data_local_dir() {
        let legacy = base.join("AudioToText").join("models");
        if legacy.exists() {
            return legacy;
        }
        return base.join("MultiConverter").join("models");
    }
    PathBuf::from("models")
}

fn resolve_ffmpeg_path(app: &AppHandle, configured: Option<&str>) -> String {
    if let Some(value) = configured {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

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

fn normalize_device(value: &str) -> String {
    match value.trim() {
        "cpu" => "cpu".to_string(),
        "cuda" => "cuda".to_string(),
        _ => "auto".to_string(),
    }
}

fn normalize_output_mode(value: &str) -> String {
    match value.trim() {
        "merged" => "merged".to_string(),
        _ => "separate".to_string(),
    }
}

fn requires_ffmpeg(job_type: &str) -> bool {
    job_type == "video_extract_audio"
}

fn requires_whisper_model(job_type: &str) -> bool {
    matches!(job_type, "audio_transcribe" | "video_transcribe")
}

fn ensure_directory_writable(path: &Path) -> bool {
    if fs::create_dir_all(path).is_err() {
        return false;
    }

    let probe_path = path.join(".write_test");
    match fs::write(&probe_path, b"ok") {
        Ok(_) => {
            let _ = fs::remove_file(probe_path);
            true
        }
        Err(_) => false,
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
            loadSettings,
            saveSettings,
            ensureModel,
            listHistory,
            normalizeInputs,
            startJob,
            rerunHistory,
            cancelJob,
            openPath
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
