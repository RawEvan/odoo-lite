import React, { useEffect, useState } from "react";
import { WorkflowAccentProvider } from "./base/runtime/WorkflowAccentContext";
import WorkflowShell from "./base/runtime/WorkflowShell";
import { isWorkflowComposerPage } from "./base/runtime/hostRuntime";
import type { WorkflowUiPlugin } from "./base/runtime/pluginTypes";
import { buildOdooMenuLinksPlugin } from "./base/plugins/odooMenuLinksPlugin";
import { buildOdooStandardViewsPlugin } from "./base/plugins/odooStandardViewsPlugin";
import WorkflowComposerPage from "./base/workflowDesign/WorkflowComposerPage";

const App: React.FC = () => {
  const [plugins, setPlugins] = useState<WorkflowUiPlugin[]>(() => loadPlugins());

  useEffect(() => {
    let alive = true;
    void Promise.all([buildOdooStandardViewsPlugin(), buildOdooMenuLinksPlugin()])
      .then((dynamicPlugins) => {
        const loaded = dynamicPlugins.filter((p): p is WorkflowUiPlugin => Boolean(p));
        if (!alive || loaded.length === 0) return;
        setPlugins((prev) => {
          const dynamicIds = new Set(loaded.map((p) => p.id));
          const without = prev.filter((p) => !dynamicIds.has(p.id));
          return [...without, ...loaded].sort((a, b) => a.id.localeCompare(b.id));
        });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[workflow] failed to build dynamic plugins:", message);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <WorkflowAccentProvider>
      {isWorkflowComposerPage() ? (
        <WorkflowComposerPage plugins={plugins} />
      ) : (
        <WorkflowShell plugins={plugins} />
      )}
    </WorkflowAccentProvider>
  );
};

function loadPlugins(): WorkflowUiPlugin[] {
  const baseModules = import.meta.glob("./base/plugins/**/*.tsx", { eager: true });
  // Host app should stay self-contained: extension plugins are loaded by their own addon hubs.
  const rawModules = [...Object.values(baseModules)];
  const candidates = rawModules.flatMap((m) => Object.values(m as Record<string, unknown>));
  const plugins = candidates.filter(isWorkflowPlugin) as WorkflowUiPlugin[];
  return plugins.sort((a, b) => a.id.localeCompare(b.id));
}

function isWorkflowPlugin(x: unknown): x is WorkflowUiPlugin {
  if (!x || typeof x !== "object") return false;
  const p = x as Partial<WorkflowUiPlugin>;
  return (
    typeof p.id === "string" &&
    Array.isArray(p.componentCatalog) &&
    !!p.components &&
    typeof p.components === "object"
  );
}

export default App;
