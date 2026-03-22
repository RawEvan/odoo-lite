import React, { useEffect, useMemo, useState } from "react";
import WorkflowAccentSettings from "../runtime/WorkflowAccentSettings";
import { ComponentRenderer, getComponentCatalog, registerPlugins } from "../runtime/componentRegistry";
import type { ComponentMeta, WorkflowUiPlugin } from "../runtime/pluginTypes";

type AreaKey = "left" | "middle" | "right";

const AREA_KEYS: AreaKey[] = ["left", "middle", "right"];
const COMPOSER_SELECTION_KEY = "wfComposerSelection";

function normalizeViewTypeLabel(viewType: string): string {
  return viewType === "tree" ? "list" : viewType;
}

function parseAreaFromQuery(): AreaKey {
  try {
    const area = new URLSearchParams(window.location.search).get("area");
    if (area === "left" || area === "middle" || area === "right") return area;
  } catch {
    /* ignore */
  }
  return "left";
}

function parseReturnUrl(): string {
  try {
    const returnUrl = new URLSearchParams(window.location.search).get("return");
    if (returnUrl && returnUrl.startsWith("/")) return returnUrl;
  } catch {
    /* ignore */
  }
  return "/myflow_base?wf=workflow-design";
}

interface Props {
  plugins: WorkflowUiPlugin[];
}

function menuViewTypeKeys(meta: ComponentMeta): string[] {
  if (meta.viewTypes?.length) return meta.viewTypes;
  if (meta.viewType) return [meta.viewType];
  return [];
}

function menuMatchesViewTypeFilter(meta: ComponentMeta, filter: string): boolean {
  if (filter === "__all__") return true;
  return menuViewTypeKeys(meta).includes(filter);
}

