import { create } from "zustand";

import {
  desktopMode,
  detectRuntimeEnvironment,
  dispatchJob,
  ensureRuntimeModel,
  fetchHistory,
  loadAppSettings,
  openPathWithSystem,
  rerunHistoryJob as rerunHistoryJobRequest,
  revealPath,
  saveAppSettings,
  selectDirectory,
  selectInputs,
  selectOutputDir,
  stopJob,
  subscribeToInputDrops,
  subscribeToJobEvents,
} from "../lib/tauri";
import type {
  AppSettings,
  DraftJob,
  EnvironmentInfo,
  HistoryRecord,
  InputSelectionResult,
  JobLog,
  JobProgress,
  JobRecord,
  JobType,
  ModelInfo,
  StartJobPayload,
  ViewName,
} from "../lib/types";

const defaultSettings: AppSettings = {
  outputDir: "",
  modelId: "medium",
  language: "zh",
  devicePreference: "auto",
  tempPolicy: "cleanup_after_success",
  concurrency: 1,
};

const initialDraft: DraftJob = {
  jobType: "image_ocr",
  inputs: [],
  outputDir: "",
  outputMode: "separate",
  outputName: "",
};

const starterModels: ModelInfo[] = [
  {
    id: "medium",
    name: "Whisper Medium",
    description: "默认模型。",
    sizeLabel: "~5 GB VRAM / 本地缓存",
    status: "missing",
  },
  {
    id: "small",
    name: "Whisper Small",
    description: "更轻量。",
    sizeLabel: "~2 GB VRAM / 本地缓存",
    status: "missing",
  },
];

interface AppStore {
  activeView: ViewName;
  initialized: boolean;
  busy: boolean;
  environment: EnvironmentInfo | null;
  settings: AppSettings;
  draft: DraftJob;
  jobs: JobRecord[];
  history: HistoryRecord[];
  models: ModelInfo[];
  draftWarnings: string[];
  lastError: string | null;
  setActiveView: (view: ViewName) => void;
  initialize: () => Promise<void>;
  connectEvents: () => Promise<void>;
  connectInputDrops: () => Promise<void>;
  addSelectionResult: (result: InputSelectionResult) => void;
  chooseInputFiles: () => Promise<void>;
  chooseInputFolders: () => Promise<void>;
  removeInputPath: (path: string) => void;
  moveInputPath: (path: string, direction: "up" | "down") => void;
  reorderInputPath: (sourcePath: string, targetPath: string) => void;
  setDraftJobType: (jobType: JobType) => void;
  setDraftOutputMode: (mode: "separate" | "merged") => void;
  setDraftOutputName: (value: string) => void;
  chooseOutputDir: () => Promise<void>;
  chooseModelDir: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  startDraftJob: () => Promise<void>;
  resetDraft: () => void;
  cancelJob: (taskId: string) => Promise<void>;
  rerunHistoryJob: (taskId: string) => Promise<void>;
  ensureDefaultModel: (modelId: string, localPath?: string) => Promise<void>;
  refreshHistory: () => Promise<void>;
  openOutputPath: (path: string) => Promise<void>;
  revealOutputPath: (path: string) => Promise<void>;
}

let unsubscribeEvents: (() => void) | null = null;
let unsubscribeDropEvents: (() => void) | null = null;
const mockTimers = new Map<string, ReturnType<typeof setInterval>>();

function now() {
  return new Date().toISOString();
}

function buildProgress(taskId: string, message: string): JobProgress {
  return {
    taskId,
    stage: "queueing",
    percent: 0,
    currentFile: null,
    totalFiles: 0,
    message,
  };
}

function addLog(job: JobRecord, level: JobLog["level"], message: string): JobRecord {
  return {
    ...job,
    updatedAt: now(),
    logs: [...job.logs, { at: now(), level, message }].slice(-200),
  };
}

