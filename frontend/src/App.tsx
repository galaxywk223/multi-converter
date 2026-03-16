import { Cpu, History, LibraryBig, Settings2, Waves } from "lucide-react";
import { startTransition, useEffect } from "react";

import { Badge } from "./components/ui/badge";
import { WorkbenchPage } from "./pages/workbench-page";
import { HistoryPage } from "./pages/history-page";
import { ModelsPage } from "./pages/models-page";
import { SettingsPage } from "./pages/settings-page";
import { useAppStore } from "./store/app-store";
import type { ViewName } from "./lib/types";

const navItems: Array<{
  id: ViewName;
  label: string;
  description: string;
  icon: typeof Waves;
}> = [
  {
    id: "workbench",
    label: "工作台",
    description: "拖拽、队列、日志与执行入口",
    icon: Waves,
  },
  {
    id: "history",
    label: "历史",
    description: "查看最近任务和输出结果",
    icon: History,
  },
  {
    id: "models",
    label: "模型管理",
    description: "检查设备、模型与本地缓存",
    icon: LibraryBig,
  },
  {
    id: "settings",
    label: "设置",
    description: "默认输出、语言与运行策略",
    icon: Settings2,
  },
];

function App() {
  const activeView = useAppStore((state) => state.activeView);
  const environment = useAppStore((state) => state.environment);
  const initialize = useAppStore((state) => state.initialize);
  const connectEvents = useAppStore((state) => state.connectEvents);
  const setActiveView = useAppStore((state) => state.setActiveView);

  useEffect(() => {
    void initialize();
    void connectEvents();
  }, [connectEvents, initialize]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,110,52,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(62,143,212,0.18),transparent_30%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1600px] gap-6 px-4 py-4 lg:px-6">
        <aside className="hidden w-[300px] shrink-0 lg:flex">
          <div className="sticky top-4 flex h-[calc(100vh-2rem)] w-full flex-col rounded-[32px] border border-white/10 bg-[rgba(9,13,18,0.8)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-xl">
            <div className="mb-8 space-y-3">
              <Badge className="w-fit border-[rgba(236,110,52,0.22)] bg-[rgba(236,110,52,0.14)] text-[var(--accent)]">
                AudioToText Desktop
              </Badge>
              <h1 className="text-3xl font-semibold tracking-[-0.05em] text-white">
                本地音视频转换中心
              </h1>
              <p className="text-sm leading-7 text-[var(--muted-foreground)]">
                Tauri 2 桌面壳 + 本地 worker 协议，先把形态搭稳，再逐步替换底层引擎。
              </p>
            </div>

            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeView;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      startTransition(() => setActiveView(item.id));
                    }}
                    className={`w-full rounded-[24px] border px-4 py-4 text-left transition duration-200 ${
                      active
                        ? "border-[rgba(236,110,52,0.22)] bg-[rgba(236,110,52,0.12)]"
                        : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="rounded-full border border-white/10 bg-white/6 p-2">
                        <Icon className="h-4 w-4 text-[var(--accent)]" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-[var(--foreground)]">{item.label}</div>
                        <div className="mt-1 text-xs leading-6 text-[var(--muted-foreground)]">
                          {item.description}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto rounded-[28px] border border-white/10 bg-white/4 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                <Cpu className="h-4 w-4 text-[var(--accent)]" />
                环境状态
              </div>
              <div className="grid gap-2 text-sm text-[var(--muted-foreground)]">
                <div>Device: {environment?.device ?? "检测中..."}</div>
                <div>Python: {environment?.pythonVersion ?? "检测中..."}</div>
                <div>ffmpeg: {environment?.ffmpegAvailable ? "ready" : "missing"}</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 py-2">
          {activeView === "workbench" ? <WorkbenchPage /> : null}
          {activeView === "history" ? <HistoryPage /> : null}
          {activeView === "models" ? <ModelsPage /> : null}
          {activeView === "settings" ? <SettingsPage /> : null}
        </main>
      </div>
    </div>
  );
}

export default App;