const WorkflowComposerPage: React.FC<Props> = ({ plugins }) => {
  const [activeArea, setActiveArea] = useState<AreaKey>(() => parseAreaFromQuery());
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("__all__");
  const [viewTypeFilter, setViewTypeFilter] = useState("__all__");
  const [composerLayout, setComposerLayout] = useState<Record<AreaKey, string | null>>({
    left: null,
    middle: null,
    right: null,
  });
  /** Per menu component key: chosen view type (tree/form/…) for insert + preview. */
  const [menuViewByKey, setMenuViewByKey] = useState<Record<string, string>>({});
  const returnUrl = parseReturnUrl();

  const componentCatalog = useMemo(() => {
    registerPlugins(plugins);
    return getComponentCatalog();
  }, [plugins]);

  /** Keep preview in sync with the toolbar view-type filter (no in-component selector). */
  useEffect(() => {
    if (viewTypeFilter === "__all__") return;
    const key = composerLayout[activeArea];
    if (!key) return;
    const meta = componentCatalog.find((m) => m.key === key);
    if (!meta) return;
    if (!menuViewTypeKeys(meta).includes(viewTypeFilter)) return;
    setMenuViewByKey((prev) => (prev[key] === viewTypeFilter ? prev : { ...prev, [key]: viewTypeFilter }));
  }, [viewTypeFilter, activeArea, composerLayout, componentCatalog]);

  const viewTypeOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const m of componentCatalog) {
      if (m.source !== "menu") continue;
      for (const vt of menuViewTypeKeys(m)) {
        if (vt) unique.add(vt);
      }
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [componentCatalog]);

  const menuItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return componentCatalog
      .filter((m) => m.source === "menu")
      .filter((m) => (modelFilter === "__all__" ? true : (m.model || "") === modelFilter))
      .filter((m) => menuMatchesViewTypeFilter(m, viewTypeFilter))
      .filter((m) => {
        if (!q) return true;
        const typeLabels = menuViewTypeKeys(m).map(normalizeViewTypeLabel).join(" ");
        const blob = [m.name, m.description, m.model || "", m.menuPath || "", typeLabels]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => (a.menuPath || a.name).localeCompare(b.menuPath || b.name));
  }, [componentCatalog, modelFilter, viewTypeFilter, search]);

  const modelOptions = useMemo(() => {
    const values = new Set<string>();
    for (const m of componentCatalog) {
      if (m.source !== "menu" || !m.model) continue;
      values.add(m.model);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [componentCatalog]);

  const selectMenuForActiveArea = (meta: ComponentMeta) => {
    setComposerLayout((prev) => ({ ...prev, [activeArea]: meta.key }));
    const primary = meta.viewType || meta.viewTypes?.[0] || "";
    if (primary) {
      setViewTypeFilter(primary);
      setMenuViewByKey((prev) => ({ ...prev, [meta.key]: prev[meta.key] || primary }));
    }
  };

  const insertToWorkflow = () => {
    const key = composerLayout[activeArea];
    if (!key) return;
    const meta = componentCatalog.find((m) => m.key === key);
    const typeKeys = meta ? menuViewTypeKeys(meta) : [];
    const chosen =
      menuViewByKey[key]?.trim() || typeKeys[0] || "";
    const selection: {
      area: AreaKey;
      key: string;
      nonce: number;
      menuViewType?: string;
    } = {
      area: activeArea,
      key,
      nonce: Date.now(),
    };
    if (chosen) selection.menuViewType = chosen;
    try {
      window.sessionStorage.setItem(COMPOSER_SELECTION_KEY, JSON.stringify(selection));
    } catch {
      /* ignore */
    }
    window.location.href = returnUrl;
  };

  return (
    <div className="container wfd-composer-page">
      <header className="wfd-composer-page-header">
        <a className="workflow-hub-link" href={returnUrl}>
          ← Back to workflow design
        </a>
        <div className="wfd-composer-page-title">Workflow Composer</div>
        <WorkflowAccentSettings />
      </header>

      <div className="wfd-browser-tabs" role="tablist" aria-label="Composer area tabs">
        {AREA_KEYS.map((area) => (
          <button
            key={area}
            type="button"
            className={`wfd-browser-tab ${activeArea === area ? "active" : ""}`}
            onClick={() => setActiveArea(area)}
          >
            {area.toUpperCase()} Area
          </button>
        ))}
      </div>

      <div className="wfd-composer-layout wfd-composer-layout-fullscreen">
        {AREA_KEYS.map((area) => (
          <div
            key={area}
            className={`wfd-composer-area ${activeArea === area ? "active" : ""}`}
            onClick={() => setActiveArea(area)}
          >
            <div className="wfd-composer-area-title">{area.toUpperCase()} Area</div>
            {composerLayout[area] ? (
              <div className="wfd-composer-preview wfd-composer-preview-large">
                <ComponentRenderer
                  componentKey={composerLayout[area] as string}
                  menuViewType={(() => {
                    const k = composerLayout[area] as string;
                    const m = componentCatalog.find((x) => x.key === k);
                    const opts = m ? menuViewTypeKeys(m) : [];
                    return menuViewByKey[k] || opts[0] || undefined;
                  })()}
                  onMenuViewTypeChange={(next) => {
                    const k = composerLayout[area] as string;
                    setMenuViewByKey((prev) => ({ ...prev, [k]: next }));
                  }}
                />
              </div>
            ) : (
              <div className="wfd-composer-empty">Empty area</div>
            )}
          </div>
        ))}
      </div>

      <div className="wfd-composer-toolbar">
        <input
          className="wfd-input wfd-filter-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menus..."
        />
        <select
          className="wfd-add-component wfd-filter-select"
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
        >
          <option value="__all__">All models</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          className="wfd-add-component wfd-filter-select"
          value={viewTypeFilter}
          onChange={(e) => setViewTypeFilter(e.target.value)}
        >
          <option value="__all__">All view types</option>
          {viewTypeOptions.map((vt) => (
            <option key={vt} value={vt}>
              {normalizeViewTypeLabel(vt)}
            </option>
          ))}
        </select>
        <button type="button" className="wfd-save-btn" onClick={insertToWorkflow} disabled={!composerLayout[activeArea]}>
          Insert {activeArea.toUpperCase()} into workflow
        </button>
      </div>

      <div className="wfd-browser-menu-list wfd-browser-menu-list-fullscreen">
        {menuItems.map((meta) => {
          const active = composerLayout[activeArea] === meta.key;
          const typeKeys = menuViewTypeKeys(meta);
          return (
            <button
              key={meta.key}
              type="button"
              className={`wfd-browser-menu-item ${active ? "active" : ""}`}
              onClick={() => selectMenuForActiveArea(meta)}
            >
              <span className="wfd-browser-menu-path">{meta.menuPath || meta.name}</span>
              <span className="wfd-browser-menu-meta">
                {meta.model || "unknown.model"}
                {typeKeys.length > 0 ? ` · ${typeKeys.map(normalizeViewTypeLabel).join(", ")}` : ""}
              </span>
            </button>
          );
        })}
        {menuItems.length === 0 && <div className="wfd-filter-empty">No menu components available.</div>}
      </div>
    </div>
  );
};

export default WorkflowComposerPage;
