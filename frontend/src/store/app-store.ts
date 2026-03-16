import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  desktopMode,
  detectRuntimeEnvironment,
  dispatchJob,
  ensureRuntimeModel,
  fetchHistory,
  openPathWithSystem,
  pickInputFiles,
  pickInputFolders,
  pickOutputDirectory,
  revealPath,
  stopJob,
  subscribeToJobEvents,
} from "../lib/tauri";
import type {
  AppSettings,
  DraftJob,
  EnvironmentInfo,
  HistoryRecord,
  JobLog,
  JobProgress,
  JobRecord,
  JobType,
  ModelInfo,
  StartJobPayload,
  ViewName,
} from "../lib/types";

const defaultSettings: AppSettings = {
  defaultOutputDir: "",
  language: "zh",
  modelName: "medium",
  device: "auto",
  concurrency: 1,
  tempPolicy: "cleanup",
};

const initialDraft: DraftJob = {
  jobType: "audio_transcribe",
  inputs: [],
  outputDir: "",
};

const starterModels: ModelInfo[] = [
  {
    id: "medium",
    name: "Whisper Medium",
    description: "精度与速度的默认平衡点，适合作为首发模型。",
    sizeLabel: "~5 GB VRAM / 本地缓存",
    status: "missing",
  },
  {
    id: "small",
    name: "Whisper Small",
    description: "显存更紧张的电脑可以切换到它，速度更稳一些。",
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
  lastError: string | null;
  setActiveView: (view: ViewName) => void;
  initialize: () => Promise<void>;
  connectEvents: () => Promise<void>;
  addInputPaths: (paths: string[]) => void;
  chooseInputFiles: () => Promise<void>;
  chooseInputFolders: () => Promise<void>;
  removeInputPath: (path: string) => void;
  setDraftJobType: (jobType: JobType) => void;
  chooseOutputDir: () => Promise<void>;
  saveSettings: (settings: AppSettings) => void;
  startDraftJob: () => Promise<void>;
  cancelActiveJob: (taskId: string) => Promise<void>;
  ensureDefaultModel: (modelId: string) => Promise<void>;
  openOutputPath: (path: string) => Promise<void>;
  revealOutputPath: (path: string) => Promise<void>;
}

let unsubscribeEvents: (() => void) | null = null;
const mockTimers = new Map<string, ReturnType<typeof setInterval>>();

function now() {
  return new Date().toISOString();
}

function buildProgress(taskId: string, message: string): JobProgress {
  return {
    taskId,
    stage: "queued",
    percent: 0,
    currentFile: null,
    totalFiles: 0,
    message,
  };
}

function upsertHistory(current: HistoryRecord[], record: HistoryRecord) {
  return [record, ...current.filter((item) => item.taskId !== record.taskId)].slice(0, 24);
}

function addLog(job: JobRecord, level: JobLog["level"], message: string): JobRecord {
  return {
    ...job,
    updatedAt: now(),
    logs: [...job.logs, { at: now(), level, message }].slice(-200),
  };
}

async function runMockJob(payload: StartJobPayload) {
  const taskId = `mock-${Date.now()}`;
  const steps = [
    { percent: 8, stage: "preparing", message: "准备输入文件..." },
    {
      percent: 28,
      stage: payload.jobType === "video_extract_audio" ? "extracting_audio" : "transcribing",
      message: "启动本地引擎...",
    },
    {
      percent: 57,
      stage: payload.jobType === "video_extract_audio" ? "extracting_audio" : "transcribing",
      message: "处理第一个文件...",
    },
    {
      percent: 81,
      stage: payload.jobType === "video_extract_audio" ? "extracting_audio" : "transcribing",
      message: "写入输出结果...",
    },
    { percent: 100, stage: "finalizing", message: "任务完成。" },
  ];

  let stepIndex = 0;
  const interval = setInterval(() => {
    const state = useAppStore.getState();
    const job = state.jobs.find((item) => item.taskId === taskId);
    if (!job) {
      clearInterval(interval);
      mockTimers.delete(taskId);
      return;
    }

    const step = steps[Math.min(stepIndex, steps.length - 1)];
    const updatedJob: JobRecord = addLog(
      {
        ...job,
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
    );

    const jobs = state.jobs.map((item) => (item.taskId === taskId ? updatedJob : item));
    const nextState: Partial<AppStore> = { jobs };
    if (step.percent >= 100) {
      clearInterval(interval);
      mockTimers.delete(taskId);
      const outputs = payload.inputs.map((item) =>
        payload.jobType === "video_extract_audio"
          ? `${payload.outputDir}\\${item.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, ".mp3")}`
          : `${payload.outputDir}\\${item.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, ".txt")}`,
      );
      nextState.history = upsertHistory(state.history, {
        taskId,
        type: payload.jobType,
        status: "succeeded",
        createdAt: job.createdAt,
        finishedAt: now(),
        inputs: payload.inputs,
        outputDir: payload.outputDir,
        outputs,
      });
      nextState.jobs = jobs.map((item) =>
        item.taskId === taskId
          ? {
              ...updatedJob,
              outputs,
            }
          : item,
      );
    }

    useAppStore.setState(nextState);
    stepIndex += 1;
  }, 900);

  mockTimers.set(taskId, interval);
  return { taskId };
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      activeView: "workbench",
      initialized: false,
      busy: false,
      environment: null,
      settings: defaultSettings,
      draft: initialDraft,
      jobs: [],
      history: [],
      models: starterModels,
      lastError: null,
      setActiveView: (view) => set({ activeView: view }),
      initialize: async () => {
        if (get().initialized) {
          return;
        }

        set({ busy: true, lastError: null });
        try {
          const [environment, history] = await Promise.all([
            detectRuntimeEnvironment(),
            fetchHistory(),
          ]);

          set({
            initialized: true,
            busy: false,
            environment,
            history,
            draft: {
              ...get().draft,
              outputDir: get().draft.outputDir || get().settings.defaultOutputDir,
            },
            models: get().models.map((model) =>
              model.id === "medium"
                ? {
                    ...model,
                    status: environment.modelExists ? "available" : "missing",
                    location: environment.modelExists ? environment.defaultModelDir : undefined,
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
            set({
              jobs: get().jobs.map((job) =>
                job.taskId === payload.taskId
                  ? {
                      ...job,
                      status: "running",
                      updatedAt: now(),
                      progress: payload,
                    }
                  : job,
              ),
            });
          },
          onLog: (payload) => {
            set({
              jobs: get().jobs.map((job) =>
                job.taskId === payload.taskId ? addLog(job, payload.level, payload.message) : job,
              ),
            });
          },
          onDone: (payload) => {
            const state = get();
            const job = state.jobs.find((item) => item.taskId === payload.taskId);
            if (!job) {
              return;
            }
            const completed: JobRecord = {
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
            };
            set({
              jobs: state.jobs.map((item) => (item.taskId === payload.taskId ? completed : item)),
              history: upsertHistory(state.history, {
                taskId: job.taskId,
                type: job.type,
                status: "succeeded",
                createdAt: job.createdAt,
                finishedAt: now(),
                inputs: job.inputs,
                outputDir: job.outputDir,
                outputs: payload.outputs,
              }),
            });
          },
          onError: (payload) => {
            const state = get();
            const job = state.jobs.find((item) => item.taskId === payload.taskId);
            if (!job) {
              return;
            }
            const failed: JobRecord = addLog(
              {
                ...job,
                status: "failed",
                updatedAt: now(),
                error: payload.message,
              },
              "error",
              payload.message,
            );
            set({
              lastError: payload.message,
              jobs: state.jobs.map((item) => (item.taskId === payload.taskId ? failed : item)),
              history: upsertHistory(state.history, {
                taskId: job.taskId,
                type: job.type,
                status: "failed",
                createdAt: job.createdAt,
                finishedAt: now(),
                inputs: job.inputs,
                outputDir: job.outputDir,
                outputs: [],
                error: payload.message,
              }),
            });
          },
        });
      },
      addInputPaths: (paths) => {
        const deduped = [...new Set([...get().draft.inputs, ...paths])];
        set({ draft: { ...get().draft, inputs: deduped } });
      },
      chooseInputFiles: async () => {
        const paths = await pickInputFiles();
        if (paths.length) {
          get().addInputPaths(paths);
        }
      },
      chooseInputFolders: async () => {
        const paths = await pickInputFolders();
        if (paths.length) {
          get().addInputPaths(paths);
        }
      },
      removeInputPath: (path) => {
        set({
          draft: {
            ...get().draft,
            inputs: get().draft.inputs.filter((item) => item !== path),
          },
        });
      },
      setDraftJobType: (jobType) => set({ draft: { ...get().draft, jobType } }),
      chooseOutputDir: async () => {
        const path = await pickOutputDirectory(
          get().draft.outputDir || get().settings.defaultOutputDir,
        );
        if (path) {
          set({ draft: { ...get().draft, outputDir: path } });
        }
      },
      saveSettings: (settings) => {
        set({
          settings,
          draft: {
            ...get().draft,
            outputDir: get().draft.outputDir || settings.defaultOutputDir,
          },
        });
      },
      startDraftJob: async () => {
        const state = get();
        if (state.jobs.some((job) => job.status === "running" || job.status === "queued")) {
          set({ lastError: "当前默认只允许一个任务运行，请等待队列完成。" });
          return;
        }
        if (!state.draft.inputs.length) {
          set({ lastError: "请先添加至少一个输入文件或文件夹。" });
          return;
        }

        const outputDir =
          state.draft.outputDir ||
          state.settings.defaultOutputDir ||
          state.environment?.defaultModelDir ||
          "";
        if (!outputDir) {
          set({ lastError: "请先设置输出目录。" });
          return;
        }

        const payload: StartJobPayload = {
          jobType: state.draft.jobType,
          inputs: state.draft.inputs,
          outputDir,
          modelName: state.settings.modelName,
          modelDir: state.environment?.defaultModelDir,
          language: state.settings.language,
          device: state.settings.device,
        };

        const taskId = desktopMode
          ? (await dispatchJob(payload)).taskId
          : (await runMockJob(payload)).taskId;
        const newJob: JobRecord = {
          taskId,
          type: payload.jobType,
          status: desktopMode ? "queued" : "running",
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
          draft: { ...state.draft, outputDir },
          jobs: [newJob, ...state.jobs].slice(0, 12),
        });
      },
      cancelActiveJob: async (taskId) => {
        if (desktopMode) {
          await stopJob(taskId);
        } else {
          const timer = mockTimers.get(taskId);
          if (timer) {
            clearInterval(timer);
            mockTimers.delete(taskId);
          }
        }
        set({
          jobs: get().jobs.map((job) =>
            job.taskId === taskId
              ? addLog(
                  {
                    ...job,
                    status: "cancelled",
                    updatedAt: now(),
                    error: "任务已取消。",
                  },
                  "warning",
                  "任务已取消。",
                )
              : job,
          ),
        });
      },
      ensureDefaultModel: async (modelId) => {
        set({
          busy: true,
          models: get().models.map((model) =>
            model.id === modelId ? { ...model, status: "downloading" } : model,
          ),
        });
        try {
          const result = await ensureRuntimeModel(modelId, get().environment?.defaultModelDir);
          set({
            busy: false,
            environment: get().environment
              ? {
                  ...get().environment!,
                  modelExists: true,
                  defaultModelDir: result.modelDir,
                }
              : null,
            models: get().models.map((model) =>
              model.id === modelId
                ? {
                    ...model,
                    status: "available",
                    location: result.modelDir,
                  }
                : model,
            ),
          });
        } catch (error) {
          set({
            busy: false,
            lastError: error instanceof Error ? error.message : "模型安装失败。",
            models: get().models.map((model) =>
              model.id === modelId ? { ...model, status: "missing" } : model,
            ),
          });
        }
      },
      openOutputPath: async (path) => {
        await openPathWithSystem(path);
      },
      revealOutputPath: async (path) => {
        await revealPath(path);
      },
    }),
    {
      name: "audio-to-text-app-store",
      partialize: (state) => ({
        activeView: state.activeView,
        settings: state.settings,
      }),
    },
  ),
);
