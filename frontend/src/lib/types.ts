export type JobType =
  | "audio_transcribe"
  | "video_transcribe"
  | "video_extract_audio";

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ViewName = "workbench" | "history" | "models" | "settings";

export interface JobProgress {
  taskId: string;
  stage: string;
  percent: number;
  currentFile: string | null;
  totalFiles: number;
  eta?: number;
  message: string;
}

export interface JobLog {
  at: string;
  level: "info" | "debug" | "warning" | "error";
  message: string;
}

export interface JobRecord {
  taskId: string;
  type: JobType;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  inputs: string[];
  outputDir: string;
  outputs: string[];
  progress: JobProgress;
  logs: JobLog[];
  error?: string;
}

export interface HistoryRecord {
  taskId: string;
  type: JobType;
  status: Exclude<JobStatus, "queued" | "running">;
  createdAt: string;
  finishedAt: string;
  inputs: string[];
  outputDir: string;
  outputs: string[];
  error?: string;
}

export interface EnvironmentInfo {
  pythonVersion: string;
  device: "cpu" | "cuda";
  ffmpegAvailable: boolean;
  ffmpegVersion?: string | null;
  defaultModelDir: string;
  modelExists: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  sizeLabel: string;
  status: "available" | "missing" | "downloading";
  location?: string;
}

export interface AppSettings {
  defaultOutputDir: string;
  language: string;
  modelName: string;
  device: "auto" | "cpu" | "cuda";
  concurrency: 1;
  tempPolicy: "cleanup" | "retain";
}

export interface DraftJob {
  jobType: JobType;
  inputs: string[];
  outputDir: string;
}

export interface StartJobPayload {
  jobType: JobType;
  inputs: string[];
  outputDir: string;
  modelName: string;
  modelDir?: string;
  language: string;
  device: "auto" | "cpu" | "cuda";
  ffmpegPath?: string;
}
