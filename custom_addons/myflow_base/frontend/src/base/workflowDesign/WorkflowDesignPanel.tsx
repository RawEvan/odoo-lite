import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWorkflowDesign } from "./WorkflowDesignContext";
import { ComponentRenderer, getComponentCatalog } from "../runtime/componentRegistry";
import { getWorkflowComposerUrl, getWorkflowKeyHref } from "../runtime/hostRuntime";
import { menuActionUrlWithViewType } from "../runtime/menuRenderEngine";
import type { ComponentMeta } from "../runtime/pluginTypes";
import {
  buildWorkflowAiCatalogEntries,
  buildWorkflowAiExternalContextJson,
  EMPTY_LAYOUT,
  fetchWorkflowAiProviders,
  saveWorkflow,
  suggestWorkflowLayoutFromAi,
  tryApplyWorkflowAiDesignText,
  type ComponentPlacement,
  type WorkflowAiProviderId,
} from "../runtime/workflowService";

import "./WorkflowDesignPanel.css";

const BUILTIN_WORKFLOW_KEYS = new Set(["workflow-design", "add-workflow"]);
const ADD_WORKFLOW_KEY = "add-workflow";
const ADD_PREVIEW_MIN_COL = 120;
const ADD_PREVIEW_GRIP_PX = 5;
const SS_AI_PROVIDER = "wfAddWorkflowAiProvider";

