import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AreaRenderer, registerPlugins } from "./componentRegistry";
import {
  getHubUrl,
  getStandaloneWorkflowKey,
  getWorkflowPageUrl,
  isStandaloneWorkflowPage,
  readHubWorkflowKeyFromUrl,
  rememberHubContextFromPath,
  replaceHubUrlWorkflowParam,
} from "./hostRuntime";
import type { WorkflowUiPlugin } from "./pluginTypes";
import WorkflowAccentSettings from "./WorkflowAccentSettings";
import {
  EMPTY_LAYOUT,
  listWorkflows,
  saveWorkflow,
  type AreaDefinition,
  type ComponentPlacement,
  type LayoutDefinition,
  type WorkflowDesign,
} from "./workflowService";

interface Props {
  plugins: WorkflowUiPlugin[];
}

/** Built-in hub workflows: column width drag should not overwrite shared definitions */
const WORKFLOW_KEYS_NO_LAYOUT_SAVE = new Set(["workflow-design", "add-workflow"]);

const STORAGE_KEY = "myflow_base:activeWorkflow";
const STORAGE_AREA_WIDTHS_PREFIX = "myflow_base:areaWidths:";

const MIN_AREA_PX = 120;
const GRIP_PX = 5;

function parseCssWidthToPx(width: string | undefined, referencePx: number, fallback: number): number {
  if (!width || !String(width).trim()) return fallback;
  const s = String(width).trim().toLowerCase();
  const px = /^([\d.]+)px$/.exec(s);
  if (px) {
    const n = Number(px[1]);
    return Number.isFinite(n) ? Math.max(MIN_AREA_PX, Math.round(n)) : fallback;
  }
  const pct = /^([\d.]+)%$/.exec(s);
  if (pct) {
    const n = Number(pct[1]);
    return Number.isFinite(n)
      ? Math.max(MIN_AREA_PX, Math.round((referencePx * n) / 100))
      : fallback;
  }
  return fallback;
}

function loadStoredAreaWidths(key: string): { left?: string; middle?: string } {
  if (!key) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_AREA_WIDTHS_PREFIX + key);
    if (!raw) return {};
    const o = JSON.parse(raw) as { left?: unknown; middle?: unknown };
    return {
      left: typeof o.left === "string" ? o.left : undefined,
      middle: typeof o.middle === "string" ? o.middle : undefined,
    };
  } catch {
    return {};
  }
}

function saveStoredAreaWidths(key: string, leftPx: number, middlePx: number) {
  if (!key) return;
  try {
    window.localStorage.setItem(
      STORAGE_AREA_WIDTHS_PREFIX + key,
      JSON.stringify({ left: `${Math.round(leftPx)}px`, middle: `${Math.round(middlePx)}px` })
    );
  } catch {
    /* ignore */
  }
}

function clearStoredAreaWidths(key: string) {
  if (!key) return;
  try {
    window.localStorage.removeItem(STORAGE_AREA_WIDTHS_PREFIX + key);
  } catch {
    /* ignore */
  }
}

type GripKind = "lm" | "mr" | "lr";

interface ResizableWorkflowLayoutProps {
  layout: LayoutDefinition;
  workflowKey: string;
  /** When set, widths load from layout only (not localStorage) and this runs after each drag to persist. */
  onPersistWidths?: (leftPx: number, middlePx: number) => Promise<void>;
}

