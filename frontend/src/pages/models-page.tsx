import {
  CheckCircle2,
  Cpu,
  Download,
  FolderSearch,
  HardDrive,
  Microchip,
  ShieldCheck,
} from "lucide-react";

import { Button } from "../components/ui/button";
import type { ModelInfo } from "../lib/types";
import { compactFileLabel } from "../lib/utils";
import { useAppStore } from "../store/app-store";

export function ModelsPage() {
  const environment = useAppStore((state) => state.environment);
  const models = useAppStore((state) => state.models);
  const busy = useAppStore((state) => state.busy);
  const settings = useAppStore((state) => state.settings);
  const ensureDefaultModel = useAppStore((state) => state.ensureDefaultModel);
  const chooseModelDir = useAppStore((state) => state.chooseModelDir);

  return (
    <div className="models-page">
      <section className="tool-panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">本地环境</div>
            <div className="panel-caption">运行设备、缓存目录和依赖状态</div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void chooseModelDir()}>
            <FolderSearch className="h-4 w-4" />
            选择模型目录
          </Button>
        </div>

        <div className="env-grid">
          <EnvItem label="推理设备" value={environment?.device ?? "unknown"} icon={Microchip} strong />
          <EnvItem label="Python" value={environment?.pythonVersion ?? "未检测"} icon={Cpu} />
          <EnvItem
            label="ffmpeg"
            value={environment?.ffmpegAvailable ? "可用" : "缺失"}
            detail={environment?.ffmpegPath}
            icon={ShieldCheck}
            ok={Boolean(environment?.ffmpegAvailable)}
          />
          <EnvItem
            label="OCR"
            value={environment?.ocrAvailable ? "可用" : "缺失"}
            icon={ShieldCheck}
            ok={Boolean(environment?.ocrAvailable)}
          />
          <EnvItem
            label="AppData"
            value={environment?.appDataWritable ? "可写" : "不可写"}
            detail={environment?.appDataDir}
            icon={HardDrive}
            ok={Boolean(environment?.appDataWritable)}
          />
          <EnvItem
            label="模型目录"
            value={compactFileLabel(settings.modelPath || environment?.defaultModelDir || "未设置", 40)}
            detail={settings.modelPath || environment?.defaultModelDir}
            icon={FolderSearch}
          />
        </div>
      </section>

      <section className="tool-panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">Whisper 模型</div>
            <div className="panel-caption">选择和检查本地转写模型</div>
          </div>
        </div>

        <div className="model-list">
          {models.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              active={settings.modelId === model.id}
              busy={busy}
              onEnsure={() => void ensureDefaultModel(model.id, settings.modelPath)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function EnvItem({
  label,
  value,
  detail,
  icon: Icon,
  ok,
  strong,
}: {
  label: string;
  value: string;
  detail?: string | null;
  icon: typeof Cpu;
  ok?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="env-item">
      <div className="env-icon">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="section-label">{label}</div>
        <div className={`mt-1 truncate text-sm ${strong ? "font-semibold text-slate-950" : "text-slate-800"}`}>
          {value}
        </div>
        {detail ? (
          <div className="mt-1 truncate text-xs text-[var(--muted-foreground)]" title={detail}>
            {detail}
          </div>
        ) : null}
      </div>
      {ok ? <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-600" /> : null}
    </div>
  );
}

function ModelRow({
  model,
  active,
  busy,
  onEnsure,
}: {
  model: ModelInfo;
  active: boolean;
  busy: boolean;
  onEnsure: () => void;
}) {
  return (
    <div className={`model-row ${active ? "model-row-active" : ""}`}>
      <div className="row-icon">
        <Microchip className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-semibold text-slate-950">{model.name}</div>
          {active ? <span className="mini-badge">当前</span> : null}
          <span className={`status-badge status-model-${model.status}`}>{modelStatus(model.status)}</span>
        </div>
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">{model.sizeLabel}</div>
        <div className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{model.description}</div>
        <div className="mt-2 truncate text-xs text-[var(--muted-foreground)]" title={model.location}>
          {model.location ?? "当前还没有检测到本地缓存。"}
        </div>
      </div>
      <Button
        variant={model.status === "available" ? "secondary" : "primary"}
        size="sm"
        onClick={onEnsure}
        disabled={busy || model.status === "downloading"}
      >
        <Download className="h-4 w-4" />
        {model.status === "available"
          ? "重新检查"
          : model.status === "downloading"
            ? "安装中"
            : "安装"}
      </Button>
    </div>
  );
}

function modelStatus(status: ModelInfo["status"]) {
  switch (status) {
    case "available":
      return "可用";
    case "downloading":
      return "安装中";
    default:
      return "缺失";
  }
}
