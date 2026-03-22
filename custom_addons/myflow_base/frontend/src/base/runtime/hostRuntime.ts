/**
 * Standalone workflow pages: `/workflow/<workflowKey>` (no module prefix).
 *
 * Hubs: `/myflow_base` or `/cr_product_configurations` (entry points; API prefix remembered).
 * On hubs, the selected workflow tab is kept in the query string: `?wf=<workflowKey>`.
 */

const SS_API = "wfWorkflowApiPrefix";
const SS_HUB = "wfHubUrl";

export function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function safeSessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeSessionRemove(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const VALID_API_PREFIXES: readonly string[] = ["/myflow_base", "/cr_product_configurations"];

function readValidWorkflowApiPrefix(): string | null {
  const p = safeSessionGet(SS_API);
  if (!p) return null;
  if (VALID_API_PREFIXES.includes(p)) return p;
  safeSessionRemove(SS_API);
  return null;
}

function readValidHubUrl(): string | null {
  const h = safeSessionGet(SS_HUB);
  if (!h) return null;
  if (VALID_API_PREFIXES.includes(h)) return h;
  safeSessionRemove(SS_HUB);
  return null;
}

/** Call when the hub page loads so `/workflow/...` pages know which API + “back” URL to use. */
export function rememberHubContextFromPath(): void {
  const path = normalizePathname(window.location.pathname);
  if (path === "/myflow_base" || path.startsWith("/myflow_base/")) {
    safeSessionSet(SS_API, "/myflow_base");
    safeSessionSet(SS_HUB, "/myflow_base");
  } else if (path === "/cr_product_configurations" || path.startsWith("/cr_product_configurations/")) {
    safeSessionSet(SS_API, "/cr_product_configurations");
    safeSessionSet(SS_HUB, "/cr_product_configurations");
  }
}

/** JSON-RPC base path for workflow list/save (not the human-facing workflow URL). */
export function getWorkflowApiPrefix(): string {
  const path = normalizePathname(window.location.pathname);
  if (import.meta.env.DEV) {
    if (path.includes("cr_product_configurations")) return "/cr_product_configurations";
    if (path === "/" || path === "/index.html") return "/myflow_base";
  }
  // Standalone page `/workflow/<key>` — never use pathname as API root (fixes …/workflow/x/api/…).
  if (/^\/workflow\/[^/]+$/.test(path)) {
    return readValidWorkflowApiPrefix() ?? "/myflow_base";
  }
  const p = readValidWorkflowApiPrefix();
  return p ?? "/myflow_base";
}

/** “All workflows” target from a standalone `/workflow/...` page. */
export function getHubUrl(): string {
  return readValidHubUrl() ?? "/myflow_base";
}

/** When set, UI shows one workflow only (dedicated page at `/workflow/<key>`). */
export function getStandaloneWorkflowKey(): string | null {
  const path = normalizePathname(window.location.pathname);
  if (import.meta.env.DEV && (path === "/" || path === "/index.html")) {
    return null;
  }
  const m = path.match(/^\/workflow\/([^/]+)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function isStandaloneWorkflowPage(): boolean {
  return getStandaloneWorkflowKey() !== null;
}

export function getWorkflowPageUrl(workflowKey: string): string {
  return `/workflow/${encodeURIComponent(workflowKey)}`;
}

export const WORKFLOW_COMPOSER_PATH = "/workflow-composer";

export function isWorkflowComposerPage(): boolean {
  return normalizePathname(window.location.pathname) === WORKFLOW_COMPOSER_PATH;
}

export function getWorkflowComposerUrl(
  area: "left" | "middle" | "right",
  returnTo?: string
): string {
  const params = new URLSearchParams();
  params.set("area", area);
  if (returnTo) params.set("return", returnTo);
  return `${WORKFLOW_COMPOSER_PATH}?${params.toString()}`;
}

/** Hub pages: active tab is reflected as `?wf=<workflowKey>` (shareable / refresh-safe). */
export const WORKFLOW_URL_QUERY = "wf";

/** Read workflow key from the hub URL query string. */
export function readHubWorkflowKeyFromUrl(): string | null {
  try {
    const raw = new URLSearchParams(window.location.search).get(WORKFLOW_URL_QUERY);
    if (raw == null || raw === "") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return decodeURIComponent(trimmed);
    } catch {
      return trimmed;
    }
  } catch {
    return null;
  }
}

/**
 * Update `?wf=` on the current hub URL without navigation or a new history entry.
 * No-op on standalone `/workflow/<key>` pages.
 */
export function replaceHubUrlWorkflowParam(workflowKey: string): void {
  if (getStandaloneWorkflowKey() !== null) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(WORKFLOW_URL_QUERY, workflowKey);
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", next);
  } catch {
    /* ignore */
  }
}

/** Shareable URL for a workflow: hub uses `?wf=`, standalone uses `/workflow/<key>`. */
export function getWorkflowKeyHref(workflowKey: string): string {
  if (getStandaloneWorkflowKey() !== null) {
    return getWorkflowPageUrl(workflowKey);
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(WORKFLOW_URL_QUERY, workflowKey);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return `?${WORKFLOW_URL_QUERY}=${encodeURIComponent(workflowKey)}`;
  }
}