const ResizableWorkflowLayout: React.FC<ResizableWorkflowLayoutProps> = ({
  layout,
  workflowKey,
  onPersistWidths,
}) => {
  const layoutRef = useRef<HTMLDivElement>(null);
  const sizesRef = useRef({ left: 280, middle: 400 });
  const [sizes, setSizes] = useState({ left: 280, middle: 400 });
  const [drag, setDrag] = useState<{
    kind: GripKind;
    startX: number;
    startLeft: number;
    startMiddle: number;
  } | null>(null);

  const leftOn = layout.left.components.length > 0;
  const midOn = layout.middle.components.length > 0;
  const rightOn = layout.right.components.length > 0;

  const gripCount = (leftOn && midOn ? 1 : 0) + (midOn && rightOn ? 1 : 0) + (leftOn && !midOn && rightOn ? 1 : 0);

  useLayoutEffect(() => {
    const el = layoutRef.current;
    const cw = el?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1200);
    const saved = onPersistWidths ? {} : loadStoredAreaWidths(workflowKey);
    const lStr = saved.left ?? layout.left.width;
    const mStr = saved.middle ?? layout.middle.width;
    const next = {
      left: parseCssWidthToPx(lStr, cw, Math.min(280, Math.floor(cw * 0.22))),
      middle: parseCssWidthToPx(mStr, cw, Math.min(420, Math.floor(cw * 0.32))),
    };
    sizesRef.current = next;
    setSizes(next);
  }, [workflowKey, layout.left.width, layout.middle.width, onPersistWidths]);

  useEffect(() => {
    sizesRef.current = sizes;
  }, [sizes]);

  useEffect(() => {
    if (!drag) return;
    const rightMin = (() => {
      const el = layoutRef.current;
      const cw = el?.clientWidth || 800;
      return parseCssWidthToPx(layout.right.width, cw, MIN_AREA_PX);
    })();

    const onMove = (e: PointerEvent) => {
      const cw = layoutRef.current?.clientWidth;
      if (!cw) return;
      const gripSpace = gripCount * GRIP_PX;
      const dx = e.clientX - drag.startX;

      if (drag.kind === "lm") {
        const maxLeft = rightOn
          ? cw - drag.startMiddle - rightMin - gripSpace - MIN_AREA_PX
          : cw - gripSpace - MIN_AREA_PX;
        const nextLeft = Math.min(maxLeft, Math.max(MIN_AREA_PX, drag.startLeft + dx));
        setSizes((s) => {
          const u = { ...s, left: nextLeft };
          sizesRef.current = u;
          return u;
        });
      } else if (drag.kind === "mr") {
        const maxMid =
          cw - drag.startLeft - rightMin - gripSpace - MIN_AREA_PX;
        const nextMid = Math.min(maxMid, Math.max(MIN_AREA_PX, drag.startMiddle + dx));
        setSizes((s) => {
          const u = { ...s, middle: nextMid };
          sizesRef.current = u;
          return u;
        });
      } else if (drag.kind === "lr") {
        const maxLeft = cw - rightMin - GRIP_PX - MIN_AREA_PX;
        const nextLeft = Math.min(maxLeft, Math.max(MIN_AREA_PX, drag.startLeft + dx));
        setSizes((s) => {
          const u = { ...s, left: nextLeft };
          sizesRef.current = u;
          return u;
        });
      }
    };

    const onUp = () => {
      const L = sizesRef.current.left;
      const M = sizesRef.current.middle;
      setDrag(null);
      if (onPersistWidths) {
        void onPersistWidths(L, M).catch((err) => {
          console.error("Failed to save workflow column widths", err);
        });
      } else {
        saveStoredAreaWidths(workflowKey, L, M);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, gripCount, layout.right.width, workflowKey, rightOn, onPersistWidths]);

  const startDragLm = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      kind: "lm",
      startX: e.clientX,
      startLeft: sizes.left,
      startMiddle: sizes.middle,
    });
  };
  const startDragMr = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      kind: "mr",
      startX: e.clientX,
      startLeft: leftOn ? sizes.left : 0,
      startMiddle: sizes.middle,
    });
  };
  const startDragLr = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      kind: "lr",
      startX: e.clientX,
      startLeft: sizes.left,
      startMiddle: sizes.middle,
    });
  };

  const renderArea = (area: AreaDefinition, position: "left" | "middle" | "right") => {
    const style: React.CSSProperties = { minWidth: MIN_AREA_PX };
    if (position === "left") {
      style.flex = `0 0 ${sizes.left}px`;
    } else if (position === "middle") {
      if (rightOn) {
        style.flex = `0 0 ${sizes.middle}px`;
      } else {
        style.flex = "1 1 0";
      }
      if (layout.middle.width && !rightOn) {
        style.minWidth = layout.middle.width;
      }
    } else {
      style.flex = "1 1 0";
      if (layout.right.width) {
        style.minWidth = layout.right.width;
      }
    }
    return (
      <div key={position} className={`page-area page-area-${position}`} style={style}>
        <AreaRenderer components={area.components} />
      </div>
    );
  };

  const gripCls = `page-layout-grip${drag ? " page-layout-grip--active" : ""}`;

  const nodes: React.ReactNode[] = [];
  if (leftOn) nodes.push(renderArea(layout.left, "left"));
  if (leftOn && midOn) {
    nodes.push(
      <div
        key="grip-lm"
        className={gripCls}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize left and middle columns"
        onPointerDown={startDragLm}
      />
    );
  }
  if (midOn) nodes.push(renderArea(layout.middle, "middle"));
  if (midOn && rightOn) {
    nodes.push(
      <div
        key="grip-mr"
        className={gripCls}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize middle and right columns"
        onPointerDown={startDragMr}
      />
    );
  }
  if (leftOn && !midOn && rightOn) {
    nodes.push(
      <div
        key="grip-lr"
        className={gripCls}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize left and right columns"
        onPointerDown={startDragLr}
      />
    );
  }
  if (rightOn) nodes.push(renderArea(layout.right, "right"));

  if (nodes.length === 0) return null;

  return (
    <div
      ref={layoutRef}
      className={`page-layout${drag ? " page-layout--resizing" : ""}`}
    >
      {nodes}
    </div>
  );
};

