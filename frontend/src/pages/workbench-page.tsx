import {
  AudioLines,
  FolderPlus,
  Film,
  FolderOutput,
  Play,
  Plus,
  Trash2,
  Waves,
  X,
} from "lucide-react";
import { useDeferredValue } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardDescription, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { useAppStore } from "../store/app-store";
import { formatJobType, formatPercent } from "../lib/utils";
import type { JobType } from "../lib/types";

const jobTypeMeta: Array<{
  id: JobType;
  title: string;
  description: string;
  icon: typeof Waves;
}> = [
  {
    id: "audio_transcribe",
    title: "音频转文字",
    description: "适合播客、录音、课程音频，输出 UTF-8 文本。",
    icon: Waves,
  },
  {
    id: "video_transcribe",
    title: "视频转文字",
    description: "直接拿视频文件转写，不用手动拆音轨。",
    icon: Film,
  },
  {
    id: "video_extract_audio",
    title: "视频转音频",
    description: "把视频批量提取成 MP3，方便后续再做转写。",
    icon: AudioLines,
  },
];

export function WorkbenchPage() {
  const draft = useAppStore((state) => state.draft);
  const jobs = useAppStore((state) => state.jobs);
  const lastError = useAppStore((state) => state.lastError);
  const chooseInputFiles = useAppStore((state) => state.chooseInputFiles);
  const chooseInputFolders = useAppStore((state) => state.chooseInputFolders);
  const removeInputPath = useAppStore((state) => state.removeInputPath);
  const setDraftJobType = useAppStore((state) => state.setDraftJobType);
  const chooseOutputDir = useAppStore((state) => state.chooseOutputDir);
  const startDraftJob = useAppStore((state) => state.startDraftJob);
  const cancelActiveJob = useAppStore((state) => state.cancelActiveJob);
  const revealOutputPath = useAppStore((state) => state.revealOutputPath);
  const activeJob = jobs[0];
  const deferredLogs = useDeferredValue(activeJob?.logs ?? []);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))]">
        <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(236,110,52,0.4),transparent_68%)]" />
        <div className="absolute bottom-0 right-16 h-24 w-24 rounded-full border border-white/10 bg-white/5" />
        <div className="relative grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            <Badge className="w-fit border-[rgba(236,110,52,0.25)] bg-[rgba(236,110,52,0.12)] text-[var(--accent)]">
              Windows 本地桌面工作台
            </Badge>
            <div className="space-y-3">
              <h2 className="max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white">
                把脚本能力，整理成一块真正能长期使用的本地音视频生产台。
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-[var(--muted-foreground)]">
                这里保留了你当前的三条主流程，并把输入、输出、队列、日志、模型状态都放到一个稳定的桌面工作区里。
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <MetricCard label="当前任务" value={activeJob ? formatJobType(activeJob.type) : "等待中"} />
            <MetricCard label="队列长度" value={`${jobs.length}`} />
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
                <CardDescription>第一版完整保留现有 3 条处理链路。</CardDescription>
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
                <CardDescription>支持文件和文件夹一起加入任务队列，路径会去重。</CardDescription>
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

            <div className="rounded-[24px] border border-dashed border-white/12 bg-white/3 p-5">
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
                    <p className="text-sm font-medium text-[var(--foreground)]">先把素材拖进来，或者点按钮选取。</p>
                    <p className="mt-2 text-xs leading-6 text-[var(--muted-foreground)]">
                      桌面版接通后这里会承接真实拖拽；当前浏览器预览模式先用系统对话框模拟。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <CardTitle>输出设置</CardTitle>
                <CardDescription>文本输出为 UTF-8；视频转音频输出为 MP3。</CardDescription>
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
              {activeJob && (activeJob.status === "queued" || activeJob.status === "running") ? (
                <Button
                  variant="danger"
                  size="lg"
                  onClick={() => void cancelActiveJob(activeJob.taskId)}
                >
                  <Trash2 className="h-4 w-4" />
                  取消当前任务
                </Button>
              ) : null}
              {lastError ? <span className="text-sm text-[var(--danger)]">{lastError}</span> : null}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <CardTitle>任务队列</CardTitle>
                <CardDescription>默认单并发，避免 GPU 和 ffmpeg 互相抢占。</CardDescription>
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
                      {job.outputs.length ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void revealOutputPath(job.outputs[0]!)}
                        >
                          打开结果
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/12 p-6 text-sm text-[var(--muted-foreground)]">
                  还没有任务。选择素材后就可以开始跑第一批。
                </div>
              )}
            </div>
          </Card>

          <Card className="min-h-[420px]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <CardTitle>实时日志</CardTitle>
                <CardDescription>桌面端接通后会消费 `job://log` 与 `job://progress` 事件。</CardDescription>
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
                  任务开始后，这里会滚动显示 worker 输出和状态事件。
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
