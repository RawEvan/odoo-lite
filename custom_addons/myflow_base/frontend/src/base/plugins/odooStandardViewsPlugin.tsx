import React, { useEffect, useMemo, useState } from "react";
import type { ComponentMeta, WorkflowUiPlugin, WorkflowComponentProps } from "../runtime/pluginTypes";
import {
  listOdooStandardViews,
  resolveOdooView,
  type OdooResolvedField,
  type OdooResolvedViewPayload,
  type OdooViewCatalogItem,
} from "../runtime/odooViewService";

type ArchNode = {
  id: string;
  label: string;
  children: ArchNode[];
};

const RESOLVED_VIEW_CACHE = new Map<number, OdooResolvedViewPayload>();
const RESOLVED_VIEW_PENDING = new Map<number, Promise<OdooResolvedViewPayload>>();

function normalizeViewTypeLabel(viewType: string): string {
  if (viewType === "tree") return "list";
  return viewType;
}

function getFieldMap(fields: OdooResolvedField[]): Record<string, OdooResolvedField> {
  const map: Record<string, OdooResolvedField> = {};
  for (const field of fields) {
    if (field && typeof field.name === "string" && field.name) {
      map[field.name] = field;
    }
  }
  return map;
}

function parseArchToTree(arch: string, fieldsMap: Record<string, OdooResolvedField>): ArchNode[] {
  if (!arch.trim()) return [{ id: "empty", label: "No architecture returned", children: [] }];

  const parser = new DOMParser();
  const doc = parser.parseFromString(arch, "text/xml");
  if (doc.querySelector("parsererror")) {
    return [{ id: "parse-error", label: "Unable to parse XML architecture", children: [] }];
  }
  const root = doc.documentElement;
  if (!root) return [{ id: "missing-root", label: "Missing root node", children: [] }];

  const nodeBudget = { used: 0, max: 350 };

  function buildNode(el: Element, depth: number): ArchNode {
    nodeBudget.used += 1;
    const tag = el.tagName.toLowerCase();
    const name = el.getAttribute("name") || "";
    const title = el.getAttribute("string") || "";

    let label = tag;
    if (tag === "field") {
      const fieldInfo = fieldsMap[name];
      const base = title || fieldInfo?.string || name || "unnamed";
      const parts = [base];
      if (fieldInfo?.type) parts.push(fieldInfo.type);
      if (fieldInfo?.relation) parts.push(`-> ${fieldInfo.relation}`);
      label = `field: ${parts.join(" | ")}`;
    } else if (tag === "button") {
      const buttonName = title || name || "action";
      const buttonType = el.getAttribute("type");
      label = buttonType ? `button: ${buttonName} (${buttonType})` : `button: ${buttonName}`;
    } else if (tag === "tree") {
      label = "list view";
    } else if (title) {
      label = `${tag}: ${title}`;
    } else if (name) {
      label = `${tag}: ${name}`;
    }

    if (depth >= 8 || nodeBudget.used >= nodeBudget.max) {
      return { id: `${tag}-${depth}-${nodeBudget.used}`, label, children: [] };
    }

    const children: ArchNode[] = [];
    for (const child of Array.from(el.children)) {
      if (nodeBudget.used >= nodeBudget.max) break;
      children.push(buildNode(child, depth + 1));
    }
    return { id: `${tag}-${depth}-${nodeBudget.used}`, label, children };
  }

  return [buildNode(root, 0)];
}

const ArchTreeView: React.FC<{ nodes: ArchNode[] }> = ({ nodes }) => {
  if (nodes.length === 0) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: "1rem", color: "#0f172a" }}>
      {nodes.map((node) => (
        <li key={node.id} style={{ margin: "0.15rem 0" }}>
          <span style={{ fontSize: "12px", lineHeight: 1.4 }}>{node.label}</span>
          {node.children.length > 0 && <ArchTreeView nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
};

const OdooStandardViewComponent: React.FC<{ view: OdooViewCatalogItem }> = ({ view }) => {
  const [data, setData] = useState<OdooResolvedViewPayload | null>(() => RESOLVED_VIEW_CACHE.get(view.id) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !RESOLVED_VIEW_CACHE.has(view.id));

  useEffect(() => {
    let cancelled = false;
    if (RESOLVED_VIEW_CACHE.has(view.id)) {
      setData(RESOLVED_VIEW_CACHE.get(view.id) ?? null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError(null);

    const existing = RESOLVED_VIEW_PENDING.get(view.id);
    const requestPromise =
      existing ??
      resolveOdooView(view.id).then((resolved) => {
        RESOLVED_VIEW_CACHE.set(view.id, resolved);
        RESOLVED_VIEW_PENDING.delete(view.id);
        return resolved;
      });
    if (!existing) {
      RESOLVED_VIEW_PENDING.set(view.id, requestPromise);
    }

    requestPromise
      .then((resolved) => {
        if (cancelled) return;
        setData(resolved);
        setLoading(false);
      })
      .catch((err) => {
        RESOLVED_VIEW_PENDING.delete(view.id);
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load Odoo view architecture");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view.id]);

  const tree = useMemo(() => {
    if (!data) return [];
    const fieldMap = getFieldMap(data.fields);
    return parseArchToTree(data.arch, fieldMap);
  }, [data]);

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        background: "#ffffff",
        minHeight: "180px",
        overflow: "auto",
        padding: "0.75rem",
      }}
    >
      <div style={{ marginBottom: "0.5rem", fontSize: "12px", color: "#64748b" }}>
        <strong style={{ color: "#0f172a" }}>{view.model}</strong>
        {" · "}
        {normalizeViewTypeLabel(view.type)}
        {" · "}
        {view.name || "Unnamed"}
      </div>
      {loading && <div style={{ color: "#6b7280", fontSize: "12px" }}>Loading final architecture...</div>}
      {error && <div style={{ color: "#b91c1c", fontSize: "12px" }}>{error}</div>}
      {!loading && !error && <ArchTreeView nodes={tree} />}
    </div>
  );
};

export async function buildOdooStandardViewsPlugin(): Promise<WorkflowUiPlugin | null> {
  const items: OdooViewCatalogItem[] = [];
  const pageSize = 300;
  const maxRows = 5000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const chunk = await listOdooStandardViews({
      types: ["form", "tree", "kanban", "calendar", "graph", "pivot", "search", "activity", "gantt"],
      limit: pageSize,
      offset,
    });
    items.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  if (items.length === 0) return null;

  const componentCatalog: ComponentMeta[] = items.map((item) => ({
    key: item.key,
    name: `${item.name || "Unnamed"} (${normalizeViewTypeLabel(item.type)})`,
    description: `Model ${item.model} · final inherited ${normalizeViewTypeLabel(item.type)} architecture`,
    defaultSize: "full",
    category: "Odoo Views",
    source: "odoo-view",
    model: item.model,
    viewType: item.type,
  }));

  const components: WorkflowUiPlugin["components"] = {};
  for (const item of items) {
    components[item.key] = (_props: WorkflowComponentProps) => (
      <OdooStandardViewComponent view={item} />
    );
  }

  return {
    id: "odoo-standard-views-plugin",
    componentCatalog,
    components,
  };
}
