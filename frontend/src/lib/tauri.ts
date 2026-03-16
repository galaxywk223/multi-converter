import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

import type {
  EnvironmentInfo,
  HistoryRecord,
  JobLog,
  JobProgress,
  StartJobPayload,
} from "./types";

export const desktopMode = isTauri();

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

export async function pickInputFiles() {
  const result = await open({
    title: "选择音频或视频文件",
    multiple: true,
    filters: [
      {
        name: "Media",
        extensions: [
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
        ],
      },
    ],
  });

  if (!result) {
    return [];
  }
  return Array.isArray(result) ? result : [result];
}

export async function pickInputFolders() {
  const result = await open({
    title: "选择待处理文件夹",
    directory: true,
    multiple: true,
    recursive: true,
  });

  if (!result) {
    return [];
  }
  return Array.isArray(result) ? result : [result];
}

export async function pickOutputDirectory(defaultPath?: string) {
  const result = await open({
    title: "选择输出目录",
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
      defaultModelDir: "C:\\Users\\You\\AppData\\Local\\AudioToText\\models",
      modelExists: false,
    } satisfies EnvironmentInfo;
  }
  return invoke<EnvironmentInfo>("detectEnvironment");
}

export async function ensureRuntimeModel(modelId: string, localPath?: string) {
  if (!desktopMode) {
    return {
      modelName: modelId,
      device: "cuda",
      modelDir: localPath ?? "C:\\Users\\You\\AppData\\Local\\AudioToText\\models",
      modelPath: `${localPath ?? "C:\\Users\\You\\AppData\\Local\\AudioToText\\models"}\\${modelId}`,
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