const WorkflowShell: React.FC<Props> = ({ plugins }) => {
  // Sync module registry before render uses AreaRenderer/getComponent — not useEffect,
  // which runs after paint and leaves stale COMPONENT_MAP until unrelated state updates.
  registerPlugins(plugins);

  const standaloneKey = getStandaloneWorkflowKey();
  const standaloneMode = isStandaloneWorkflowPage();

  const [workflows, setWorkflows] = useState<WorkflowDesign[]>([]);
  const [loadingWfs, setLoadingWfs] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string>(() => {
    if (standaloneKey) return standaloneKey;
    const fromUrl = readHubWorkflowKeyFromUrl();
    if (fromUrl) return fromUrl;
    try {
      return window.localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    rememberHubContextFromPath();
  }, []);

  const loadWorkflows = useCallback(async () => {
    setLoadError(null);
    try {
      const wfs = await listWorkflows();
      setWorkflows(wfs);
    } catch (e) {
      setWorkflows([]);
      setLoadError(e instanceof Error ? e.message : "Failed to load workflows");
    } finally {
      setLoadingWfs(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  // After workflows load, pick a valid active key (standalone + hub).
  useEffect(() => {
    if (loadingWfs || workflows.length === 0) return;

    if (standaloneMode && standaloneKey) {
      const found = workflows.some((w) => w.key === standaloneKey);
      if (found) {
        setActiveKey(standaloneKey);
      }
      return;
    }

    const fromUrl = readHubWorkflowKeyFromUrl();
    if (fromUrl && workflows.some((w) => w.key === fromUrl)) {
      setActiveKey(fromUrl);
      return;
    }

    setActiveKey((prev) => {
      if (workflows.some((w) => w.key === prev)) return prev;
      return workflows[0].key;
    });
  }, [loadingWfs, workflows, standaloneMode, standaloneKey]);

  // Keep `?wf=` in sync on hub (shareable links, refresh).
  useEffect(() => {
    if (standaloneMode || loadingWfs) return;
    if (!activeKey || workflows.length === 0) return;
    if (!workflows.some((w) => w.key === activeKey)) return;
    replaceHubUrlWorkflowParam(activeKey);
  }, [standaloneMode, loadingWfs, activeKey, workflows]);

  // Browser back/forward: follow `?wf=`.
  useEffect(() => {
    if (standaloneMode) return;
    const onPop = () => {
      if (workflows.length === 0) return;
      const wf = readHubWorkflowKeyFromUrl();
      if (wf && workflows.some((w) => w.key === wf)) {
        setActiveKey(wf);
        try {
          window.localStorage.setItem(STORAGE_KEY, wf);
        } catch {
          /* ignore */
        }
        return;
      }
      let stored = "";
      try {
        stored = window.localStorage.getItem(STORAGE_KEY) || "";
      } catch {
        /* ignore */
      }
      const next =
        stored && workflows.some((w) => w.key === stored) ? stored : workflows[0].key;
      setActiveKey(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [standaloneMode, workflows]);

  const handleTabChange = (key: string) => {
    setActiveKey(key);
    if (!standaloneMode) {
      try {
        window.localStorage.setItem(STORAGE_KEY, key);
      } catch {
        // ignore
      }
    }
  };

  const navigateToWorkflowKey = useCallback((key: string) => {
    if (getStandaloneWorkflowKey() !== null) {
      window.location.assign(getWorkflowPageUrl(key));
      return;
    }
    setActiveKey(key);
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* ignore */
    }
  }, []);

  const activeWorkflow = workflows.find((w) => w.key === activeKey) ?? null;
  const layout: LayoutDefinition = normalizeLayout(activeWorkflow?.layout);

  const persistLayoutWidths = useCallback(
    async (leftPx: number, middlePx: number) => {
      const wf = workflows.find((w) => w.key === activeKey);
      if (!wf?.id || WORKFLOW_KEYS_NO_LAYOUT_SAVE.has(wf.key)) return;
      const normalized = normalizeLayout(wf.layout);
      const nextLayout: LayoutDefinition = {
        left: { ...normalized.left, width: `${Math.round(leftPx)}px` },
        middle: { ...normalized.middle, width: `${Math.round(middlePx)}px` },
        right: { ...normalized.right },
      };
      await saveWorkflow({
        id: wf.id,
        name: wf.name,
        key: wf.key,
        layout: nextLayout,
      });
      clearStoredAreaWidths(wf.key);
      await loadWorkflows();
    },
    [workflows, activeKey, loadWorkflows]
  );

  const standaloneMissing =
    standaloneMode &&
    standaloneKey &&
    !loadingWfs &&
    workflows.length > 0 &&
    !workflows.some((w) => w.key === standaloneKey);

  const areas = (
    <ResizableWorkflowLayout
      layout={layout}
      workflowKey={activeKey || ""}
      onPersistWidths={
        activeWorkflow?.id && !WORKFLOW_KEYS_NO_LAYOUT_SAVE.has(activeWorkflow.key)
          ? persistLayoutWidths
          : undefined
      }
    />
  );

  const wrapped = useMemo(() => {
    if (loadingWfs) return null;
    let node: React.ReactNode = areas;
    for (const plugin of plugins) {
      if (plugin.wrap) {
        node = plugin.wrap({
          activeWorkflowKey: activeKey,
          workflows,
          reloadWorkflows: () => void loadWorkflows(),
          navigateToWorkflowKey,
          children: node,
        });
      }
    }
    return node;
  }, [loadingWfs, plugins, activeKey, workflows, areas, loadWorkflows]);

  if (loadingWfs) {
    return (
      <div className="container">
        <div style={{ padding: "2rem", color: "#6c757d" }}>Loading workflows...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container">
        <div className="workflow-error-panel">
          <p>{loadError}</p>
          <button type="button" className="workflow-link-button" onClick={() => void loadWorkflows()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (standaloneMissing) {
    return (
      <div className="container">
        <div className="workflow-standalone-bar">
          <a className="workflow-hub-link" href={getHubUrl()}>
            ← All workflows
          </a>
        </div>
        <div className="workflow-error-panel">
          <p>
            No workflow with key <code>{standaloneKey}</code> was found (or it is inactive).
          </p>
          <a className="workflow-link-button" href={getHubUrl()}>
            Back to hub
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {standaloneMode && activeWorkflow && (
        <header className="workflow-standalone-bar">
          <a className="workflow-hub-link" href={getHubUrl()}>
            ← All workflows
          </a>
          <span className="workflow-standalone-title">{activeWorkflow.name}</span>
          <span className="workflow-standalone-key mono">{activeWorkflow.key}</span>
          <WorkflowAccentSettings />
        </header>
      )}

      {!standaloneMode && (
        <div className="workflow-top-bar">
          <nav className="workflow-nav" aria-label="Workflows">
            {workflows.map((w) => (
              <div key={w.key} className="workflow-tab-wrap">
                <button
                  type="button"
                  className={`workflow-tab ${activeKey === w.key ? "active" : ""}`}
                  onClick={() => handleTabChange(w.key)}
                >
                  {w.name}
                </button>
                <a
                  className="workflow-open-own-page"
                  href={getWorkflowPageUrl(w.key)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open “${w.name}” in its own page`}
                  aria-label={`Open ${w.name} in a new browser tab`}
                >
                  ⧉
                </a>
              </div>
            ))}
          </nav>
          <WorkflowAccentSettings />
        </div>
      )}

      {wrapped}
    </div>
  );
};

function normalizeLayout(raw: unknown): LayoutDefinition {
  if (!raw || typeof raw !== "object") return EMPTY_LAYOUT;
  const toArea = (area: unknown): AreaDefinition => {
    const typedArea = area as { width?: unknown; components?: unknown[] } | undefined;
    const comps = Array.isArray(typedArea?.components) ? typedArea.components : [];
    const safeComps = comps
      .filter(
        (c): c is { key: string; size: "full" | "half"; menuViewType?: unknown } =>
          Boolean(c) &&
          typeof (c as { key?: unknown }).key === "string" &&
          (((c as { size?: unknown }).size === "full") ||
            (c as { size?: unknown }).size === "half")
      )
      .map((c) => {
        const placement: ComponentPlacement = { key: c.key, size: c.size };
        const mvt = (c as { menuViewType?: unknown }).menuViewType;
        if (typeof mvt === "string" && mvt.trim()) placement.menuViewType = mvt;
        return placement;
      });
    const width = typeof typedArea?.width === "string" ? typedArea.width : undefined;
    return { width, components: safeComps };
  };

  const typedRaw = raw as { left?: unknown; middle?: unknown; right?: unknown };
  const left = toArea(typedRaw.left);
  const middle = toArea(typedRaw.middle);
  const right = toArea(typedRaw.right);
  const hasAny = left.components.length + middle.components.length + right.components.length > 0;
  return hasAny ? { left, middle, right } : EMPTY_LAYOUT;
}

export default WorkflowShell;
