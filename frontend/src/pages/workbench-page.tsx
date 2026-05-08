import {
  AudioLines,
  Check,
  FileAudio,
  FileText,
  Film,
  FolderInput,
  FolderOutput,
  GripVertical,
  Image as ImageIcon,
  ListChecks,
  Play,
  Plus,
  Trash2,
  Waves,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import type { JobRecord, JobStatus, JobType } from "../lib/types";
import {
  compactFileLabel,
  formatJobType,
  formatPercent,
  formatRelativeTime,
  getPathLeaf,
} from "../lib/utils";
import { useAppStore } from "../store/app-store";

const jobTypeMeta: Array<{
  id: JobType;
  title: string;
  description: string;
  icon: typeof Waves;
}> = [
  { id: "audio_transcribe", title: "音频转文字", description: "Whisper transcript", icon: Waves },
  { id: "video_transcribe", title: "视频转文字", description: "视频直接转写", icon: Film },
  { id: "video_extract_audio", title: "视频转音频", description: "提取 MP3 音轨", icon: AudioLines },
  { id: "image_ocr", title: "图片提取文字", description: "OCR text", icon: ImageIcon },
];

export function WorkbenchPage() {
  const [draggedInput, setDraggedInput] = useState<string | null>(null);
  const [dragOverInput, setDragOverInput] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const draft = useAppStore((state) => state.draft);
  const jobs = useAppStore((state) => state.jobs);
  const draftWarnings = useAppStore((state) => state.draftWarnings);
  const lastError = useAppStore((state) => state.lastError);
  const chooseInputFiles = useAppStore((state) => state.chooseInputFiles);
  const chooseInputFolders = useAppStore((state) => state.chooseInputFolders);
  const removeInputPath = useAppStore((state) => state.removeInputPath);
  const reorderInputPath = useAppStore((state) => state.reorderInputPath);
  const setDraftJobType = useAppStore((state) => state.setDraftJobType);
  const setDraftOutputMode = useAppStore((state) => state.setDraftOutputMode);
  const setDraftOutputName = useAppStore((state) => state.setDraftOutputName);
  const chooseOutputDir = useAppStore((state) => state.chooseOutputDir);
  const startDraftJob = useAppStore((state) => state.startDraftJob);
  const cancelJob = useAppStore((state) => state.cancelJob);
  const revealOutputPath = useAppStore((state) => state.revealOutputPath);

  const orderedJobs = useMemo(() => [...jobs].sort(sortJobs), [jobs]);
  const selectedJob =
    orderedJobs.find((job) => job.taskId === selectedTaskId) ??
    orderedJobs.find((job) => job.status === "running") ??
    orderedJobs[0] ??
    null;

  function handleInputDrop(targetInput: string) {
    if (!draggedInput || draggedInput === targetInput) {
      setDraggedInput(null);
      setDragOverInput(null);
      return;
    }
    reorderInputPath(draggedInput, targetInput);
    setDraggedInput(null);
    setDragOverInput(null);
  }

  async function handleStart() {
    await startDraftJob();
  }

  return (
    <div className="workbench-layout">
      <section className="workbench-main">
        <div className="tool-panel">
          <div className="quick-strip">
            <button type="button" className="drop-zone" onClick={() => void chooseInputFiles()}>
              <div className="drop-icon">
                <Plus className="h-5 w-5" />
              </div>
              <div className="min-w-0 text-left">
                <div className="text-sm font-semibold text-slate-950">添加文件到队列</div>
                <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                  支持音频、视频、图片。也可以直接拖入窗口。
                </div>
              </div>
            </button>
            <div className="quick-actions">
              <Button variant="secondary" size="sm" onClick={() => void chooseInputFiles()}>
                <FileAudio className="h-4 w-4" />
                选择文件
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void chooseInputFolders()}>
                <FolderInput className="h-4 w-4" />
                选择文件夹
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void chooseOutputDir()}>
                <FolderOutput className="h-4 w-4" />
                输出目录
              </Button>
            </div>
          </div>

          <div className="composer-grid">
            <div className="composer-section">
              <div className="section-label">任务类型</div>
              <div className="type-grid">
                {jobTypeMeta.map((item) => {
                  const Icon = item.icon;
                  const active = draft.jobType === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`type-tile ${active ? "type-tile-active" : ""}`}
                      onClick={() => setDraftJobType(item.id)}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block truncate text-[11px] text-[var(--muted-foreground)]">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="composer-section">
              <div className="section-label">输出</div>
              <div className="segmented">
                <button
                  type="button"
                  className={draft.outputMode === "separate" ? "selected" : ""}
                  onClick={() => setDraftOutputMode("separate")}
                >
                  独立文件
                </button>
                <button
                  type="button"
                  className={draft.outputMode === "merged" ? "selected" : ""}
                  onClick={() => setDraftOutputMode("merged")}
                >
                  合并一个
                </button>
              </div>
              <input
                value={draft.outputName}
                onChange={(event) => setDraftOutputName(event.target.value)}
                className="field compact-field"
                placeholder={draft.outputMode === "merged" ? "输出文件名，可选" : "输出名前缀，可选"}
              />
              <div className="path-line" title={draft.outputDir}>
                <FolderOutput className="h-3.5 w-3.5" />
                <span>{draft.outputDir ? compactFileLabel(draft.outputDir, 42) : "使用默认输出目录"}</span>
              </div>
            </div>
          </div>

          {draft.inputs.length ? (
            <div className="draft-list">
              <div className="draft-head">
                <span>{draft.inputs.length} 个待加入输入</span>
                <Button size="sm" onClick={() => void handleStart()}>
                  <Play className="h-4 w-4" />
                  加入队列
                </Button>
              </div>
              <div className="draft-items">
                {draft.inputs.map((input) => (
                  <div
                    key={input}
                    draggable
                    onDragStart={() => {
                      setDraggedInput(input);
                      setDragOverInput(input);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (dragOverInput !== input) {
                        setDragOverInput(input);
                      }
                    }}
                    onDragEnd={() => {
                      setDraggedInput(null);
                      setDragOverInput(null);
                    }}
                    onDrop={() => handleInputDrop(input)}
                    className={`draft-item ${dragOverInput === input ? "draft-item-over" : ""}`}
                    title={input}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                    <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-sm">{getPathLeaf(input)}</span>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="移除输入"
                      onClick={() => removeInputPath(input)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {draftWarnings.length || lastError ? (
            <div className="message-stack">
              {draftWarnings.map((warning) => (
                <div key={warning} className="warning-line">
                  {warning}
                </div>
              ))}
              {lastError ? <div className="warning-line danger-line">{lastError}</div> : null}
            </div>
          ) : null}
        </div>

        <div className="queue-panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">任务队列</div>
              <div className="panel-caption">当前转换任务、排队和结果</div>
            </div>
            <Badge>{orderedJobs.length ? `${orderedJobs.length} 项` : "空队列"}</Badge>
          </div>

          <div className="queue-list">
            {orderedJobs.length ? (
              orderedJobs.map((job) => (
                <QueueRow
                  key={job.taskId}
                  job={job}
                  selected={selectedJob?.taskId === job.taskId}
                  onSelect={() => setSelectedTaskId(job.taskId)}
                  onCancel={cancelJob}
                  onReveal={revealOutputPath}
                />
              ))
            ) : (
              <div className="empty-state">
                <ListChecks className="h-6 w-6" />
                <div className="mt-3 font-medium">队列为空</div>
                <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                  添加文件后会在这里显示转换进度。
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <TaskInspector job={selectedJob} onCancel={cancelJob} onReveal={revealOutputPath} />
    </div>
  );
}

function QueueRow({
  job,
  selected,
  onSelect,
  onCancel,
  onReveal,
}: {
  job: JobRecord;
  selected: boolean;
  onSelect: () => void;
  onCancel: (taskId: string) => Promise<void>;
  onReveal: (path: string) => Promise<void>;
}) {
  const inputName = job.inputs[0] ? getPathLeaf(job.inputs[0]) : "-";
  const outputName = job.outputs[0]
    ? getPathLeaf(job.outputs[0])
    : job.outputName || compactFileLabel(job.outputDir, 22) || "-";
  const canCancel = job.status === "queued" || job.status === "running";

  return (
    <button type="button" className={`queue-row ${selected ? "queue-row-selected" : ""}`} onClick={onSelect}>
      <div className="row-icon">{iconForJob(job.type)}</div>
      <div className="min-w-0 flex-1">
        <div className="row-main">
          <span className="truncate font-medium text-slate-950">{inputName}</span>
          <StatusBadge status={job.status} />
        </div>
        <div className="row-sub">
          <span>{formatJobType(job.type)}</span>
          <span>{"->"}</span>
          <span className="truncate">{outputName}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Progress value={job.progress.percent} className="h-1.5 flex-1" />
          <span className="w-9 shrink-0 text-right text-[11px] text-[var(--muted-foreground)]">
            {formatPercent(job.progress.percent)}
          </span>
        </div>
      </div>
      <div className="row-actions" onClick={(event) => event.stopPropagation()}>
        {job.outputs[0] ? (
          <button type="button" className="row-action" onClick={() => void onReveal(job.outputs[0]!)}>
            打开
          </button>
        ) : null}
        {canCancel ? (
          <button type="button" className="row-action" onClick={() => void onCancel(job.taskId)}>
            取消
          </button>
        ) : null}
      </div>
    </button>
  );
}

function TaskInspector({
  job,
  onCancel,
  onReveal,
}: {
  job: JobRecord | null;
  onCancel: (taskId: string) => Promise<void>;
  onReveal: (path: string) => Promise<void>;
}) {
  if (!job) {
    return (
      <aside className="inspector-panel">
        <div className="empty-state h-full">
          <FileText className="h-6 w-6" />
          <div className="mt-3 font-medium">没有选中任务</div>
          <div className="mt-1 text-sm text-[var(--muted-foreground)]">
            队列中的任务会在这里显示输入、输出和日志。
          </div>
        </div>
      </aside>
    );
  }

  const canCancel = job.status === "queued" || job.status === "running";
  const recentLogs = job.logs.slice(-5).reverse();

  return (
    <aside className="inspector-panel">
      <div className="inspector-head">
        <div className="inspector-icon">{iconForJob(job.type)}</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-950">{formatJobType(job.type)}</div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
            {formatRelativeTime(job.updatedAt)}
          </div>
        </div>
      </div>

      <div className="inspector-progress">
        <div className="flex items-center justify-between text-xs">
          <span className="truncate text-[var(--muted-foreground)]" title={job.progress.message}>
            {job.progress.message}
          </span>
          <span className="font-medium">{formatPercent(job.progress.percent)}</span>
        </div>
        <Progress value={job.progress.percent} className="mt-2" />
      </div>

      <InfoBlock title="输入">
        {job.inputs.map((input) => (
          <div key={input} className="detail-line" title={input}>
            {compactFileLabel(input, 44)}
          </div>
        ))}
      </InfoBlock>

      <InfoBlock title="输出">
        <div className="detail-line" title={job.outputDir}>
          {compactFileLabel(job.outputDir, 44)}
        </div>
        {job.outputs.map((output) => (
          <button
            key={output}
            type="button"
            className="result-line"
            title={output}
            onClick={() => void onReveal(output)}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{getPathLeaf(output)}</span>
          </button>
        ))}
      </InfoBlock>

      <InfoBlock title="日志">
        {recentLogs.length ? (
          recentLogs.map((log) => (
            <div key={`${log.at}-${log.message}`} className="log-line">
              <span className="uppercase">{log.level}</span>
              <p>{log.message}</p>
            </div>
          ))
        ) : (
          <div className="detail-line">暂无日志。</div>
        )}
      </InfoBlock>

      <div className="mt-auto flex gap-2 pt-4">
        {job.outputs[0] ? (
          <Button className="flex-1" size="sm" onClick={() => void onReveal(job.outputs[0]!)}>
            <FolderOutput className="h-4 w-4" />
            打开结果
          </Button>
        ) : null}
        {canCancel ? (
          <Button variant="danger" size="sm" className="flex-1" onClick={() => void onCancel(job.taskId)}>
            <Trash2 className="h-4 w-4" />
            取消
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-block">
      <div className="detail-title">{title}</div>
      <div className="mt-2 grid gap-2">{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabel(status)}</span>;
}

function statusLabel(status: JobStatus) {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "处理中";
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

function sortJobs(left: JobRecord, right: JobRecord) {
  const rank = (status: JobStatus) => {
    if (status === "running") {
      return 0;
    }
    if (status === "queued") {
      return 1;
    }
    return 2;
  };
  return rank(left.status) - rank(right.status) || right.createdAt.localeCompare(left.createdAt);
}

function iconForJob(type: JobType) {
  switch (type) {
    case "audio_transcribe":
      return <Waves className="h-4 w-4" />;
    case "video_transcribe":
      return <Film className="h-4 w-4" />;
    case "video_extract_audio":
      return <AudioLines className="h-4 w-4" />;
    case "image_ocr":
      return <ImageIcon className="h-4 w-4" />;
    default:
      return <Check className="h-4 w-4" />;
  }
}
