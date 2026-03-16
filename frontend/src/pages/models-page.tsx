import { Cpu, Download, FolderSearch, HardDriveDownload, Rocket, ShieldCheck } from "lucide-react";

import { Button } from "../components/ui/button";
import { Card, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useAppStore } from "../store/app-store";

export function ModelsPage() {
  const environment = useAppStore((state) => state.environment);
  const models = useAppStore((state) => state.models);
  const busy = useAppStore((state) => state.busy);
  const settings = useAppStore((state) => state.settings);
  const ensureDefaultModel = useAppStore((state) => state.ensureDefaultModel);
  const chooseModelDir = useAppStore((state) => state.chooseModelDir);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardTitle>环境检测</CardTitle>
          <div className="mt-5 grid gap-3">
            <MetaRow label="推理设备" value={environment?.device ?? "unknown"} icon={Rocket} />
            <MetaRow label="Python" value={environment?.pythonVersion ?? "未检测"} icon={Cpu} />
            <MetaRow
              label="ffmpeg"
              value={environment?.ffmpegAvailable ? environment.ffmpegPath : "缺失"}
              icon={ShieldCheck}
            />
            <MetaRow
              label="模型目录"
              value={settings.modelPath || environment?.defaultModelDir || "未设置"}
              icon={FolderSearch}
            />
            <MetaRow
              label="AppData"
              value={environment?.appDataWritable ? "可写" : "不可写"}
              icon={HardDriveDownload}
            />
            <MetaRow
              label="OCR"
              value={environment?.ocrAvailable ? "可用" : "缺失"}
              icon={ShieldCheck}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void chooseModelDir()}>
              <FolderSearch className="h-4 w-4" />
              选择本地模型目录
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>模型</CardTitle>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {models.map((model) => (
              <div key={model.id} className="rounded-2xl border border-[#e3e8ef] bg-[#fafbfc] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-[var(--foreground)]">
                      {model.name}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {model.sizeLabel}
                    </div>
                  </div>
                  <Badge>{model.status}</Badge>
                </div>
                <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                  {model.description}
                </p>
                <div className="mt-5 break-all text-xs leading-6 text-[var(--muted-foreground)]">
                  {model.location ?? "当前还没有检测到本地缓存。"}
                </div>
                <div className="mt-5">
                  <Button
                    variant={model.status === "available" ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => void ensureDefaultModel(model.id, settings.modelPath)}
                    disabled={busy || model.status === "downloading"}
                  >
                    <Download className="h-4 w-4" />
                    {model.status === "available"
                      ? "重新检查"
                      : model.status === "downloading"
                        ? "安装中..."
                        : "安装模型"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Rocket;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#e3e8ef] bg-[#fafbfc] px-4 py-4">
      <div className="rounded-xl border border-[#d6dde6] bg-white p-2">
        <Icon className="h-4 w-4 text-[#2563eb]" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          {label}
        </div>
        <div className="mt-2 break-all text-sm leading-6 text-[var(--foreground)]">{value}</div>
      </div>
    </div>
  );
}
