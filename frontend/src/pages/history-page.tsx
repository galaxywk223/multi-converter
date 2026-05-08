import { Clock3, ExternalLink, FileText, FolderOpen, RotateCcw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../components/ui/button";
import type { HistoryRecord } from "../lib/types";
import { compactFileLabel, formatJobType, formatRelativeTime, getPathLeaf } from "../lib/utils";
import { useAppStore } from "../store/app-store";

export function HistoryPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const history = useAppStore((state) => state.history);
  const revealOutputPath = useAppStore((state) => state.revealOutputPath);
  const openOutputPath = useAppStore((state) => state.openOutputPath);
  const rerunJob = useAppStore((state) => state.rerunHistoryJob);
  const orderedHistory = useMemo(
    () => [...history].sort((left, right) => right.finishedAt.localeCompare(left.finishedAt)),
    [history],
  );
  const selected = orderedHistory.find((item) => item.taskId === selectedTaskId) ?? orderedHistory[0] ?? null;

  return (
    <div className="split-page">
      <section className="list-pane">
        <div className="pane-head">
          <div>
            <div className="panel-title">历史记录</div>
            <div className="panel-caption">已完成、失败和取消的任务</div>
          </div>
          <span className="count-pill">{orderedHistory.length}</span>
        </div>

        <div className="record-list">
          {orderedHistory.length ? (
            orderedHistory.map((item) => (
              <button
                key={item.taskId}
                type="button"
                className={`history-row ${selected?.taskId === item.taskId ? "history-row-selected" : ""}`}
                onClick={() => setSelectedTaskId(item.taskId)}
              >
                <div className="row-icon">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-slate-950">
                      {formatJobType(item.type)}
                    </span>
                    <span className={`status-badge status-${item.status}`}>{statusText(item.status)}</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                    {item.inputs[0] ? getPathLeaf(item.inputs[0]) : item.outputDir}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                    <Clock3 className="h-3 w-3" />
                    {formatRelativeTime(item.finishedAt)}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state">
              <FileText className="h-6 w-6" />
              <div className="mt-3 font-medium">暂无历史</div>
              <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                完成的任务会保存在这里。
              </div>
            </div>
          )}
        </div>
      </section>

      <HistoryDetail
        item={selected}
        onReveal={revealOutputPath}
        onOpen={openOutputPath}
        onRerun={rerunJob}
      />
    </div>
  );
}

function HistoryDetail({
  item,
  onReveal,
  onOpen,
  onRerun,
}: {
  item: HistoryRecord | null;
  onReveal: (path: string) => Promise<void>;
  onOpen: (path: string) => Promise<void>;
  onRerun: (taskId: string) => Promise<void>;
}) {
  if (!item) {
    return (
      <section className="detail-pane">
        <div className="empty-state h-full">
          <FolderOpen className="h-6 w-6" />
          <div className="mt-3 font-medium">没有选中记录</div>
          <div className="mt-1 text-sm text-[var(--muted-foreground)]">
            选择一条历史记录查看输出和重新运行。
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="detail-pane">
      <div className="detail-pane-head">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-slate-950">{formatJobType(item.type)}</div>
          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
            完成于 {new Date(item.finishedAt).toLocaleString()}
          </div>
        </div>
        <span className={`status-badge status-${item.status}`}>{statusText(item.status)}</span>
      </div>

      <section className="detail-block">
        <div className="detail-title">输入</div>
        <div className="mt-2 grid gap-2">
          {item.inputs.map((input) => (
            <div key={input} className="detail-line" title={input}>
              {compactFileLabel(input, 64)}
            </div>
          ))}
        </div>
      </section>

      <section className="detail-block">
        <div className="detail-title">输出</div>
        <div className="mt-2 grid gap-2">
          <div className="detail-line" title={item.outputDir}>
            {compactFileLabel(item.outputDir, 64)}
          </div>
          {item.outputs.map((output) => (
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
        </div>
      </section>

      {item.error ? (
        <section className="detail-block error-block">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all text-sm">{item.error}</span>
          </div>
        </section>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {item.outputs[0] ? (
          <>
            <Button size="sm" onClick={() => void onReveal(item.outputs[0]!)}>
              <ExternalLink className="h-4 w-4" />
              定位结果
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void onOpen(item.outputs[0]!)}>
              打开文件
            </Button>
          </>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => void onRerun(item.taskId)}>
          <RotateCcw className="h-4 w-4" />
          重新运行
        </Button>
      </div>
    </section>
  );
}

function statusText(status: HistoryRecord["status"]) {
  switch (status) {
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
