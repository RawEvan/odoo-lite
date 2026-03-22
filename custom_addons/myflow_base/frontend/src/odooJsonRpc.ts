let nextRpcId = 1;

export interface OdooJsonRpcErrorBody {
  code?: number;
  message?: string;
  data?: { message?: string; name?: string; debug?: string };
}

export async function callOdooJsonRoute<T>(
  url: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const id = nextRpcId++;
  // Root-absolute path only — avoids resolving under `/workflow/<key>/` by mistake.
  const resolved =
    url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")
      ? url
      : `/${url}`;
  const res = await fetch(resolved, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params,
      id,
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw = (await res.json()) as {
    jsonrpc?: string;
    id?: number;
    result?: T;
    error?: OdooJsonRpcErrorBody;
  };

  if (raw?.error) {
    const e = raw.error;
    const msg = e.data?.message || e.message || "Odoo JSON-RPC error";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  if (raw && "result" in raw) return raw.result as T;
  return raw as T;
}