function patchJob(taskId: string, updater: (job: JobRecord) => JobRecord) {
  useAppStore.setState((state) => ({
    jobs: state.jobs.map((job) => (job.taskId === taskId ? updater(job) : job)),
  }));
}

async function runMockJob(payload: StartJobPayload) {
  const taskId = `mock-${Date.now()}`;
  const steps = [
    { percent: 10, stage: "preflight", message: "检查本地环境..." },
    { percent: 30, stage: "queueing", message: "开始处理第一批文件..." },
    {
      percent: 66,
      stage:
        payload.jobType === "video_extract_audio"
          ? "extracting"
          : payload.jobType === "image_ocr"
            ? "recognizing"
            : "transcribing",
      message: payload.jobType === "image_ocr" ? "识别图片文字..." : "处理文件...",
    },
    { percent: 92, stage: "writing", message: "写入输出文件..." },
    { percent: 100, stage: "completed", message: "任务完成。" },
  ] as const;

  let index = 0;
  const timer = setInterval(() => {
    const state = useAppStore.getState();
    const job = state.jobs.find((item) => item.taskId === taskId);
    if (!job) {
      clearInterval(timer);
      mockTimers.delete(taskId);
      return;
    }

    const step = steps[Math.min(index, steps.length - 1)];
    patchJob(taskId, (current) =>
      addLog(
        {
          ...current,
          status: step.percent >= 100 ? "succeeded" : "running",
          progress: {
            taskId,
            stage: step.stage,
            percent: step.percent,
            currentFile: payload.inputs[0] ?? null,
            totalFiles: payload.inputs.length,
            message: step.message,
          },
        },
        "info",
        step.message,
      ),
    );

    if (step.percent >= 100) {
      clearInterval(timer);
      mockTimers.delete(taskId);
      const outputs = buildMockOutputs(payload);
      useAppStore.setState((current) => ({
        jobs: current.jobs.map((jobItem) =>
          jobItem.taskId === taskId ? { ...jobItem, outputs } : jobItem,
        ),
        history: [
          {
            taskId,
            type: payload.jobType,
            status: "succeeded",
            createdAt: job.createdAt,
            finishedAt: now(),
            inputs: payload.inputs,
            outputDir: payload.outputDir,
            outputs,
            payloadJson: payload,
            settingsSnapshot: current.settings,
          } satisfies HistoryRecord,
          ...current.history.filter((item) => item.taskId !== taskId),
        ].slice(0, 50),
      }));
    }

    index += 1;
  }, 900);

  mockTimers.set(taskId, timer);
  return { taskId };
}

