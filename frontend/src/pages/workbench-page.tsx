import { AudioLines, Film, FolderOutput, GripVertical, Image as ImageIcon, Plus, Waves, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import type { JobRecord, JobStatus, JobType } from "../lib/types";
import { compactFileLabel, formatJobType, formatPercent, formatRelativeTime, getPathLeaf } from "../lib/utils";
import { useAppStore } from "../store/app-store";

const jobTypeMeta: Array<{
  id: JobType;
  title: string;
  icon: typeof Waves;
}> = [
  { id: "image_ocr", title: "图片提取文字", icon: ImageIcon },
  { id: "audio_transcribe", title: "音频转文字", icon: Waves },
  { id: "video_transcribe", title: "视频转文字", icon: Film },
  { id: "video_extract_audio", title: "视频转音频", icon: AudioLines },
];

export function WorkbenchPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draggedInput, setDraggedInput] = useState<string | null>(null);
  const [dragOverInput, setDragOverInput] = useState<string | null>(null);
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
  const resetDraft = useAppStore((state) => state.resetDraft);
  const cancelJob = useAppStore((state) => state.cancelJob);
  const revealOutputPath = useAppStore((state) => state.revealOutputPath);

  const orderedJobs = [...jobs].sort((left, right) => {
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
  });

  function openDialog() {
    resetDraft();
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setSubmitting(false);
    setDraggedInput(null);
    setDragOverInput(null);
    resetDraft();
  }

  async function handleCreateTask() {
    const beforeCount = useAppStore.getState().jobs.length;
    setSubmitting(true);
    try {
      await startDraftJob();
      const nextState = useAppStore.getState();
      if (nextState.jobs.length > beforeCount && !nextState.lastError) {
        setDialogOpen(false);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  }

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

  return (
    <div className="space-y-4">
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e9eef5] px-5 py-4">
          <div className="min-w-0">
            <CardTitle>任务列表</CardTitle>
          </div>
          <Button size="sm" onClick={openDialog}>
            <Plus className="h-4 w-4" />
            添加任务
          </Button>
        </div>

        {orderedJobs.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] table-fixed">
              <thead>
                <tr className="border-b border-[#eef2f7] bg-[#fafbfd] text-left text-xs text-[var(--muted-foreground)]">
                  <th className="px-5 py-3 font-medium">类型</th>
                  <th className="px-5 py-3 font-medium">输入</th>
                  <th className="px-5 py-3 font-medium">输出</th>
                  <th className="px-5 py-3 font-medium">方式</th>
                  <th className="px-5 py-3 font-medium">进度</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {orderedJobs.map((job) => (
                  <TaskRow
                    key={job.taskId}
                    job={job}
                    onCancel={cancelJob}
                    onReveal={revealOutputPath}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-14 text-center text-sm text-[var(--muted-foreground)]">
            还没有任务，点击右上角添加。
          </div>
        )}
      </Card>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.28)] p-4">
          <div className="w-full max-w-[760px] rounded-3xl border border-[#d9e2ec] bg-white shadow-[0_20px_80px_rgba(15,23,42,0.14)]">
            <div className="flex items-center justify-between border-b border-[#eef2f7] px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">添加任务</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={closeDialog} aria-label="关闭">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <section className="space-y-3">
                <div className="text-sm font-medium text-[var(--foreground)]">类型</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {jobTypeMeta.map((item) => {
                    const Icon = item.icon;
                    const active = draft.jobType === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setDraftJobType(item.id)}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                          active
                            ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                            : "border-[#e3e8ef] bg-white text-[var(--foreground)]"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.title}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-[var(--foreground)]">输入</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => void chooseInputFiles()}>
                      选择文件
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => void chooseInputFolders()}>
                      选择文件夹
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e3e8ef] bg-[#fafbfd]">
                  {draft.inputs.length ? (
                    <div className="max-h-56 overflow-y-auto px-3 py-3">
                      <div className="grid gap-2">
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
                            className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
                              dragOverInput === input
                                ? "border-[#bfdbfe] bg-[#eff6ff]"
                                : "border-[#e8edf4] bg-white"
                            }`}
                            title={input}
                          >
                            <div className="shrink-0 cursor-grab text-[#94a3b8] active:cursor-grabbing">
                              <GripVertical className="h-4 w-4" />
                            </div>
                            <div className="w-0 min-w-0 flex-1 overflow-hidden text-sm text-[var(--foreground)]">
                              <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                                {compactFileLabel(input, 44)}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="shrink-0"
                              onClick={() => removeInputPath(input)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">
                      选择文件或文件夹。
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-medium text-[var(--foreground)]">输出方式</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setDraftOutputMode("separate")}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      draft.outputMode === "separate"
                        ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                        : "border-[#e3e8ef] bg-white text-[var(--foreground)]"
                    }`}
                  >
                    独立文件
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftOutputMode("merged")}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      draft.outputMode === "merged"
                        ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
                        : "border-[#e3e8ef] bg-white text-[var(--foreground)]"
                    }`}
                  >
                    合并一个文件
                  </button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-[var(--foreground)]">输出</div>
                  <Button variant="secondary" size="sm" onClick={() => void chooseOutputDir()}>
                    <FolderOutput className="h-4 w-4" />
                    选择目录
                  </Button>
                </div>
                <div className="rounded-2xl border border-[#e3e8ef] bg-[#fafbfd] px-4 py-3 text-sm text-[var(--foreground)]">
                  {draft.outputDir || "未选择输出目录"}
                </div>
                <input
                  value={draft.outputName}
                  onChange={(event) => setDraftOutputName(event.target.value)}
                  className="w-full rounded-2xl border border-[#e3e8ef] bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[#bfdbfe]"
                  placeholder={
                    draft.outputMode === "merged"
                      ? "自定义输出名，例如 final_notes"
                      : "自定义输出名前缀，例如 batch_result"
                  }
                />
                <div className="text-xs text-[var(--muted-foreground)]">
                  {draft.outputMode === "merged"
                    ? "合并时生成 1 个文件，顺序按当前列表。可直接拖拽调整。"
                    : "独立输出时，多文件会按当前顺序自动编号。可直接拖拽调整。"}
                </div>
              </section>

              {draftWarnings.length ? (
                <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
                  {draftWarnings.map((warning) => (
                    <div key={warning} className="break-all">
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}

              {lastError ? (
                <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[var(--danger)]">
                  {lastError}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#eef2f7] px-6 py-4">
              <Button variant="ghost" onClick={closeDialog}>
                取消
              </Button>
              <Button onClick={() => void handleCreateTask()} disabled={submitting}>
                {submitting ? "添加中..." : "添加并开始"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  job,
  onCancel,
  onReveal,
}: {
  job: JobRecord;
  onCancel: (taskId: string) => Promise<void>;
  onReveal: (path: string) => Promise<void>;
}) {
  const latestInput = job.inputs[0] ? compactFileLabel(job.inputs[0], 28) : "-";
  const outputLabel = job.outputs[0]
    ? compactFileLabel(getPathLeaf(job.outputs[0]), 24)
    : job.outputName
      ? compactFileLabel(job.outputName, 24)
    : job.outputDir
      ? compactFileLabel(getPathLeaf(job.outputDir), 24)
      : "-";
  const latestMessage = job.error || job.progress.message;
  const canCancel = job.status === "queued" || job.status === "running";

  return (
    <tr className="border-b border-[#eef2f7] align-top last:border-b-0">
      <td className="px-5 py-4">
        <div className="text-sm font-medium text-[var(--foreground)]">{formatJobType(job.type)}</div>
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">{formatRelativeTime(job.updatedAt)}</div>
      </td>
      <td className="px-5 py-4">
        <div className="text-sm text-[var(--foreground)]" title={job.inputs.join("\n")}>
          {job.inputs.length > 1 ? `${latestInput} 等 ${job.inputs.length} 项` : latestInput}
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="text-sm text-[var(--foreground)]" title={job.outputDir}>
          {outputLabel}
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="text-sm text-[var(--foreground)]">
          {job.outputMode === "merged" ? "合并" : "独立"}
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="max-w-[240px]">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--muted-foreground)]">
            <span className="min-w-0 truncate" title={latestMessage}>
              {latestMessage}
            </span>
            <span>{formatPercent(job.progress.percent)}</span>
          </div>
          <Progress value={job.progress.percent} />
        </div>
      </td>
      <td className="px-5 py-4">
        <Badge>{statusLabel(job.status)}</Badge>
      </td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-2">
          {job.outputs[0] ? (
            <Button variant="secondary" size="sm" onClick={() => void onReveal(job.outputs[0]!)}>
              打开结果
            </Button>
          ) : null}
          {canCancel ? (
            <Button variant="ghost" size="sm" onClick={() => void onCancel(job.taskId)}>
              取消
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
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
