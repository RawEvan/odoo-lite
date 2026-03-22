import { callOdooJsonRoute } from "../../odooJsonRpc";
import { getWorkflowApiPrefix } from "./hostRuntime";

function workflowApiUrl(suffix: string): string {
  const base = getWorkflowApiPrefix();
  const tail = suffix.startsWith("/") ? suffix : `/${suffix}`;
  // Always root-absolute — never a path relative to `/workflow/<key>`.
  return `${base}/api${tail}`;
}

export interface ComponentPlacement {
  key: string;
  size: "full" | "half";
  /** For menu-linked components: which action view mode opens (tree/list, form, …). */
  menuViewType?: string;
}

export interface AreaDefinition {
  width?: string;
  components: ComponentPlacement[];
}

export interface LayoutDefinition {
  left: AreaDefinition;
  middle: AreaDefinition;
  right: AreaDefinition;
}

export interface WorkflowDesign {
  /** Omitted while creating a new workflow in the UI before the first save. */
  id?: number;
  name: string;
  key: string;
  description: string;
  layout: LayoutDefinition;
  sequence: number;
  active: boolean;
}

export const EMPTY_LAYOUT: LayoutDefinition = {
  left: { components: [] },
  middle: { components: [] },
  right: { components: [] },
};

export const listWorkflows = async (): Promise<WorkflowDesign[]> =>
  callOdooJsonRoute<WorkflowDesign[]>(workflowApiUrl("/workflows/list"), {});

export const saveWorkflow = async (
  wf: Partial<WorkflowDesign> & { name: string; key: string }
): Promise<{ ok: boolean; id: number }> => {
  const data = await callOdooJsonRoute<{ ok?: boolean; id?: number; error?: string }>(
    workflowApiUrl("/workflows/save"),
    wf as Record<string, unknown>
  );
  if (!data?.ok) throw new Error(data?.error || "Failed to save workflow");
  return data as { ok: boolean; id: number };
};

export const deleteWorkflow = async (id: number): Promise<void> => {
  const data = await callOdooJsonRoute<{ ok?: boolean; error?: string }>(
    workflowApiUrl("/workflows/delete"),
    { id }
  );
  if (!data?.ok) throw new Error(data?.error || "Failed to delete workflow");
};

/** Keep in sync with ``_WORKFLOW_AI_SYSTEM_PROMPT`` in myflow_base/controllers/main.py */
export const WORKFLOW_AI_SYSTEM_PROMPT = `You are assisting with a three-column workflow UI for Odoo. Each column (left, middle, right) must show exactly one component from the provided catalog.
Respond with a single JSON object only (no markdown), shape:
{"name":"…","key":"lowercase-kebab-case","description":"…","left":{"componentKey":"<exact catalog key>","menuViewType":"<optional>"},"middle":{…},"right":{…},"leftWidthPx":<optional int 120-600>,"middleWidthPx":<optional int 120-600>}
For catalog items with source "menu", set menuViewType to one of the listed view types (use "tree" for list views). For other sources, use empty string for menuViewType.
componentKey must match a catalog key exactly. Do not invent keys.`;

export type WorkflowAiCatalogEntry = {
  key: string;
  name: string;
  description: string;
  source?: string;
  model?: string;
  menuPath?: string;
  viewType?: string;
  viewTypes?: string[];
};

export type WorkflowAiAreaSuggestion = {
  componentKey: string;
  menuViewType: string;
};

export type WorkflowAiSuggestion = {
  name: string;
  key: string;
  description: string;
  left: WorkflowAiAreaSuggestion;
  middle: WorkflowAiAreaSuggestion;
  right: WorkflowAiAreaSuggestion;
  leftWidthPx?: number;
  middleWidthPx?: number;
};

export function buildWorkflowAiCatalogEntries(
  catalog: Array<{
    key: string;
    name: string;
    description: string;
    source?: string;
    model?: string;
    menuPath?: string;
    viewType?: string;
    viewTypes?: string[];
  }>
): WorkflowAiCatalogEntry[] {
  return catalog
    .filter((m) => m.key !== "workflow-add-builder")
    .filter((m) => m.source === "menu" || m.source === "customized")
    .map((m) => ({
      key: m.key,
      name: m.name,
      description: m.description,
      source: m.source,
      model: m.model,
      menuPath: m.menuPath,
      viewType: m.viewType,
      viewTypes: m.viewTypes?.length ? m.viewTypes : undefined,
    }));
}

const WORKFLOW_AI_FORBIDDEN_COMPONENT_KEYS = new Set(["workflow-add-builder"]);
const WORKFLOW_AI_RESERVED_WORKFLOW_KEYS = new Set(["workflow-design", "add-workflow"]);

