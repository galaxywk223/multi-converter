import { Clock3, ExternalLink, RotateCcw, TriangleAlert } from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardDescription, CardTitle } from "../components/ui/card";
import { useAppStore } from "../store/app-store";
import { formatJobType, formatRelativeTime } from "../lib/utils";

export function HistoryPage() {
  const history = useAppStore((state) => state.history);
  const revealOutputPath = useAppStore((state) => state.revealOutputPath);
  const openOutputPath = useAppStore((state) => state.openOutputPath);
  const rerunJob = useAppStore((state) => state.rerunHistoryJob);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>最近任务</CardTitle>
            <CardDescription>查看输出和错误。</CardDescription>
          </div>
          <Badge>{history.length ? `${history.length} 条记录` : "暂无记录"}</Badge>
        </div>
      </Card>

      <div className="grid gap-4">
        {history.length ? (
          history.map((item) => (
            <Card key={item.taskId}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold text-[var(--foreground)]">
                      {formatJobType(item.type)}
                    </div>
                    <Badge>{item.status}</Badge>
                    <Badge className="gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatRelativeTime(item.finishedAt)}
                    </Badge>
                  </div>
                  <div className="text-sm leading-7 text-[var(--muted-foreground)]">
                    输出目录：{item.outputDir}
                  </div>
                  <div className="grid gap-2">
                    {item.inputs.map((input) => (
                      <div
                        key={input}
                        className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-[var(--foreground)]"
                      >
                        {input}
                      </div>
                    ))}
                  </div>
                  {item.error ? (
                    <div className="flex items-start gap-3 rounded-2xl border border-[rgba(204,69,73,0.2)] bg-[rgba(204,69,73,0.08)] p-4 text-sm text-[var(--danger)]">
                      <TriangleAlert className="mt-0.5 h-4 w-4" />
                      <span>{item.error}</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.outputs[0] ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void revealOutputPath(item.outputs[0]!)}
                      >
                        <ExternalLink className="h-4 w-4" />
                        定位结果
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void openOutputPath(item.outputs[0]!)}
                      >
                        打开文件
                      </Button>
                    </>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => void rerunJob(item.taskId)}>
                    <RotateCcw className="h-4 w-4" />
                    重新运行
                  </Button>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card>
            <div className="text-sm leading-7 text-[var(--muted-foreground)]">
              暂无历史记录。
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