export const useAppStore = create<AppStore>((set, get) => ({
  activeView: "workbench",
  initialized: false,
  busy: false,
  environment: null,
  settings: defaultSettings,
  draft: initialDraft,
  jobs: [],
  history: [],
  models: starterModels,
  draftWarnings: [],
  lastError: null,
  setActiveView: (view) => set({ activeView: view }),
  initialize: async () => {
    if (get().initialized) {
      return;
    }

    set({ busy: true, lastError: null });
    try {
      const [settings, environment, history] = await Promise.all([
        loadAppSettings(),
        detectRuntimeEnvironment(),
        fetchHistory(),
      ]);

      set({
        initialized: true,
        busy: false,
        settings,
        environment,
        history,
        draft: {
          ...get().draft,
          outputDir: get().draft.outputDir || settings.outputDir,
        },
        models: get().models.map((model) =>
          model.id === settings.modelId || model.id === "medium"
            ? {
                ...model,
                status: environment.modelExists ? "available" : "missing",
                location: settings.modelPath || environment.defaultModelDir,
              }
            : model,
        ),
      });
    } catch (error) {
      set({
        busy: false,
        lastError:
          error instanceof Error ? error.message : "初始化桌面环境失败，请检查依赖。",
      });
    }
  },
  connectEvents: async () => {
    if (unsubscribeEvents) {
      return;
    }

    unsubscribeEvents = await subscribeToJobEvents({
      onProgress: (payload) => {
        patchJob(payload.taskId, (job) => ({
          ...job,
          status: job.status === "cancelled" ? "cancelled" : "running",
          updatedAt: now(),
          progress: payload,
        }));
      },
      onLog: (payload) => {
        patchJob(payload.taskId, (job) => addLog(job, payload.level, payload.message));
      },
      onDone: (payload) => {
        patchJob(payload.taskId, (job) => ({
          ...addLog(
            {
              ...job,
              status: "succeeded",
              updatedAt: now(),
              outputs: payload.outputs,
              progress: {
                ...job.progress,
                percent: 100,
                stage: "completed",
                message: "任务完成。",
              },
            },
            "info",
            "任务完成。",
          ),
        }));
        void get().refreshHistory();
      },
      onError: (payload) => {
        const cancelled = payload.code === "JOB_CANCELLED";
        patchJob(payload.taskId, (job) =>
          addLog(
            {
              ...job,
              status: cancelled ? "cancelled" : "failed",
              updatedAt: now(),
              error: payload.message,
            },
            cancelled ? "warning" : "error",
            payload.message,
          ),
        );
        set({ lastError: cancelled ? null : payload.message });
        void get().refreshHistory();
      },
    });
  },
  connectInputDrops: async () => {
    if (unsubscribeDropEvents) {
      return;
    }

    unsubscribeDropEvents = await subscribeToInputDrops(
      (result) => {
        get().addSelectionResult(result);
      },
      () => useAppStore.getState().draft.jobType,
    );
  },
  addSelectionResult: (result) => {
    const deduped = [...new Set([...get().draft.inputs, ...result.accepted])];
    set({
      draft: { ...get().draft, inputs: deduped },
      draftWarnings: result.skipped.map((item) => `${item.path}: ${item.reason}`),
      lastError:
        result.accepted.length === 0 && result.skipped.length
          ? "没有可加入的有效文件。"
          : null,
    });
  },
  chooseInputFiles: async () => {
    const result = await selectInputs("files", get().draft.jobType);
    get().addSelectionResult(result);
  },
  chooseInputFolders: async () => {
    const result = await selectInputs("directories", get().draft.jobType);
    get().addSelectionResult(result);
  },
  removeInputPath: (path) => {
    set({
      draft: {
        ...get().draft,
        inputs: get().draft.inputs.filter((item) => item !== path),
      },
    });
  },
  moveInputPath: (path, direction) => {
    const inputs = [...get().draft.inputs];
    const currentIndex = inputs.findIndex((item) => item === path);
    if (currentIndex < 0) {
      return;
    }

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= inputs.length) {
      return;
    }

    [inputs[currentIndex], inputs[nextIndex]] = [inputs[nextIndex]!, inputs[currentIndex]!];
    set({
      draft: {
        ...get().draft,
        inputs,
      },
    });
  },
  reorderInputPath: (sourcePath, targetPath) => {
    if (sourcePath === targetPath) {
      return;
    }

    const inputs = [...get().draft.inputs];
    const sourceIndex = inputs.findIndex((item) => item === sourcePath);
    const targetIndex = inputs.findIndex((item) => item === targetPath);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const [moved] = inputs.splice(sourceIndex, 1);
    inputs.splice(targetIndex, 0, moved!);

    set({
      draft: {
        ...get().draft,
        inputs,
      },
    });
  },
  setDraftJobType: (jobType) =>
    set({
      draft: { ...get().draft, jobType, inputs: [] },
      draftWarnings: [],
      lastError: null,
    }),
  setDraftOutputMode: (mode) =>
    set({
      draft: {
        ...get().draft,
        outputMode: mode,
      },
    }),
  setDraftOutputName: (value) =>
    set({
      draft: {
        ...get().draft,
        outputName: value,
      },
    }),
  chooseOutputDir: async () => {
    const path = await selectOutputDir(get().draft.outputDir || get().settings.outputDir);
    if (path) {
      set({ draft: { ...get().draft, outputDir: path } });
    }
  },
  chooseModelDir: async () => {
    const path = await selectDirectory("选择本地模型目录", get().settings.modelPath);
    if (!path) {
      return;
    }
    const nextSettings = { ...get().settings, modelPath: path };
    const saved = await saveAppSettings(nextSettings);
    const environment = await detectRuntimeEnvironment();
    set({
      settings: saved,
      environment,
      models: get().models.map((model) =>
        model.id === saved.modelId ? { ...model, location: path } : model,
      ),
    });
  },
  saveSettings: async (settings) => {
    const saved = await saveAppSettings(settings);
    const environment = await detectRuntimeEnvironment();
    set({
      settings: saved,
      environment,
      draft: {
        ...get().draft,
        outputDir: get().draft.outputDir || saved.outputDir,
      },
      lastError: null,
    });
  },
  startDraftJob: async () => {
    const state = get();
    if (!state.draft.inputs.length) {
      set({ lastError: "请先添加至少一个输入文件或文件夹。" });
      return;
    }

    let outputDir = state.draft.outputDir || state.settings.outputDir;
    if (!outputDir) {
      outputDir = await selectOutputDir();
      if (!outputDir) {
        set({ lastError: "请先设置输出目录。" });
        return;
      }
      set({ draft: { ...state.draft, outputDir } });
    }

    const payload: StartJobPayload = {
      jobType: state.draft.jobType,
      inputs: state.draft.inputs,
      outputDir,
      outputMode: state.draft.outputMode,
      outputName: state.draft.outputName.trim() || undefined,
      modelName: state.settings.modelId,
      modelDir: state.settings.modelPath,
      language: state.settings.language,
      device: state.settings.devicePreference,
      ffmpegPath: state.settings.ffmpegPath,
    };

    let taskId: string;
    try {
      taskId = desktopMode
        ? (await dispatchJob(payload)).taskId
        : (await runMockJob(payload)).taskId;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "创建任务失败，请检查模型、ffmpeg 和输出目录设置。";
      set({ lastError: message });
      return;
    }

    const newJob: JobRecord = {
      taskId,
      type: payload.jobType,
      outputMode: payload.outputMode,
      outputName: payload.outputName,
      status: "queued",
      createdAt: now(),
      updatedAt: now(),
      inputs: payload.inputs,
      outputDir,
      outputs: [],
      progress: buildProgress(taskId, "任务已创建，等待开始。"),
      logs: [
        {
          at: now(),
          level: "info",
          message: `已加入任务队列，共 ${payload.inputs.length} 项输入。`,
        },
      ],
    };

    set({
      lastError: null,
      jobs: [newJob, ...state.jobs].slice(0, 24),
      draft: {
        ...state.draft,
        inputs: [],
        outputDir,
        outputName: "",
      },
      draftWarnings: [],
    });
  },
  resetDraft: () =>
    set((state) => ({
      draft: {
        ...state.draft,
        inputs: [],
        outputDir: state.draft.outputDir || state.settings.outputDir,
        outputMode: "separate",
        outputName: "",
      },
      draftWarnings: [],
      lastError: null,
    })),
  cancelJob: async (taskId) => {
    if (desktopMode) {
      await stopJob(taskId);
    } else {
      const timer = mockTimers.get(taskId);
      if (timer) {
        clearInterval(timer);
        mockTimers.delete(taskId);
      }
    }
    patchJob(taskId, (job) =>
      addLog(
        {
          ...job,
          status: "cancelled",
          updatedAt: now(),
          error: "任务已取消。",
        },
        "warning",
        "任务已取消。",
      ),
    );
  },
  rerunHistoryJob: async (taskId) => {
    const history = get().history.find((item) => item.taskId === taskId);
    if (!history) {
      set({ lastError: "未找到可重跑的历史任务。" });
      return;
    }

    const nextTaskId = desktopMode
      ? (await rerunHistoryJobRequest(taskId)).taskId
      : `mock-rerun-${Date.now()}`;
    const payload = history.payloadJson;
    const queuedJob: JobRecord = {
      taskId: nextTaskId,
      type: payload.jobType,
      outputMode: payload.outputMode,
      outputName: payload.outputName,
      status: "queued",
      createdAt: now(),
      updatedAt: now(),
      inputs: payload.inputs,
      outputDir: payload.outputDir,
      outputs: [],
      progress: buildProgress(nextTaskId, "历史任务已重新加入队列。"),
      logs: [
        {
          at: now(),
          level: "info",
          message: "历史任务已重新加入队列。",
        },
      ],
    };

    set({
      jobs: [queuedJob, ...get().jobs].slice(0, 24),
      lastError: null,
    });

    if (!desktopMode) {
      void runMockJob(payload);
    }
  },
  ensureDefaultModel: async (modelId, localPath) => {
    set({
      busy: true,
      models: get().models.map((model) =>
        model.id === modelId ? { ...model, status: "downloading" } : model,
      ),
    });
    try {
      const result = await ensureRuntimeModel(modelId, localPath ?? get().settings.modelPath);
      const nextSettings = await saveAppSettings({
        ...get().settings,
        modelId,
        modelPath: result.modelDir,
      });
      const environment = await detectRuntimeEnvironment();
      set({
        busy: false,
        settings: nextSettings,
        environment,
        models: get().models.map((model) =>
          model.id === modelId
            ? {
                ...model,
                status: "available",
                location: result.modelDir,
              }
            : model,
        ),
        lastError: null,
      });
    } catch (error) {
      set({
        busy: false,
        lastError:
          error instanceof Error
            ? `${error.message}。请先确认模型目录可写，或手动选择已有模型目录。`
            : "模型安装失败，请检查本地目录和依赖。",
        models: get().models.map((model) =>
          model.id === modelId ? { ...model, status: "missing" } : model,
        ),
      });
    }
  },
  refreshHistory: async () => {
    const history = await fetchHistory();
    set({ history });
  },
  openOutputPath: async (path) => {
    await openPathWithSystem(path);
  },
  revealOutputPath: async (path) => {
    await revealPath(path);
  },
}));