export function stripMarkdownJsonFence(text: string): string {
  let s = text.trim();
  if (!s.startsWith("```")) return s;
  const lines = s.split("\n");
  if (lines[0]?.startsWith("```")) {
    lines.shift();
  }
  if (lines.length && lines[lines.length - 1].trim().startsWith("```")) {
    lines.pop();
  }
  return lines.join("\n").trim();
}

/** Same rules as the Add workflow key field (kebab-case, safe chars). */
export function normalizeSuggestedWorkflowKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normMenuViewType(raw: string): string {
  const t = raw.trim();
  return t === "list" ? "tree" : t;
}

function catalogViewTypesForAiEntry(entry: WorkflowAiCatalogEntry): string[] {
  if (entry.viewTypes?.length) {
    return [...new Set(entry.viewTypes.map((x) => normMenuViewType(x)).filter(Boolean))];
  }
  if (entry.viewType?.trim()) {
    return [normMenuViewType(entry.viewType)];
  }
  return [];
}

/** Parse AI or pasted JSON (handles optional ```json fences). */
export function parseWorkflowAiDesignJson(text: string): unknown {
  const stripped = stripMarkdownJsonFence(text.trim());
  try {
    return JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) {
      throw new Error("Could not parse JSON (no object found).");
    }
    try {
      return JSON.parse(m[0]);
    } catch {
      throw new Error("Could not parse JSON.");
    }
  }
}

export function validateWorkflowAiSuggestionPayload(
  data: unknown,
  catalog: WorkflowAiCatalogEntry[],
  existingWorkflowKeys: string[]
): { ok: true; suggestion: WorkflowAiSuggestion } | { ok: false; error: string } {
  const byKey = new Map(catalog.map((e) => [e.key, e]));
  const existing = new Set(
    existingWorkflowKeys.map((k) => k.trim().toLowerCase()).filter(Boolean)
  );
  WORKFLOW_AI_RESERVED_WORKFLOW_KEYS.forEach((k) => existing.add(k));

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "Root value must be a JSON object." };
  }
  const o = data as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim()) {
    return { ok: false, error: "Missing or invalid name." };
  }
  if (typeof o.key !== "string" || !o.key.trim()) {
    return { ok: false, error: "Missing or invalid key." };
  }
  const nk = normalizeSuggestedWorkflowKey(o.key);
  if (!nk) {
    return { ok: false, error: "Invalid normalized workflow key." };
  }
  if (existing.has(nk)) {
    return { ok: false, error: `Workflow key "${nk}" is already reserved or exists.` };
  }
  const desc = typeof o.description === "string" ? o.description : "";

  const out: WorkflowAiAreaSuggestion[] = [];
  for (const area of ["left", "middle", "right"] as const) {
    const block = o[area];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      return { ok: false, error: `Missing or invalid area "${area}".` };
    }
    const b = block as Record<string, unknown>;
    if (typeof b.componentKey !== "string" || !b.componentKey.trim()) {
      return { ok: false, error: `Missing componentKey for "${area}".` };
    }
    const ck = b.componentKey.trim();
    if (WORKFLOW_AI_FORBIDDEN_COMPONENT_KEYS.has(ck) || !byKey.has(ck)) {
      return {
        ok: false,
        error: `Invalid componentKey "${ck}" for "${area}" (not in current catalog).`,
      };
    }
    const entry = byKey.get(ck)!;
    const src = (entry.source || "").trim();
    let menuViewType = "";
    if (src === "menu") {
      const allowed = catalogViewTypesForAiEntry(entry);
      const mvt = b.menuViewType;
      if (typeof mvt === "string" && mvt.trim()) {
        const norm = normMenuViewType(mvt);
        if (allowed.length && !allowed.includes(norm)) {
          return {
            ok: false,
            error: `Invalid menuViewType "${mvt}" for "${area}"; allowed: ${allowed.join(", ") || "(none)"}.`,
          };
        }
        menuViewType = norm || allowed[0] || "";
      } else {
        menuViewType = allowed[0] || "";
      }
    }
    out.push({ componentKey: ck, menuViewType });
  }

  const suggestion: WorkflowAiSuggestion = {
    name: o.name.trim(),
    key: nk,
    description: desc.trim(),
    left: out[0],
    middle: out[1],
    right: out[2],
  };

  if (typeof o.leftWidthPx === "number" && Number.isFinite(o.leftWidthPx)) {
    suggestion.leftWidthPx = Math.max(120, Math.min(600, Math.round(o.leftWidthPx)));
  }
  if (typeof o.middleWidthPx === "number" && Number.isFinite(o.middleWidthPx)) {
    suggestion.middleWidthPx = Math.max(120, Math.min(600, Math.round(o.middleWidthPx)));
  }

  return { ok: true, suggestion };
}

