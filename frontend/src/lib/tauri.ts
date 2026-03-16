import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type {
  AppSettings,
  EnvironmentInfo,
  HistoryRecord,
  InputSelectionResult,
  JobLog,
  JobProgress,
  JobType,
  StartJobPayload,
} from "./types";

export const desktopMode = isTauri();

const mediaExtensions = [
  "mp3",
  "wav",
  "m4a",
  "flac",
  "aac",
  "ogg",
  "mp4",
  "mkv",
  "mov",
  "avi",
  "webm",
  "flv",
  "m4v",
  "png",
  "jpg",
  "jpeg",
  "bmp",
  "webp",
  "tif",
  "tiff",
];

export interface JobDoneEvent {
  taskId: string;
  outputs: string[];
  summary: {
    jobType: string;
    totalFiles: number;
    outputDir: string;
    outputs: string[];
  };
}

export interface JobErrorEvent {
  taskId: string;
  code: string;
  message: string;
  details?: string;
}

export async function selectInputs(
  mode: "files" | "directories",
  jobType: JobType,
): Promise<InputSelectionResult> {
  if (!desktopMode) {
    return { accepted: [], skipped: [] };
  }

  const result = await open({
    title: mode === "files" ? "选择输入文件" : "选择待处理文件夹",
    multiple: true,
    directory: mode === "directories",
    recursive: mode === "directories",
    filters:
      mode === "files"
        ? [
            {
              name: "Supported",
              extensions: mediaExtensions,
            },
          ]
        : undefined,
  });

  const paths = !result ? [] : Array.isArray(result) ? result : [result];
  return normalizeInputs(paths, jobType);
}

export async function normalizeInputs(
  paths: string[],
  jobType: JobType,
): Promise<InputSelectionResult> {
  if (!paths.length) {
    return { accepted: [], skipped: [] };
  }

  if (!desktopMode) {
    return { accepted: paths, skipped: [] };
  }

  return invoke<InputSelectionResult>("normalizeInputs", {
    paths,
    jobType,
  });
}

export async function selectOutputDir(defaultPath?: string) {
  if (!desktopMode) {
    return "";
  }
  const result = await open({
    title: "选择输出目录",
    directory: true,
    defaultPath,
  });
  return typeof result === "string" ? result : "";
}

export async function selectDirectory(title: string, defaultPath?: string) {
  if (!desktopMode) {
    return "";
  }
  const result = await open({
    title,
    directory: true,
    defaultPath,
  });
  return typeof result === "string" ? result : "";
}

export async function detectRuntimeEnvironment() {
  if (!desktopMode) {
    return {
      pythonVersion: "3.13.11",
      device: "cuda",
      ffmpegAvailable: true,
      ffmpegVersion: "mock ffmpeg runtime",
      ocrAvailable: true,
      ffmpegPath: "ffmpeg",
      defaultModelDir: "C:\\Users\\You\\AppData\\Local\\MultiConverter\\models",
      modelExists: false,
      appDataDir: "C:\\Users\\You\\AppData\\Local\\MultiConverter",
      appDataWritable: true,
    } satisfies EnvironmentInfo;
  }
  return invoke<EnvironmentInfo>("detectEnvironment");
}

export async function loadAppSettings() {
  if (!desktopMode) {
    return {
      outputDir: "",
      modelId: "medium",
      language: "zh",
      devicePreference: "auto",
      tempPolicy: "cleanup_after_success",
      concurrency: 1,
    } satisfies AppSettings;
  }
  return invoke<AppSettings>("loadSettings");
}

export async function saveAppSettings(settings: AppSettings) {
  if (!desktopMode) {
    return settings;
  }
  return invoke<AppSettings>("saveSettings", { settings });
}

export async function ensureRuntimeModel(modelId: string, localPath?: string) {
  if (!desktopMode) {
    return {
      modelName: modelId,
      device: "cuda",
      modelDir: localPath ?? "C:\\Users\\You\\AppData\\Local\\MultiConverter\\models",
      modelPath: `${localPath ?? "C:\\Users\\You\\AppData\\Local\\MultiConverter\\models"}\\${modelId}`,
    };
  }
  return invoke<{
    modelName: string;
    device: string;
    modelDir: string;
    modelPath: string;
  }>("ensureModel", {
    payload: {
      modelId,
      localPath,
    },
  });
}

export async function fetchHistory() {
  if (!desktopMode) {
    return [] satisfies HistoryRecord[];
  }
  return invoke<HistoryRecord[]>("listHistory");
}

export async function dispatchJob(payload: StartJobPayload) {
  if (!desktopMode) {
    return { taskId: `mock-${Date.now()}` };
  }
  return invoke<{ taskId: string }>("startJob", { payload });
}

export async function rerunHistoryJob(taskId: string) {
  if (!desktopMode) {
    return { taskId: `mock-rerun-${Date.now()}` };
  }
  return invoke<{ taskId: string }>("rerunHistory", { taskId });
}

export async function stopJob(taskId: string) {
  if (!desktopMode) {
    return;
  }
  await invoke("cancelJob", { taskId });
}

export async function revealPath(path: string) {
  if (!desktopMode) {
    return;
  }
  await revealItemInDir(path);
}

export async function openPathWithSystem(path: string) {
  if (!desktopMode) {
    return;
  }
  await openPath(path);
}

export async function subscribeToJobEvents(handlers: {
  onProgress: (payload: JobProgress) => void;
  onLog: (payload: JobLog & { taskId: string }) => void;
  onDone: (payload: JobDoneEvent) => void;
  onError: (payload: JobErrorEvent) => void;
}) {
  if (!desktopMode) {
    return () => {};
  }

  const unlistenFns: UnlistenFn[] = [];
  unlistenFns.push(
    await listen<JobProgress>("job://progress", (event) => handlers.onProgress(event.payload)),
  );
  unlistenFns.push(
    await listen<JobLog & { taskId: string }>("job://log", (event) =>
      handlers.onLog(event.payload),
    ),
  );
  unlistenFns.push(
    await listen<JobDoneEvent>("job://done", (event) => handlers.onDone(event.payload)),
  );
  unlistenFns.push(
    await listen<JobErrorEvent>("job://error", (event) => handlers.onError(event.payload)),
  );

  return () => {
    for (const unlisten of unlistenFns) {
      unlisten();
    }
  };
}

export async function subscribeToInputDrops(
  onPaths: (result: InputSelectionResult) => void,
  getJobType: () => JobType,
) {
  if (!desktopMode) {
    return () => {};
  }

  const window = getCurrentWindow();
  return window.onDragDropEvent(async (event) => {
    if (event.payload.type === "drop") {
      const result = await normalizeInputs(event.payload.paths, getJobType());
      onPaths(result);
    }
  });
}