export const WorkflowListComponent: React.FC = () => {
  const {
    workflows,
    selectedId,
    setSelectedId,
    handleDeleteWorkflow,
    deleting,
    message,
    navigateToWorkflowKey,
  } = useWorkflowDesign();
  return (
    <div style={{ padding: "0.75rem" }}>
      <div className="wfd-list-toolbar">
        <div className="wfd-section-title">Workflows</div>
        <a
          className="wfd-add-workflow-btn"
          href={getWorkflowKeyHref(ADD_WORKFLOW_KEY)}
          onClick={(e) => {
            e.preventDefault();
            navigateToWorkflowKey(ADD_WORKFLOW_KEY);
          }}
        >
          Add workflow
        </a>
      </div>
      {message && <div className="wfd-message">{message}</div>}
      <div className="wfd-list-items">
        {workflows.map((w) => (
          <div
            key={w.id ?? w.key}
            className={`wfd-list-item ${typeof w.id === "number" && selectedId === w.id ? "active" : ""}`}
            onClick={() => typeof w.id === "number" && setSelectedId(w.id)}
          >
            <div className="wfd-list-item-row">
              <div className="wfd-list-item-text">
                <div className="wfd-list-item-name">{w.name}</div>
                <div className="wfd-list-item-key">{w.key}</div>
              </div>
              {typeof w.id === "number" && !BUILTIN_WORKFLOW_KEYS.has(w.key) && (
                <button
                  type="button"
                  className="wfd-list-delete-btn"
                  title="Delete workflow"
                  disabled={deleting}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      !window.confirm(
                        `Delete workflow "${w.name}" (${w.key})? This cannot be undone.`
                      )
                    ) {
                      return;
                    }
                    void handleDeleteWorkflow(w.id as number);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
        {workflows.length === 0 && <div className="wfd-empty">No workflows found.</div>}
      </div>
    </div>
  );
};

const AREA_KEYS = ["left", "middle", "right"] as const;
type AreaKey = (typeof AREA_KEYS)[number];
const ALL_FILTER = "__all__";
const MENU_SOURCE = "menu";
const COMPOSER_SELECTION_KEY = "wfComposerSelection";
const SOURCE_LABELS: Record<string, string> = {
  customized: "Customized",
  menu: "Menu Linked",
  "odoo-view": "Odoo Standard Views",
  native: "Native",
};

function normalizeViewTypeLabel(viewType: string): string {
  return viewType === "tree" ? "list" : viewType;
}

function metaViewTypeKeys(meta: { viewTypes?: string[]; viewType?: string }): string[] {
  if (meta.viewTypes?.length) return meta.viewTypes;
  if (meta.viewType) return [meta.viewType];
  return [];
}

function normalizeNewWorkflowKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const MENU_PATH_SEP = "\u001f";

interface MenuGroupNode {
  label: string;
  pathKey: string;
  sub: Map<string, MenuGroupNode>;
  leaves: ComponentMeta[];
}

function pathSegmentsForMeta(meta: ComponentMeta): string[] {
  if (meta.source === MENU_SOURCE) {
    const p = (meta.menuPath || meta.name || "").trim();
    if (p.length > 0) {
      return p.split("/").map((s) => s.trim()).filter(Boolean);
    }
    return ["Menu", meta.name || meta.key];
  }
  const cat = (meta.category || "General").trim() || "General";
  return ["Customized", cat, meta.name || meta.key];
}

function ancestorPathKeys(segments: string[]): string[] {
  const keys: string[] = [];
  let acc = "";
  for (let i = 0; i < segments.length; i++) {
    acc = i === 0 ? segments[i] : `${acc}${MENU_PATH_SEP}${segments[i]}`;
    keys.push(acc);
  }
  return keys;
}

function buildMenuOptionTree(metas: ComponentMeta[]): MenuGroupNode {
  const root: MenuGroupNode = { label: "", pathKey: "", sub: new Map(), leaves: [] };
  for (const meta of metas) {
    const parts = pathSegmentsForMeta(meta);
    let node = root;
    for (const seg of parts) {
      let next = node.sub.get(seg);
      if (!next) {
        const pathKey = node.pathKey ? `${node.pathKey}${MENU_PATH_SEP}${seg}` : seg;
        next = { label: seg, pathKey, sub: new Map(), leaves: [] };
        node.sub.set(seg, next);
      }
      node = next;
    }
    node.leaves.push(meta);
  }
  return root;
}

function collectAllGroupPathKeys(node: MenuGroupNode): string[] {
  const keys: string[] = [];
  node.sub.forEach((child) => {
    keys.push(child.pathKey);
    keys.push(...collectAllGroupPathKeys(child));
  });
  return keys;
}

interface AddWorkflowMenuHierarchyProps {
  tree: MenuGroupNode;
  expandedPathKeys: Set<string>;
  onTogglePath: (pathKey: string) => void;
  selectedOptionKey: string;
  onSelectOption: (key: string) => void;
}

const AddWorkflowMenuHierarchy: React.FC<AddWorkflowMenuHierarchyProps> = ({
  tree,
  expandedPathKeys,
  onTogglePath,
  selectedOptionKey,
  onSelectOption,
}) => {
  const renderLevel = (parent: MenuGroupNode, depth: number): React.ReactNode => {
    const groups = [...parent.sub.values()].sort((a, b) => a.label.localeCompare(b.label));
    return (
      <>
        {groups.map((node) => {
          const hasKids = node.sub.size > 0 || node.leaves.length > 0;
          const open = expandedPathKeys.has(node.pathKey);
          const sortedLeaves = [...node.leaves].sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div key={node.pathKey} className="wfa-hier-node">
              {hasKids ? (
                <button
                  type="button"
                  className="wfa-hier-toggle"
                  aria-expanded={open}
                  style={{ paddingLeft: `${10 + depth * 12}px` }}
                  onClick={() => onTogglePath(node.pathKey)}
                >
                  <span className="wfa-hier-chev" aria-hidden>
                    {open ? "▼" : "▶"}
                  </span>
                  <span className="wfa-hier-label">{node.label}</span>
                </button>
              ) : (
                <div className="wfa-hier-spacer" style={{ paddingLeft: `${10 + depth * 12}px` }} />
              )}
              {open && (
                <div className="wfa-hier-children">
                  {renderLevel(node, depth + 1)}
                  {sortedLeaves.map((meta) => {
                    const vtLine = metaViewTypeKeys(meta);
                    return (
                      <button
                        key={meta.key}
                        type="button"
                        className={`wfa-option-item wfa-hier-leaf ${selectedOptionKey === meta.key ? "active" : ""}`}
                        style={{ marginLeft: `${6 + (depth + 1) * 12}px` }}
                        onClick={() => onSelectOption(meta.key)}
                      >
                        <span className="wfa-option-name">{meta.name}</span>
                        <span className="wfa-option-meta">
                          {(meta.source && SOURCE_LABELS[meta.source]) || meta.source || "Component"}
                          {meta.model ? ` · ${meta.model}` : ""}
                          {vtLine.length > 0 ? ` · ${vtLine.map(normalizeViewTypeLabel).join(", ")}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </>
    );
  };

  if (tree.sub.size === 0 && tree.leaves.length === 0) {
    return <div className="wfd-filter-empty">No available menu/customized components found.</div>;
  }

  return <div className="wfa-hier-root">{renderLevel(tree, 0)}</div>;
};

interface AddWorkflowMegaMenuProps {
  tree: MenuGroupNode;
  selectedOptionKey: string;
  onSelectOption: (key: string) => void;
}

function megaLeafButton(
  meta: ComponentMeta,
  selectedOptionKey: string,
  onSelectOption: (key: string) => void
): React.ReactNode {
  const vtLine = metaViewTypeKeys(meta);
  return (
    <button
      key={meta.key}
      type="button"
      role="menuitem"
      className={`wfa-option-item wfa-mega-leaf ${selectedOptionKey === meta.key ? "active" : ""}`}
      onClick={() => onSelectOption(meta.key)}
    >
      <span className="wfa-option-name">{meta.name}</span>
      <span className="wfa-option-meta">
        {(meta.source && SOURCE_LABELS[meta.source]) || meta.source || "Component"}
        {meta.model ? ` · ${meta.model}` : ""}
        {vtLine.length > 0 ? ` · ${vtLine.map(normalizeViewTypeLabel).join(", ")}` : ""}
      </span>
    </button>
  );
}

const AddWorkflowMegaMenu: React.FC<AddWorkflowMegaMenuProps> = ({
  tree,
  selectedOptionKey,
  onSelectOption,
}) => {
  const [openRootPathKey, setOpenRootPathKey] = useState<string | null>(null);
  const megaRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpenRootPathKey(null);
  }, [selectedOptionKey]);

  useEffect(() => {
    if (openRootPathKey == null) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const el = megaRootRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpenRootPathKey(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenRootPathKey(null);
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openRootPathKey]);

  const renderColumnContents = (node: MenuGroupNode): React.ReactNode => {
    const groups = [...node.sub.values()].sort((a, b) => a.label.localeCompare(b.label));
    const sortedLeaves = [...node.leaves].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <>
        {groups.map((sub) => (
          <div key={sub.pathKey} className="wfa-mega-branch wfa-mega-branch--nested">
            <button type="button" className="wfa-mega-trigger wfa-mega-trigger--nested">
              <span className="wfa-mega-trigger-label">{sub.label}</span>
              <span className="wfa-mega-chev" aria-hidden>
                ›
              </span>
            </button>
            <div className="wfa-mega-flyout wfa-mega-flyout--nested" role="menu">
              {renderColumnContents(sub)}
            </div>
          </div>
        ))}
        {sortedLeaves.map((meta) => megaLeafButton(meta, selectedOptionKey, onSelectOption))}
      </>
    );
  };

  if (tree.sub.size === 0 && tree.leaves.length === 0) {
    return <div className="wfd-filter-empty">No available menu/customized components found.</div>;
  }

  const rootGroups = [...tree.sub.values()].sort((a, b) => a.label.localeCompare(b.label));
  const rootLeaves = [...tree.leaves].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="wfa-mega-root" ref={megaRootRef}>
      <ul className="wfa-mega-row" role="menubar">
        {rootGroups.map((node) => {
          const isOpen = openRootPathKey === node.pathKey;
          return (
            <li
              key={node.pathKey}
              className={`wfa-mega-branch wfa-mega-branch--root ${isOpen ? "is-open" : ""}`}
            >
              <button
                type="button"
                className="wfa-mega-trigger wfa-mega-trigger--root"
                aria-expanded={isOpen}
                aria-haspopup="true"
                onClick={() => setOpenRootPathKey((k) => (k === node.pathKey ? null : node.pathKey))}
              >
                {node.label}
              </button>
              <div
                className="wfa-mega-flyout wfa-mega-flyout--root"
                role="menu"
                aria-hidden={!isOpen}
              >
                {renderColumnContents(node)}
              </div>
            </li>
          );
        })}
        {rootLeaves.map((meta) => (
          <li key={meta.key} className="wfa-mega-branch wfa-mega-branch--root">
            <button
              type="button"
              role="menuitem"
              className={`wfa-mega-trigger wfa-mega-trigger--root ${selectedOptionKey === meta.key ? "active" : ""}`}
              onClick={() => onSelectOption(meta.key)}
            >
              {meta.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const WorkflowEditorComponent: React.FC = () => {
  const ctx = useWorkflowDesign();
  const { draft } = ctx;
  const componentCatalog = getComponentCatalog();
  const [componentQuery, setComponentQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState(ALL_FILTER);
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER);
  const [modelFilter, setModelFilter] = useState(ALL_FILTER);
  const [odooTypeFilter, setOdooTypeFilter] = useState(ALL_FILTER);
  const composerAppliedRef = useRef<string>("");

  // Hooks must run unconditionally — never after an early return.
  const normalizedQuery = componentQuery.trim().toLowerCase();

  const categoryOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const meta of componentCatalog) unique.add(meta.category || "Other");
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [componentCatalog]);

  const sourceOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const meta of componentCatalog) unique.add(meta.source || "native");
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [componentCatalog]);

  const modelOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const meta of componentCatalog) {
      if (!meta.model) continue;
      unique.add(meta.model);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [componentCatalog]);

  const odooTypeOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const meta of componentCatalog) {
      if (meta.source === "odoo-view" && meta.viewType) unique.add(meta.viewType);
      if (meta.source === "menu") {
        for (const vt of metaViewTypeKeys(meta)) {
          if (vt) unique.add(vt);
        }
      }
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [componentCatalog]);

  const filteredCatalog = useMemo(() => {
    return componentCatalog.filter((meta) => {
      if (sourceFilter !== ALL_FILTER && (meta.source || "native") !== sourceFilter) return false;
      if (categoryFilter !== ALL_FILTER && meta.category !== categoryFilter) return false;
      if (modelFilter !== ALL_FILTER && (meta.model || "") !== modelFilter) return false;
      if (odooTypeFilter !== ALL_FILTER) {
        const vts = metaViewTypeKeys(meta);
        if (!vts.includes(odooTypeFilter)) return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        meta.name,
        meta.description,
        meta.category,
        meta.model || "",
        metaViewTypeKeys(meta).map(normalizeViewTypeLabel).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [componentCatalog, sourceFilter, categoryFilter, modelFilter, odooTypeFilter, normalizedQuery]);

  const menuCatalog = useMemo(
    () =>
      filteredCatalog
        .filter((m) => m.source === MENU_SOURCE)
        .sort((a, b) => (a.menuPath || a.name).localeCompare(b.menuPath || b.name)),
    [filteredCatalog]
  );

  const openComposerForArea = (area: AreaKey) => {
    setSourceFilter(MENU_SOURCE);
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = getWorkflowComposerUrl(area, returnTo);
  };

  useEffect(() => {
    if (!draft) return;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(COMPOSER_SELECTION_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        area?: string;
        key?: string;
        nonce?: number;
        menuViewType?: string;
      };
      if (!parsed || typeof parsed.key !== "string" || typeof parsed.area !== "string") return;
      if (parsed.area !== "left" && parsed.area !== "middle" && parsed.area !== "right") return;
      const token = `${parsed.area}:${parsed.key}:${String(parsed.nonce || "")}`;
      if (composerAppliedRef.current === token) return;
      const meta = componentCatalog.find((m) => m.key === parsed.key);
      if (!meta) return;
      const placement: ComponentPlacement = { key: parsed.key, size: meta.defaultSize || "full" };
      if (typeof parsed.menuViewType === "string" && parsed.menuViewType.trim()) {
        placement.menuViewType = parsed.menuViewType.trim();
      }
      ctx.addComponent(parsed.area, placement);
      composerAppliedRef.current = token;
      try {
        window.sessionStorage.removeItem(COMPOSER_SELECTION_KEY);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }, [draft, componentCatalog, ctx]);

  if (!draft)
    return (
      <div className="wfd-empty" style={{ margin: "1rem" }}>
        Select a workflow from the list to edit.
      </div>
    );

  const layout = draft.layout ?? EMPTY_LAYOUT;

  return (
    <div style={{ padding: "0.75rem" }}>
      <div className="wfd-editor-header">
        <h3>{draft.name || "Untitled"}</h3>
        <button
          className="wfd-save-btn"
          onClick={ctx.handleSave}
          disabled={!ctx.dirty || ctx.saving}
        >
          {ctx.saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {ctx.message && <div className="wfd-message">{ctx.message}</div>}

      <div className="wfd-form">
        <label className="wfd-label">
          Name
          <input
            className="wfd-input"
            value={draft.name}
            onChange={(e) => ctx.updateDraftField("name", e.target.value)}
          />
        </label>
        <label className="wfd-label">
          Key
          <input
            className="wfd-input"
            value={draft.key}
            onChange={(e) => ctx.updateDraftField("key", e.target.value)}
          />
        </label>
        <label className="wfd-label">
          Description
          <textarea
            className="wfd-textarea wfd-textarea-sm"
            value={draft.description}
            onChange={(e) => ctx.updateDraftField("description", e.target.value)}
            rows={2}
          />
        </label>

        <div className="wfd-layout-section">
          <div className="wfd-layout-title">Component Layout</div>
          <div className="wfd-component-filters">
            <input
              className="wfd-input wfd-filter-search"
              value={componentQuery}
              onChange={(e) => setComponentQuery(e.target.value)}
              placeholder="Search components by name, model, type..."
            />
            <div className="wfd-filter-row">
              <select
                className="wfd-add-component wfd-filter-select"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value={ALL_FILTER}>All sources</option>
                {sourceOptions.map((src) => (
                  <option key={src} value={src}>
                    {SOURCE_LABELS[src] || src}
                  </option>
                ))}
              </select>
              <select
                className="wfd-add-component wfd-filter-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value={ALL_FILTER}>All categories</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="wfd-filter-row">
              <select
                className="wfd-add-component wfd-filter-select"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
              >
                <option value={ALL_FILTER}>All models</option>
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <select
                className="wfd-add-component wfd-filter-select"
                value={odooTypeFilter}
                onChange={(e) => setOdooTypeFilter(e.target.value)}
              >
                <option value={ALL_FILTER}>All Odoo view types</option>
                {odooTypeOptions.map((vt) => (
                  <option key={vt} value={vt}>
                    {normalizeViewTypeLabel(vt)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {AREA_KEYS.map((area) => {
            const areaDef = layout[area] || { components: [] };
            return (
              <div key={area} className="wfd-area-config">
                <div className="wfd-area-config-header">
                  <span className="wfd-area-name">
                    {area.charAt(0).toUpperCase() + area.slice(1)} Area
                  </span>
                  <input
                    className="wfd-area-width-input"
                    placeholder="width"
                    value={areaDef.width || ""}
                    onChange={(e) => ctx.setAreaWidth(area, e.target.value)}
                  />
                </div>
                <div className="wfd-placed-components">
                  {areaDef.components.map((comp, i) => {
                    const meta = componentCatalog.find((m) => m.key === comp.key);
                    const menuVtOptions =
                      meta?.source === MENU_SOURCE ? metaViewTypeKeys(meta) : [];
                    const menuVtValue = comp.menuViewType ?? menuVtOptions[0] ?? "";
                    return (
                      <div key={i} className="wfd-placed-component">
                        <span className="wfd-comp-name">{meta?.name || comp.key}</span>
                        {menuVtOptions.length > 0 && (
                          <select
                            className="wfd-comp-menu-vt"
                            title="View type"
                            value={menuVtValue}
                            onChange={(e) =>
                              ctx.updateComponentMenuViewType(area, i, e.target.value)
                            }
                          >
                            {menuVtOptions.map((vt) => (
                              <option key={vt} value={vt}>
                                {normalizeViewTypeLabel(vt)}
                              </option>
                            ))}
                          </select>
                        )}
                        <select
                          className="wfd-comp-size"
                          value={comp.size}
                          onChange={(e) =>
                            ctx.updateComponentSize(
                              area,
                              i,
                              e.target.value as "full" | "half"
                            )
                          }
                        >
                          <option value="full">Full</option>
                          <option value="half">Half</option>
                        </select>
                        <button
                          className="wfd-comp-remove"
                          onClick={() => ctx.removeComponent(area, i)}
                          title="Remove"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="wfd-add-component-btn"
                    onClick={() => openComposerForArea(area)}
                  >
                    + Add a component (open composer)
                  </button>
                  {menuCatalog.length === 0 && (
                    <div className="wfd-filter-empty">
                      No menu components available for current filters.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const WorkflowCustomizationComponent: React.FC = () => {
  const ctx = useWorkflowDesign();
  const { draft } = ctx;

  if (!draft)
    return (
      <div className="wfc-panel">
        <div className="wfc-empty">Select a workflow to configure.</div>
      </div>
    );

  return (
    <div className="wfc-panel">
      <h3 className="wfc-title">Customization</h3>
      <div className="wfc-subtitle">{draft.name}</div>

      <div className="wfc-section">
        <div className="wfc-section-header">General</div>
        <label className="wfc-label">
          Sequence
          <input
            className="wfc-input"
            type="number"
            value={draft.sequence}
            onChange={(e) => ctx.updateDraftField("sequence", Number(e.target.value))}
          />
        </label>
        <label className="wfc-checkbox-label">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => ctx.updateDraftField("active", e.target.checked)}
          />
          Active
        </label>
      </div>

      <div className="wfc-section">
        <div className="wfc-section-header">Layout Summary</div>
        {(["left", "middle", "right"] as const).map((area) => {
          const areaDef = (draft.layout ?? EMPTY_LAYOUT)[area];
          return (
            <div key={area} className="wfc-layout-summary-item">
              <strong>{area}</strong>
              {areaDef?.width ? ` (${areaDef.width})` : ""}
              <div className="wfc-layout-summary-comps">
                {areaDef?.components?.map((c, i) => (
                  <span key={i} className="wfc-comp-badge">
                    {c.key} <span className="wfc-comp-badge-size">{c.size}</span>
                  </span>
                ))}
                {(!areaDef?.components || areaDef.components.length === 0) && (
                  <span className="muted">empty</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="wfc-save-btn"
        onClick={ctx.handleSave}
        disabled={!ctx.dirty || ctx.saving}
      >
        {ctx.saving ? "Saving..." : "Save Configuration"}
      </button>
    </div>
  );
};

export const WorkflowAddBuilderComponent: React.FC = () => {
  const ctx = useWorkflowDesign();
  const componentCatalog = getComponentCatalog();
  const [selectedOptionKey, setSelectedOptionKey] = useState<string>("");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("New workflow");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [areas, setAreas] = useState<Record<AreaKey, string | null>>({
    left: null,
    middle: null,
    right: null,
  });
  const [areaMenuViewType, setAreaMenuViewType] = useState<Record<AreaKey, string>>({
    left: "",
    middle: "",
    right: "",
  });
  const [menuListOpen, setMenuListOpen] = useState(true);
  const [expandedPathKeys, setExpandedPathKeys] = useState<Set<string>>(() => new Set());
  const previewRowRef = useRef<HTMLDivElement>(null);
  const [previewColWidths, setPreviewColWidths] = useState({ left: 280, middle: 400 });
  const previewWidthsRef = useRef(previewColWidths);
  previewWidthsRef.current = previewColWidths;
  const previewWidthsInitRef = useRef(false);
  const [previewColDrag, setPreviewColDrag] = useState<{
    kind: "lm" | "mr";
    startX: number;
    startLeft: number;
    startMiddle: number;
  } | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [pastedDesignText, setPastedDesignText] = useState("");
  const [showPasteJsonPreview, setShowPasteJsonPreview] = useState(true);
  const [aiProvider, setAiProvider] = useState<WorkflowAiProviderId>("openai_compatible");
  const [aiProvidersMeta, setAiProvidersMeta] = useState<
    Record<string, { configured: boolean; label: string }> | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkflowAiProviders().then((m) => {
      if (cancelled || !m.ok) return;
      setAiProvidersMeta(m.providers ?? null);
      const fallback = m.defaultProvider ?? "openai_compatible";
      try {
        const saved = sessionStorage.getItem(SS_AI_PROVIDER);
        if (
          saved === "openai_compatible" ||
          saved === "anthropic" ||
          saved === "openclaw"
        ) {
          setAiProvider(saved);
          return;
        }
      } catch {
        /* ignore */
      }
      setAiProvider(fallback);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const el = previewRowRef.current;
    if (!el) return;
    const sync = () => {
      if (previewWidthsInitRef.current) return;
      const cw = el.clientWidth;
      if (cw < 320) return;
      previewWidthsInitRef.current = true;
      setPreviewColWidths({
        left: Math.min(320, Math.floor(cw * 0.24)),
        middle: Math.min(460, Math.floor(cw * 0.36)),
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!previewColDrag) return;
    const gripSpace = 2 * ADD_PREVIEW_GRIP_PX;
    const onMove = (e: PointerEvent) => {
      const cw = previewRowRef.current?.clientWidth;
      if (!cw) return;
      const dx = e.clientX - previewColDrag.startX;
      if (previewColDrag.kind === "lm") {
        const maxLeft = cw - previewColDrag.startMiddle - gripSpace - ADD_PREVIEW_MIN_COL;
        const nextLeft = Math.min(
          maxLeft,
          Math.max(ADD_PREVIEW_MIN_COL, previewColDrag.startLeft + dx)
        );
        setPreviewColWidths((s) => ({ ...s, left: nextLeft }));
      } else {
        const maxMid = cw - previewColDrag.startLeft - gripSpace - ADD_PREVIEW_MIN_COL;
        const nextMid = Math.min(
          maxMid,
          Math.max(ADD_PREVIEW_MIN_COL, previewColDrag.startMiddle + dx)
        );
        setPreviewColWidths((s) => ({ ...s, middle: nextMid }));
      }
    };
    const onUp = () => setPreviewColDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [previewColDrag]);

  useEffect(() => {
    if (key.trim()) return;
    setKey(normalizeNewWorkflowKey(name));
  }, [name, key]);

  const availableOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return componentCatalog
      .filter((meta) => {
        if (meta.key === "workflow-add-builder") return false;
        return meta.source === "menu" || meta.source === "customized";
      })
      .filter((meta) => {
        if (!q) return true;
        const blob = [meta.name, meta.description, meta.model || "", meta.menuPath || ""]
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [componentCatalog, query]);

  const menuOptionTree = useMemo(() => buildMenuOptionTree(availableOptions), [availableOptions]);

  useEffect(() => {
    if (!query.trim()) {
      const next = new Set<string>();
      menuOptionTree.sub.forEach((n) => next.add(n.pathKey));
      setExpandedPathKeys(next);
      return;
    }
    const next = new Set<string>();
    for (const meta of availableOptions) {
      for (const k of ancestorPathKeys(pathSegmentsForMeta(meta))) {
        next.add(k);
      }
    }
    setExpandedPathKeys(next);
  }, [query, availableOptions, menuOptionTree]);

  const toggleHierarchyPath = useCallback((pathKey: string) => {
    setExpandedPathKeys((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  const expandAllHierarchy = useCallback(() => {
    setExpandedPathKeys(new Set(collectAllGroupPathKeys(menuOptionTree)));
  }, [menuOptionTree]);

  const collapseAllHierarchy = useCallback(() => {
    setExpandedPathKeys(new Set());
  }, []);

  const selectedMeta = useMemo(
    () => availableOptions.find((m) => m.key === selectedOptionKey) ?? null,
    [availableOptions, selectedOptionKey]
  );

  const openOdooViewType = useMemo(() => {
    if (!selectedMeta) return "";
    const opts = metaViewTypeKeys(selectedMeta);
    for (const a of AREA_KEYS) {
      if (areas[a] === selectedMeta.key && areaMenuViewType[a].trim()) {
        return areaMenuViewType[a].trim();
      }
    }
    return opts[0] || "";
  }, [selectedMeta, areas, areaMenuViewType]);

  const allAreasConfigured = AREA_KEYS.every((a) => Boolean(areas[a]));
  const searchActive = query.trim().length > 0;

  const aiCatalogEntries = useMemo(
    () => buildWorkflowAiCatalogEntries(componentCatalog),
    [componentCatalog]
  );

  const existingWorkflowKeysForAi = useMemo(
    () => ctx.workflows.map((w) => w.key).filter((k): k is string => Boolean(k && String(k).trim())),
    [ctx.workflows]
  );

  const applyAiSuggestionToPreview = useCallback(
    (s: {
      name: string;
      key: string;
      description: string;
      left: { componentKey: string; menuViewType: string };
      middle: { componentKey: string; menuViewType: string };
      right: { componentKey: string; menuViewType: string };
      leftWidthPx?: number;
      middleWidthPx?: number;
    }) => {
      setName(s.name);
      setKey(s.key);
      setDescription(s.description);
      setAreas({
        left: s.left.componentKey,
        middle: s.middle.componentKey,
        right: s.right.componentKey,
      });
      setAreaMenuViewType({
        left: s.left.menuViewType || "",
        middle: s.middle.menuViewType || "",
        right: s.right.menuViewType || "",
      });
      setPreviewColWidths((prev) => ({
        left:
          typeof s.leftWidthPx === "number" && Number.isFinite(s.leftWidthPx)
            ? Math.max(ADD_PREVIEW_MIN_COL, Math.min(600, Math.round(s.leftWidthPx)))
            : prev.left,
        middle:
          typeof s.middleWidthPx === "number" && Number.isFinite(s.middleWidthPx)
            ? Math.max(ADD_PREVIEW_MIN_COL, Math.min(600, Math.round(s.middleWidthPx)))
            : prev.middle,
      }));
    },
    []
  );

  const runAiSuggest = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setMessage("Enter a short description for the workflow you want.");
      return;
    }
    if (aiCatalogEntries.length < 3) {
      setMessage("Not enough menu or customized components loaded for AI suggestions.");
      return;
    }
    setAiBusy(true);
    setMessage(null);
    try {
      const res = await suggestWorkflowLayoutFromAi({
        prompt,
        catalog: aiCatalogEntries,
        existingWorkflowKeys: existingWorkflowKeysForAi,
        provider: aiProvider,
      });
      if (!res.ok || !res.suggestion) {
        const detail = res.error || "AI suggestion failed";
        setMessage(
          res.assistantRaw
            ? `${detail} (assistant reply logged in console)`
            : detail
        );
        if (res.assistantRaw) console.warn("workflow AI assistant_raw", res.assistantRaw);
        return;
      }
      applyAiSuggestionToPreview(res.suggestion);
      setMessage("AI suggestion applied to the preview. Review columns, then save if it looks right.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "AI suggestion failed");
    } finally {
      setAiBusy(false);
    }
  }, [aiPrompt, aiCatalogEntries, existingWorkflowKeysForAi, aiProvider, applyAiSuggestionToPreview]);

  const copyAiContextForExternal = useCallback(async () => {
    const text = buildWorkflowAiExternalContextJson(
      aiPrompt.trim() || "(describe your workflow here)",
      aiCatalogEntries,
      existingWorkflowKeysForAi.map((k) => k.toLowerCase())
    );
    try {
      await navigator.clipboard.writeText(text);
      setMessage("AI context JSON copied to clipboard (for external LLM or support).");
    } catch {
      setMessage("Could not copy to clipboard.");
    }
  }, [aiPrompt, aiCatalogEntries, existingWorkflowKeysForAi]);

  const applyPastedAiDesignToPreview = useCallback(() => {
    const text = pastedDesignText.trim();
    if (!text) {
      setMessage("Paste AI-generated JSON (the workflow object) first.");
      return;
    }
    if (aiCatalogEntries.length < 3) {
      setMessage("Not enough menu or customized components loaded to validate the design.");
      return;
    }
    setMessage(null);
    const res = tryApplyWorkflowAiDesignText(text, aiCatalogEntries, existingWorkflowKeysForAi);
    if (!res.ok) {
      setMessage(res.error);
      return;
    }
    applyAiSuggestionToPreview(res.suggestion);
    setMessage("Pasted design applied to the preview. Review, then save if it looks right.");
  }, [
    pastedDesignText,
    aiCatalogEntries,
    existingWorkflowKeysForAi,
    applyAiSuggestionToPreview,
  ]);

  const assignSelectedToArea = useCallback(
    (area: AreaKey) => {
      if (!selectedMeta) return;
      setAreas((prev) => ({ ...prev, [area]: selectedMeta.key }));
      if (selectedMeta.source === MENU_SOURCE) {
        const primary = metaViewTypeKeys(selectedMeta)[0] || "";
        setAreaMenuViewType((prev) => ({ ...prev, [area]: primary }));
      } else {
        setAreaMenuViewType((prev) => ({ ...prev, [area]: "" }));
      }
    },
    [selectedMeta]
  );

  const onPreviewLmDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPreviewColDrag({
      kind: "lm",
      startX: e.clientX,
      startLeft: previewWidthsRef.current.left,
      startMiddle: previewWidthsRef.current.middle,
    });
  }, []);

  const onPreviewMrDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPreviewColDrag({
      kind: "mr",
      startX: e.clientX,
      startLeft: previewWidthsRef.current.left,
      startMiddle: previewWidthsRef.current.middle,
    });
  }, []);

  const saveNewWorkflow = async () => {
    const normalizedKey = normalizeNewWorkflowKey(key);
    if (!name.trim()) {
      setMessage("Workflow name is required.");
      return;
    }
    if (!normalizedKey) {
      setMessage("Workflow key is required.");
      return;
    }
    if (ctx.workflows.some((w) => w.key === normalizedKey)) {
      setMessage(`Workflow key "${normalizedKey}" already exists.`);
      return;
    }
    if (!allAreasConfigured) {
      setMessage("Select one component/view for each of left, middle, and right areas.");
      return;
    }
    if (
      !window.confirm(
        `Save workflow "${name.trim()}" (${normalizedKey})?\n\nConfirm that left, middle, and right previews look correct.`
      )
    ) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const maxSeq = ctx.workflows.reduce((m, w) => Math.max(m, w.sequence || 0), 0);
      await saveWorkflow({
        name: name.trim(),
        key: normalizedKey,
        description: description.trim(),
        active: true,
        sequence: maxSeq + 10,
        layout: {
          left: {
            width: `${Math.round(previewColWidths.left)}px`,
            components: [
              ((): ComponentPlacement => {
                const key = areas.left as string;
                const meta = componentCatalog.find((m) => m.key === key);
                const p: ComponentPlacement = { key, size: "full" };
                if (meta?.source === MENU_SOURCE) {
                  const opts = metaViewTypeKeys(meta);
                  const v = areaMenuViewType.left.trim() || opts[0];
                  if (v) p.menuViewType = v;
                }
                return p;
              })(),
            ],
          },
          middle: {
            width: `${Math.round(previewColWidths.middle)}px`,
            components: [
              ((): ComponentPlacement => {
                const key = areas.middle as string;
                const meta = componentCatalog.find((m) => m.key === key);
                const p: ComponentPlacement = { key, size: "full" };
                if (meta?.source === MENU_SOURCE) {
                  const opts = metaViewTypeKeys(meta);
                  const v = areaMenuViewType.middle.trim() || opts[0];
                  if (v) p.menuViewType = v;
                }
                return p;
              })(),
            ],
          },
          right: {
            components: [
              ((): ComponentPlacement => {
                const key = areas.right as string;
                const meta = componentCatalog.find((m) => m.key === key);
                const p: ComponentPlacement = { key, size: "full" };
                if (meta?.source === MENU_SOURCE) {
                  const opts = metaViewTypeKeys(meta);
                  const v = areaMenuViewType.right.trim() || opts[0];
                  if (v) p.menuViewType = v;
                }
                return p;
              })(),
            ],
          },
        },
      });
      setMessage("Workflow saved. Opening new workflow tab...");
      const url = new URL(window.location.href);
      url.searchParams.set("wf", normalizedKey);
      window.location.href = `${url.pathname}${url.search}${url.hash}`;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wfa-panel wfa-panel--add-workflow">
      <div className="wfa-header-compact">
        <span className="wfa-title">Add workflow</span>
        <span
          className="wfa-subtitle-inline"
          title="Select menus or customized components, preview each area, then save."
        >
          Menus & components per area, preview, then save.
        </span>
        <label className="wfa-inline-field">
          <span className="wfa-inline-label">Name</span>
          <input className="wfd-input wfa-inline-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="wfa-inline-field">
          <span className="wfa-inline-label">Key</span>
          <input className="wfd-input wfa-inline-input" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="wfa-inline-field wfa-inline-field-grow">
          <span className="wfa-inline-label">Description</span>
          <input
            className="wfd-input wfa-inline-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      <div className="wfa-ai-assist">
        <div className="wfa-ai-assist-head">
          <span className="wfa-ai-assist-title">Describe workflow (AI)</span>
          <span
            className="wfa-ai-assist-hint"
            title="Admins: Settings → Workflow AI, or system parameters / env. OpenAI-compatible: myflow_base.workflow_ai_openai_api_key. Anthropic: myflow_base.workflow_ai_anthropic_api_key. OpenClaw: OPENCLAW_GATEWAY_TOKEN / myflow_base.workflow_ai_openclaw_token and gateway.http.endpoints.chatCompletions on the gateway."
          >
            Uses your configured API keys. Preview only until you save.
          </span>
        </div>
        <div className="wfa-ai-provider-row">
          <label className="wfa-ai-provider-field">
            <span className="wfa-ai-provider-label">Generate with</span>
            <select
              className="wfd-input wfa-ai-provider-select"
              value={aiProvider}
              onChange={(e) => {
                const v = e.target.value as WorkflowAiProviderId;
                setAiProvider(v);
                try {
                  sessionStorage.setItem(SS_AI_PROVIDER, v);
                } catch {
                  /* ignore */
                }
              }}
            >
              {(
                [
                  ["openai_compatible", "OpenAI-compatible"],
                  ["anthropic", "Anthropic (Claude)"],
                  ["openclaw", "OpenClaw gateway agent"],
                ] as const
              ).map(([id, label]) => {
                const cfg = aiProvidersMeta?.[id]?.configured;
                const suffix = cfg === false ? " — not configured" : "";
                return (
                  <option key={id} value={id}>
                    {label}
                    {suffix}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="wfa-ai-paste-toggle">
            <input
              type="checkbox"
              checked={showPasteJsonPreview}
              onChange={(e) => setShowPasteJsonPreview(e.target.checked)}
            />
            <span>Paste AI JSON &amp; test in preview</span>
          </label>
        </div>
        <textarea
          className="wfd-input wfa-ai-textarea"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="Example: Sales orders list on the left, order form in the middle, and a product-related menu on the right."
          rows={2}
        />
        <div className="wfa-ai-actions">
          <button type="button" className="wfd-add-component-btn wfa-ai-primary" disabled={aiBusy} onClick={() => void runAiSuggest()}>
            {aiBusy ? "Generating…" : "Apply AI to preview"}
          </button>
          <button
            type="button"
            className="wfd-add-component-btn wfa-ai-secondary"
            disabled={aiBusy}
            onClick={() => void copyAiContextForExternal()}
          >
            Copy context JSON
          </button>
        </div>
        {showPasteJsonPreview && (
          <div className="wfa-ai-paste-block">
            <textarea
              className="wfd-input wfa-ai-textarea wfa-ai-textarea--paste"
              value={pastedDesignText}
              onChange={(e) => setPastedDesignText(e.target.value)}
              placeholder='{"name":"…","key":"…","description":"…","left":{"componentKey":"…","menuViewType":"tree"}, …}'
              rows={5}
              spellCheck={false}
            />
            <button
              type="button"
              className="wfd-add-component-btn wfa-ai-secondary"
              disabled={aiBusy}
              onClick={applyPastedAiDesignToPreview}
            >
              Apply pasted JSON to preview
            </button>
          </div>
        )}
      </div>

      {message && <div className="wfd-message">{message}</div>}

      <div className="wfa-body wfa-body-add-workflow">
        <div className={`wfa-single-picker ${menuListOpen ? "open" : "collapsed"}`}>
          {!menuListOpen ? (
            <button
              type="button"
              className="wfa-picker-expand wfa-picker-expand-row"
              onClick={() => setMenuListOpen(true)}
              title="Show menu list"
            >
              <span className="wfa-picker-expand-icon" aria-hidden>
                ›
              </span>
              <span className="wfa-picker-expand-label">Menus & components</span>
            </button>
          ) : (
            <div className="wfa-picker-panel wfa-picker-panel--mega">
              <div className="wfa-picker-panel-header">
                <span className="wfa-picker-panel-title">Menu & components</span>
                <button
                  type="button"
                  className="wfa-picker-hide"
                  onClick={() => setMenuListOpen(false)}
                  title="Hide menu list"
                >
                  Hide list
                </button>
              </div>
              {searchActive && (
                <div className="wfa-picker-hierarchy-tools">
                  <button type="button" className="wfa-hier-bulk" onClick={expandAllHierarchy}>
                    Expand all
                  </button>
                  <button type="button" className="wfa-hier-bulk" onClick={collapseAllHierarchy}>
                    Collapse all
                  </button>
                </div>
              )}
              <input
                className="wfd-input wfd-filter-search wfa-picker-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  searchActive
                    ? "Search menus and customized components…"
                    : "Filter (optional) — type to switch to search list…"
                }
              />
              <div
                className={
                  searchActive
                    ? "wfa-option-list wfa-option-list-hierarchy wfa-option-list--search"
                    : "wfa-mega-wrap"
                }
              >
                {searchActive ? (
                  <AddWorkflowMenuHierarchy
                    tree={menuOptionTree}
                    expandedPathKeys={expandedPathKeys}
                    onTogglePath={toggleHierarchyPath}
                    selectedOptionKey={selectedOptionKey}
                    onSelectOption={setSelectedOptionKey}
                  />
                ) : (
                  <AddWorkflowMegaMenu
                    tree={menuOptionTree}
                    selectedOptionKey={selectedOptionKey}
                    onSelectOption={setSelectedOptionKey}
                  />
                )}
              </div>
              <div className="wfa-assign-row">
                {AREA_KEYS.map((area) => (
                  <button
                    key={area}
                    type="button"
                    className="wfd-add-component-btn wfa-assign-btn"
                    onClick={() => assignSelectedToArea(area)}
                    disabled={!selectedMeta}
                  >
                    Assign to {area.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="wfa-selection-actions wfa-selection-actions--inline">
                {selectedMeta?.source === "menu" && selectedMeta.menuId && selectedMeta.actionId && (
                  <a
                    className="workflow-link-button wfa-open-odoo-link"
                    href={menuActionUrlWithViewType(
                      `/web#menu_id=${selectedMeta.menuId}&action=${selectedMeta.actionId}`,
                      openOdooViewType
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Odoo
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          ref={previewRowRef}
          className={`wfa-preview-row-resizable wfa-preview-grid--below-mega${
            previewColDrag ? " page-layout--resizing" : ""
          }`}
        >
          {AREA_KEYS.flatMap((area, i) => {
            const compKey = areas[area];
            const areaUpper = area.toUpperCase();
            const isRight = area === "right";
            const cardStyle: React.CSSProperties = isRight
              ? { flex: "1 1 0", minWidth: ADD_PREVIEW_MIN_COL }
              : {
                  flex: `0 0 ${area === "left" ? previewColWidths.left : previewColWidths.middle}px`,
                  minWidth: ADD_PREVIEW_MIN_COL,
                };
            const nodes: React.ReactNode[] = [];
            if (i === 1) {
              nodes.push(
                <div
                  key="g-lm"
                  className={`page-layout-grip${previewColDrag ? " page-layout-grip--active" : ""}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize left and middle preview columns"
                  onPointerDown={onPreviewLmDown}
                />
              );
            }
            if (i === 2) {
              nodes.push(
                <div
                  key="g-mr"
                  className={`page-layout-grip${previewColDrag ? " page-layout-grip--active" : ""}`}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize middle and right preview columns"
                  onPointerDown={onPreviewMrDown}
                />
              );
            }
            nodes.push(
              <div key={area} className="wfa-preview-card" style={cardStyle}>
                <div className="wfa-preview-title">{areaUpper}</div>
                {!compKey && (
                  <div className="wfd-empty wfa-preview-empty">
                    Pick a menu above, then Assign to {areaUpper}.
                  </div>
                )}
                {compKey && (
                  <div className="wfa-preview-canvas">
                    <ComponentRenderer
                      componentKey={compKey}
                      menuViewType={areaMenuViewType[area] || undefined}
                      onMenuViewTypeChange={(next) =>
                        setAreaMenuViewType((prev) => ({ ...prev, [area]: next }))
                      }
                    />
                  </div>
                )}
              </div>
            );
            return nodes;
          })}
        </div>
      </div>

      <div className="wfa-footer">
        <div className="wfa-save-row">
          <button
            type="button"
            className="wfd-save-btn"
            onClick={() => void saveNewWorkflow()}
            disabled={!allAreasConfigured || saving}
          >
            {saving ? "Saving..." : "Save Workflow"}
          </button>
        </div>
      </div>
    </div>
  );
};
