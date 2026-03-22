import { callOdooJsonRoute } from "../../odooJsonRpc";
import { getWorkflowApiPrefix } from "./hostRuntime";

export interface OdooViewCatalogItem {
  id: number;
  name: string;
  model: string;
  type: string;
  priority: number;
  key: string;
  label: string;
}

export interface OdooResolvedField {
  name: string;
  string: string;
  type: string;
  relation?: string | null;
  required: boolean;
  readonly: boolean;
}

export interface OdooResolvedView {
  id: number;
  name: string;
  model: string;
  type: string;
  key: string;
}

export interface OdooResolvedViewPayload {
  view: OdooResolvedView;
  arch: string;
  fields: OdooResolvedField[];
}

export interface OdooMenuCatalogItem {
  id: number;
  name: string;
  complete_name: string;
  root: string;
  key: string;
  action_id: number;
  action_name: string;
  action_type: string;
  res_model: string;
  view_types: string[];
  primary_view_id?: number | null;
  web_url: string;
}

function workflowApiUrl(suffix: string): string {
  const base = getWorkflowApiPrefix();
  const tail = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${base}/api${tail}`;
}

export async function listOdooStandardViews(
  params: {
    search?: string;
    model?: string;
    types?: string[];
    limit?: number;
    offset?: number;
  } = {}
): Promise<OdooViewCatalogItem[]> {
  const data = await callOdooJsonRoute<{ ok?: boolean; items?: OdooViewCatalogItem[]; error?: string }>(
    workflowApiUrl("/odoo_views/catalog"),
    params as Record<string, unknown>
  );
  if (!data?.ok) {
    throw new Error(data?.error || "Failed to load Odoo view catalog");
  }
  return Array.isArray(data.items) ? data.items : [];
}

export async function resolveOdooView(viewId: number): Promise<OdooResolvedViewPayload> {
  const data = await callOdooJsonRoute<{
    ok?: boolean;
    view?: OdooResolvedView;
    arch?: string;
    fields?: OdooResolvedField[];
    error?: string;
  }>(workflowApiUrl("/odoo_views/resolve"), { view_id: viewId });

  if (!data?.ok || !data.view) {
    throw new Error(data?.error || "Failed to resolve Odoo view architecture");
  }

  return {
    view: data.view,
    arch: typeof data.arch === "string" ? data.arch : "",
    fields: Array.isArray(data.fields) ? data.fields : [],
  };
}

export async function listOdooMenuComponents(
  params: {
    search?: string;
    model?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<OdooMenuCatalogItem[]> {
  const data = await callOdooJsonRoute<{ ok?: boolean; items?: OdooMenuCatalogItem[]; error?: string }>(
    workflowApiUrl("/odoo_menus/catalog"),
    params as Record<string, unknown>
  );
  if (!data?.ok) {
    throw new Error(data?.error || "Failed to load Odoo menu catalog");
  }
  return Array.isArray(data.items) ? data.items : [];
}
