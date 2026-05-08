import {
  CheckCircle2,
  CircleAlert,
  Cpu,
  FolderOpen,
  History,
  LibraryBig,
  Plus,
  Settings2,
  Waves,
} from "lucide-react";
import { startTransition, useEffect } from "react";

import { HistoryPage } from "./pages/history-page";
import { ModelsPage } from "./pages/models-page";
import { SettingsPage } from "./pages/settings-page";
import { WorkbenchPage } from "./pages/workbench-page";
import type { ViewName } from "./lib/types";
import { compactFileLabel } from "./lib/utils";
import { useAppStore } from "./store/app-store";

const navItems: Array<{
  id: ViewName;
  label: string;
  icon: typeof Waves;
}> = [
  { id: "workbench", label: "工作台", icon: Waves },
  { id: "history", label: "历史", icon: History },
  { id: "models", label: "模型", icon: LibraryBig },
  { id: "settings", label: "设置", icon: Settings2 },
];

function App() {
  const activeView = useAppStore((state) => state.activeView);
  const initialize = useAppStore((state) => state.initialize);
  const connectEvents = useAppStore((state) => state.connectEvents);
  const connectInputDrops = useAppStore((state) => state.connectInputDrops);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const chooseInputFiles = useAppStore((state) => state.chooseInputFiles);
  const environment = useAppStore((state) => state.environment);
  const settings = useAppStore((state) => state.settings);
  const jobs = useAppStore((state) => state.jobs);
  const lastError = useAppStore((state) => state.lastError);

  const runningCount = jobs.filter((job) => job.status === "running").length;
  const queuedCount = jobs.filter((job) => job.status === "queued").length;
  const ready = Boolean(environment?.ffmpegAvailable && environment?.appDataWritable);

  useEffect(() => {
    void initialize();
    void connectEvents();
    void connectInputDrops();
  }, [connectEvents, connectInputDrops, initialize]);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <img src="/logo-mark.svg" alt="" className="brand-mark" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-950">Multi Converter</div>
            <div className="truncate text-xs text-[var(--muted-foreground)]">本地转换工作台</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeView;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => startTransition(() => setActiveView(item.id))}
                className={`sidebar-item ${active ? "sidebar-item-active" : ""}`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-status">
          <div className="status-dot-row">
            {ready ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <CircleAlert className="h-4 w-4 text-amber-600" />
            )}
            <span>{ready ? "本地环境可用" : "环境需要检查"}</span>
          </div>
          <div className="mt-2 truncate text-xs text-[var(--muted-foreground)]">
            {runningCount ? `${runningCount} 个任务处理中` : queuedCount ? `${queuedCount} 个任务排队` : "无活动任务"}
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="top-toolbar">
          <div className="min-w-0">
            <div className="toolbar-title">{pageTitle(activeView)}</div>
            <div className="toolbar-subtitle">
              {pageSubtitle(activeView, runningCount, queuedCount)}
            </div>
          </div>
          <div className="toolbar-meta">
            <div className="toolbar-pill" title={settings.outputDir || "未设置默认输出目录"}>
              <FolderOpen className="h-3.5 w-3.5" />
              <span>{settings.outputDir ? compactFileLabel(settings.outputDir, 26) : "未设置输出目录"}</span>
            </div>
            <div className="toolbar-pill">
              <Cpu className="h-3.5 w-3.5" />
              <span>{settings.modelId || "medium"} / {environment?.device ?? "auto"}</span>
            </div>
            <button
              type="button"
              className="toolbar-primary"
              onClick={() => {
                startTransition(() => setActiveView("workbench"));
                void chooseInputFiles();
              }}
            >
              <Plus className="h-4 w-4" />
              添加任务
            </button>
          </div>
        </header>

        {lastError ? (
          <div className="app-alert" role="status">
            <CircleAlert className="h-4 w-4" />
            <span className="min-w-0 truncate">{lastError}</span>
          </div>
        ) : null}

        <main className="app-content">
          {activeView === "workbench" ? <WorkbenchPage /> : null}
          {activeView === "history" ? <HistoryPage /> : null}
          {activeView === "models" ? <ModelsPage /> : null}
          {activeView === "settings" ? <SettingsPage /> : null}
        </main>
      </div>
    </div>
  );
}

function pageTitle(view: ViewName) {
  switch (view) {
    case "history":
      return "历史记录";
    case "models":
      return "模型与环境";
    case "settings":
      return "偏好设置";
    default:
      return "转换工作台";
  }
}

function pageSubtitle(view: ViewName, runningCount: number, queuedCount: number) {
  if (view === "workbench") {
    if (runningCount || queuedCount) {
      return `${runningCount} 处理中 / ${queuedCount} 排队`;
    }
    return "拖入文件或选择批量转换任务";
  }
  if (view === "history") {
    return "查看输出、定位结果并重新运行任务";
  }
  if (view === "models") {
    return "检查 Whisper 模型、本地依赖和运行设备";
  }
  return "配置默认输出、模型、设备和临时文件策略";
}

export default App;