export function tryApplyWorkflowAiDesignText(
  text: string,
  catalog: WorkflowAiCatalogEntry[],
  existingWorkflowKeys: string[]
): { ok: true; suggestion: WorkflowAiSuggestion } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = parseWorkflowAiDesignJson(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON." };
  }
  return validateWorkflowAiSuggestionPayload(parsed, catalog, existingWorkflowKeys);
}

/** Bundle for external LLM tools or support — same structure the server sends to OpenAI. */
export function buildWorkflowAiExternalContextJson(
  userRequest: string,
  catalog: WorkflowAiCatalogEntry[],
  reservedWorkflowKeys: string[]
): string {
  return JSON.stringify(
    {
      system_instructions: WORKFLOW_AI_SYSTEM_PROMPT,
      user_request: userRequest.trim(),
      catalog,
      reserved_workflow_keys: reservedWorkflowKeys,
    },
    null,
    2
  );
}

export type WorkflowAiProviderId = "openai_compatible" | "anthropic" | "openclaw";

export type WorkflowAiProvidersMeta = {
  ok: boolean;
  defaultProvider?: WorkflowAiProviderId;
  providers?: Record<string, { configured: boolean; label: string }>;
};

export async function fetchWorkflowAiProviders(): Promise<WorkflowAiProvidersMeta> {
  return callOdooJsonRoute<WorkflowAiProvidersMeta>(workflowApiUrl("/workflows/ai_providers"), {});
}

export type WorkflowAiSettingsLoadResult = {
  ok: boolean;
  allowed: boolean;
  provider?: WorkflowAiProviderId;
  openaiBaseUrl?: string;
  openaiModel?: string;
  hasOpenaiKey?: boolean;
  anthropicModel?: string;
  hasAnthropicKey?: boolean;
  openclawBaseUrl?: string;
  openclawAgentId?: string;
  openclawModel?: string;
  hasOpenclawToken?: boolean;
  sslVerify?: boolean;
  sslCaBundle?: string;
  error?: string;
};

export async function loadWorkflowAiSettings(): Promise<WorkflowAiSettingsLoadResult> {
  return callOdooJsonRoute<WorkflowAiSettingsLoadResult>(workflowApiUrl("/workflows/ai_settings/load"), {});
}

export async function saveWorkflowAiSettings(payload: {
  provider?: WorkflowAiProviderId;
  openaiBaseUrl?: string;
  openaiModel?: string;
  openaiApiKey?: string;
  anthropicModel?: string;
  anthropicApiKey?: string;
  openclawBaseUrl?: string;
  openclawAgentId?: string;
  openclawModel?: string;
  openclawToken?: string;
  sslVerify?: boolean;
  sslCaBundle?: string;
}): Promise<{ ok: boolean; error?: string; forbidden?: boolean }> {
  return callOdooJsonRoute<{ ok: boolean; error?: string; forbidden?: boolean }>(
    workflowApiUrl("/workflows/ai_settings/save"),
    payload as Record<string, unknown>
  );
}

export async function suggestWorkflowLayoutFromAi(params: {
  prompt: string;
  catalog: WorkflowAiCatalogEntry[];
  existingWorkflowKeys: string[];
  provider?: WorkflowAiProviderId;
}): Promise<{
  ok: boolean;
  suggestion?: WorkflowAiSuggestion;
  error?: string;
  assistantRaw?: string;
}> {
  return callOdooJsonRoute<{
    ok: boolean;
    suggestion?: WorkflowAiSuggestion;
    error?: string;
    assistant_raw?: string;
  }>(workflowApiUrl("/workflows/ai_suggest"), {
    prompt: params.prompt,
    catalog: params.catalog,
    existingWorkflowKeys: params.existingWorkflowKeys,
    ...(params.provider ? { provider: params.provider } : {}),
  }).then((data) => ({
    ok: Boolean(data?.ok),
    suggestion: data?.suggestion,
    error: data?.error,
    assistantRaw: data?.assistant_raw,
  }));
}

export interface UiThemePayload {
  ok?: boolean;
  company_primary_hex?: string;
  company_secondary_hex?: string;
  company_name?: string;
}

export const fetchUiTheme = async (): Promise<{
  company_primary_hex: string;
  company_secondary_hex: string;
  company_name: string;
}> => {
  const data = await callOdooJsonRoute<UiThemePayload>(workflowApiUrl("/ui/theme"), {});
  const primary = data?.company_primary_hex;
  const secondary = data?.company_secondary_hex;
  return {
    company_primary_hex: typeof primary === "string" && primary.startsWith("#") ? primary : "#f16300",
    company_secondary_hex: typeof secondary === "string" && secondary.startsWith("#") ? secondary : "#7b96a1",
    company_name: typeof data.company_name === "string" ? data.company_name : "",
  };
};
