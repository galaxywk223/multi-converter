import { History, LibraryBig, Settings2, Waves } from "lucide-react";
import { startTransition, useEffect } from "react";

import { HistoryPage } from "./pages/history-page";
import { ModelsPage } from "./pages/models-page";
import { SettingsPage } from "./pages/settings-page";
import { WorkbenchPage } from "./pages/workbench-page";
import type { ViewName } from "./lib/types";
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

  useEffect(() => {
    void initialize();
    void connectEvents();
    void connectInputDrops();
  }, [connectEvents, connectInputDrops, initialize]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto min-h-screen max-w-[1180px] px-4 py-5 lg:px-6">
        <header className="mb-5 flex flex-col gap-4 rounded-3xl border border-[#e3e8ef] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">多功能转换器</h1>
          </div>
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeView;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => startTransition(() => setActiveView(item.id))}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                    active
                      ? "border-[#cfe0ff] bg-[#eff6ff] text-[#1d4ed8]"
                      : "border-[#e3e8ef] bg-white text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        <main className="min-w-0">
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