function buildMockOutputs(payload: StartJobPayload) {
  const extension = payload.jobType === "video_extract_audio" ? ".mp3" : ".txt";
  const makeBase = (value: string) => value.replace(/[\\/:*?"<>|]+/g, "_").trim() || "output";
  const withExtension = (value: string) =>
    value.toLowerCase().endsWith(extension) ? value : `${value}${extension}`;

  if (payload.outputMode === "merged") {
    const mergedName = withExtension(makeBase(payload.outputName || defaultMergedName(payload.jobType)));
    return [`${payload.outputDir}\\${mergedName}`];
  }

  const outputName = payload.outputName?.trim();
  if (!outputName) {
    return payload.inputs.map((item) =>
      payload.jobType === "video_extract_audio"
        ? `${payload.outputDir}\\${item.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, ".mp3")}`
        : `${payload.outputDir}\\${item.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, ".txt")}`,
    );
  }

  const baseName = makeBase(outputName.replace(/\.[^.]+$/, ""));
  return payload.inputs.map((_item, index) => {
    const suffix = payload.inputs.length > 1 ? `_${String(index + 1).padStart(2, "0")}` : "";
    return `${payload.outputDir}\\${withExtension(`${baseName}${suffix}`)}`;
  });
}

function defaultMergedName(jobType: JobType) {
  switch (jobType) {
    case "video_extract_audio":
      return "merged_audio";
    case "image_ocr":
      return "merged_ocr";
    case "audio_transcribe":
    case "video_transcribe":
      return "merged_text";
    default:
      return "merged_output";
  }
}
