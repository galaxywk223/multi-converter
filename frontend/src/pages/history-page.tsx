import { Clock3, ExternalLink, RotateCcw, TriangleAlert } from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardTitle } from "../components/ui/card";
import { compactFileLabel, formatJobType, formatRelativeTime } from "../lib/utils";
import { useAppStore } from "../store/app-store";

export function HistoryPage() {
  const history = useAppStore((state) => state.history);
  const revealOutputPath = useAppStore((state) => state.revealOutputPath);
  const openOutputPath = useAppStore((state) => state.openOutputPath);
  const rerunJob = useAppStore((state) => state.rerunHistoryJob);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>历史</CardTitle>
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
                  <div className="break-all text-sm leading-7 text-[var(--muted-foreground)]">
                    输出目录：{item.outputDir}
                  </div>
                  <div className="grid gap-2">
                    {item.inputs.map((input) => (
                      <div
                        key={input}
                        className="rounded-2xl border border-[#e3e8ef] bg-[#fafbfc] px-4 py-3"
                        title={input}
                      >
                        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-[var(--foreground)]">
                          {compactFileLabel(input)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {item.error ? (
                    <div className="flex items-start gap-3 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[var(--danger)]">
                      <TriangleAlert className="mt-0.5 h-4 w-4" />
                      <span className="break-all">{item.error}</span>
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
