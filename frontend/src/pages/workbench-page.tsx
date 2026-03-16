import {
  AudioLines,
  FolderPlus,
  Film,
  FolderOutput,
  Image as ImageIcon,
  Play,
  Plus,
  Trash2,
  Waves,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardDescription, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { desktopMode } from "../lib/tauri";
import { formatJobType, formatPercent } from "../lib/utils";
import type { JobType } from "../lib/types";
import { useAppStore } from "../store/app-store";

const jobTypeMeta: Array<{
  id: JobType;
  title: string;
  description: string;
  icon: typeof Waves;
}> = [
  {
    id: "image_ocr",
    title: "图片提取文字",
    description: "输出 TXT",
    icon: ImageIcon,
  },
  {
    id: "audio_transcribe",
    title: "音频转文字",
    description: "输出 TXT",
    icon: Waves,
  },
  {
    id: "video_transcribe",
    title: "视频转文字",
    description: "直接转写视频",
    icon: Film,
  },
  {
    id: "video_extract_audio",
    title: "视频转音频",
    description: "导出 MP3",
    icon: AudioLines,
  },
];

export function WorkbenchPage() {
  const [dragging, setDragging] = useState(false);
  const draft = useAppStore((state) => state.draft);
  const jobs = useAppStore((state) => state.jobs);
  const draftWarnings = useAppStore((state) => state.draftWarnings);
  const lastError = useAppStore((state) => state.lastError);
  const chooseInputFiles = useAppStore((state) => state.chooseInputFiles);
  const chooseInputFolders = useAppStore((state) => state.chooseInputFolders);
  const removeInputPath = useAppStore((state) => state.removeInputPath);
  const setDraftJobType = useAppStore((state) => state.setDraftJobType);
  const chooseOutputDir = useAppStore((state) => state.chooseOutputDir);
  const startDraftJob = useAppStore((state) => state.startDraftJob);
  const cancelJob = useAppStore((state) => state.cancelJob);
  const revealOutputPath = useAppStore((state) => state.revealOutputPath);
  const activeJob = jobs.find((job) => job.status === "running") ?? jobs[0];
  const deferredLogs = useDeferredValue(activeJob?.logs ?? []);

  useEffect(() => {
    if (!desktopMode) {
      return;
    }
    const onDragEnter = () => setDragging(true);
    const onDragLeave = () => setDragging(false);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))]">
        <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(236,110,52,0.4),transparent_68%)]" />
        <div className="absolute bottom-0 right-16 h-24 w-24 rounded-full border border-white/10 bg-white/5" />
        <div className="relative grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <Badge className="w-fit border-[rgba(236,110,52,0.25)] bg-[rgba(236,110,52,0.12)] text-[var(--accent)]">
              Desktop
            </Badge>
            <div className="space-y-3">
              <h2 className="max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white">
                多功能转换器
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-[var(--muted-foreground)]">
                图片、音频、视频都可以处理。
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <MetricCard label="当前任务" value={activeJob ? formatJobType(activeJob.type) : "等待中"} />
            <MetricCard
              label="队列长度"
              value={`${jobs.filter((job) => job.status === "queued" || job.status === "running").length}`}
            />
            <MetricCard
              label="输入数量"
              value={draft.inputs.length ? `${draft.inputs.length} 项` : "未选择"}
            />
          </div>
        </div>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <CardTitle>模式选择</CardTitle>
                <CardDescription>选择处理方式。</CardDescription>
              </div>
              <Badge>{formatJobType(draft.jobType)}</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {jobTypeMeta.map((item) => {
                const Icon = item.icon;
                const active = draft.jobType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDraftJobType(item.id)}
                    className={`rounded-[24px] border p-4 text-left transition duration-200 ${
                      active
                        ? "border-[rgba(236,110,52,0.3)] bg-[rgba(236,110,52,0.12)] shadow-[0_16px_40px_rgba(236,110,52,0.12)]"
                        : "border-white/10 bg-white/4 hover:border-white/16 hover:bg-white/7"
                    }`}
                  >
                    <Icon className="mb-4 h-5 w-5 text-[var(--accent)]" />
                    <div className="mb-1 text-sm font-semibold text-[var(--foreground)]">
                      {item.title}
                    </div>
                    <p className="text-xs leading-6 text-[var(--muted-foreground)]">
                      {item.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <CardTitle>输入清单</CardTitle>
                <CardDescription>支持文件和文件夹。</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => void chooseInputFiles()}>
                  <Plus className="h-4 w-4" />
                  选择文件
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void chooseInputFolders()}>
                  <FolderPlus className="h-4 w-4" />
                  选择文件夹
                </Button>
              </div>
            </div>

            <div
              className={`rounded-[24px] border border-dashed p-5 transition ${
                dragging
                  ? "border-[rgba(236,110,52,0.38)] bg-[rgba(236,110,52,0.08)]"
                  : "border-white/12 bg-white/3"
              }`}
            >
              {draft.inputs.length ? (
                <div className="grid gap-3">
                  {draft.inputs.map((input) => (
                    <div
                      key={input}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-[var(--foreground)]">{input}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeInputPath(input)}
                        aria-label={`删除 ${input}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
                  <div className="rounded-full border border-white/10 bg-white/6 p-4">
                    <FolderPlus className="h-6 w-6 text-[var(--accent)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {desktopMode ? "拖入文件或文件夹，或点击选择。" : "点击选择本地文件。"}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">
                      {desktopMode
                        ? "文件夹会自动展开。"
                        : "预览模式下使用系统对话框。"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {draftWarnings.length ? (
              <div className="mt-4 rounded-[24px] border border-[rgba(236,110,52,0.22)] bg-[rgba(236,110,52,0.08)] p-4">
                <div className="mb-2 text-xs uppercase tracking-[0.22em] text-[var(--accent)]">
                  已跳过
                </div>
                <div className="grid gap-2 text-sm text-[var(--muted-foreground)]">
                  {draftWarnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <CardTitle>输出设置</CardTitle>
                <CardDescription>选择输出目录。</CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={() => void chooseOutputDir()}>
                <FolderOutput className="h-4 w-4" />
                选择目录
              </Button>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <div className="text-xs uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
                Output
              </div>
              <div className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                {draft.outputDir || "尚未选择输出目录"}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={() => void startDraftJob()}>
                <Play className="h-4 w-4" />
                开始处理
              </Button>
              {lastError ? <span className="text-sm text-[var(--danger)]">{lastError}</span> : null}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <CardTitle>任务队列</CardTitle>
                <CardDescription>单任务串行执行。</CardDescription>
              </div>
              <Badge>{jobs.length ? `${jobs.length} 个任务` : "空队列"}</Badge>
            </div>

            <div className="space-y-4">
              {jobs.length ? (
                jobs.map((job) => (
                  <div
                    key={job.taskId}
                    className="rounded-[24px] border border-white/8 bg-white/4 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-[var(--foreground)]">
                          {formatJobType(job.type)}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)]">{job.taskId}</div>
                      </div>
                      <Badge>{job.status}</Badge>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                      <span>{job.progress.message}</span>
                      <span>{formatPercent(job.progress.percent)}</span>
                    </div>
                    <Progress value={job.progress.percent} />
                    <div className="mt-4 flex flex-wrap gap-2">
                      {job.outputs[0] ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void revealOutputPath(job.outputs[0]!)}
                        >
                          打开结果
                        </Button>
                      ) : null}
                      {(job.status === "queued" || job.status === "running") ? (
                        <Button variant="danger" size="sm" onClick={() => void cancelJob(job.taskId)}>
                          <Trash2 className="h-4 w-4" />
                          取消任务
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/12 p-6 text-sm text-[var(--muted-foreground)]">
                  暂无任务。
                </div>
              )}
            </div>
          </Card>

          <Card className="min-h-[420px]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <CardTitle>实时日志</CardTitle>
                <CardDescription>显示任务输出。</CardDescription>
              </div>
              <Badge>{activeJob ? activeJob.status : "idle"}</Badge>
            </div>
            <div className="space-y-3">
              {deferredLogs.length ? (
                deferredLogs
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <div
                      key={`${entry.at}-${index}`}
                      className="rounded-2xl border border-white/6 bg-black/18 px-4 py-3"
                    >
                      <div className="mb-1 text-[11px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                        {entry.level}
                      </div>
                      <p className="text-sm leading-6 text-[var(--foreground)]">{entry.message}</p>
                    </div>
                  ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/12 p-6 text-sm text-[var(--muted-foreground)]">
                  任务开始后显示日志。
                </div>
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[rgba(7,11,14,0.38)] p-4">
      <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
        {value}
      </div>
    </div>
  );
}
