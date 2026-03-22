# -*- coding: utf-8 -*-
import json
import os
import re
import ssl
import urllib.error
import urllib.request
from urllib.parse import quote

import jinja2

from odoo import http
from odoo.http import request

loader = jinja2.PackageLoader("odoo.addons.myflow_base.static", "src")
jinja_env = jinja2.Environment(loader=loader, autoescape=True)
ALLOWED_STANDARD_VIEW_TYPES = (
    "form",
    "tree",
    "kanban",
    "calendar",
    "graph",
    "pivot",
    "search",
    "activity",
    "gantt",
)

# Keep in sync with WORKFLOW_AI_SYSTEM_PROMPT in workflowService.ts (frontend).
_WORKFLOW_AI_SYSTEM_PROMPT = (
    "You are assisting with a three-column workflow UI for Odoo. Each column (left, middle, right) "
    "must show exactly one component from the provided catalog.\n"
    "Respond with a single JSON object only (no markdown), shape:\n"
    '{"name":"…","key":"lowercase-kebab-case","description":"…",'
    '"left":{"componentKey":"<exact catalog key>","menuViewType":"<optional>"},'
    '"middle":{…},"right":{…},'
    '"leftWidthPx":<optional int 120-600>,"middleWidthPx":<optional int 120-600>}\n'
    'For catalog items with source "menu", set menuViewType to one of the listed view types '
    '(use "tree" for list views). For other sources, use empty string for menuViewType.\n'
    "componentKey must match a catalog key exactly. Do not invent keys."
)


def _json_route_payload(kwargs):
    inner = kwargs.get("payload")
    if isinstance(inner, dict):
        return inner
    return dict(kwargs)


def _normalize_view_type(raw_type):
    if raw_type == "list":
        return "tree"
    return raw_type


def _sanitize_limit(raw_limit, default=250, minimum=1, maximum=1000):
    try:
        value = int(raw_limit)
    except (TypeError, ValueError):
        return default
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


def _sanitize_offset(raw_offset):
    try:
        value = int(raw_offset)
    except (TypeError, ValueError):
        return 0
    if value < 0:
        return 0
    return value


def _safe_int(raw):
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


# Odoo ``res.company.color`` kanban index → hex (same palette as cr_inter_company banner).
_COMPANY_KANBAN_COLOR_HEX = {
    0: "#a2a2a2",
    1: "#ee2d2d",
    2: "#dc8534",
    3: "#e8bb1d",
    4: "#5794dd",
    5: "#9f628f",
    6: "#db8865",
    7: "#41a9a2",
    8: "#304be0",
    9: "#ee2f8a",
    10: "#61c36e",
    11: "#9872e6",
}

_DEFAULT_WORKFLOW_ACCENT_HEX = "#f16300"
_DEFAULT_WORKFLOW_SECONDARY_HEX = "#7b96a1"


def _normalize_css_hex(raw):
    """Return ``#RRGGBB`` or None."""
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s:
        return None
    if s.startswith("#"):
        if len(s) == 4 and s[0] == "#" and all(
            c in "0123456789abcdefABCDEF" for c in s[1:]
        ):
            r, g, b = s[1], s[2], s[3]
            return "#%s%s%s" % (r * 2, g * 2, b * 2)
        if len(s) == 7 and all(c in "0123456789abcdefABCDEF" for c in s[1:]):
            return "#" + s[1:].lower()
        if len(s) == 9 and s[0] == "#":
            return "#" + s[1:7].lower()
    if len(s) == 6 and all(c in "0123456789abcdefABCDEF" for c in s):
        return "#" + s.lower()
    return None


def _company_primary_hex(company):
    """Best-effort accent for the workflow shell (theme modules + standard kanban index)."""
    if not company:
        return _DEFAULT_WORKFLOW_ACCENT_HEX
    for fname in (
        "spiffy_toobar_color",
        "theme_color_pwa",
        "primary_color",
        "login_page_text_color",
    ):
        if fname not in company._fields:
            continue
        val = company[fname]
        if isinstance(val, str):
            hx = _normalize_css_hex(val)
            if hx:
                return hx
    if "color" in company._fields:
        idx = _safe_int(company.color)
        if idx is not None and idx in _COMPANY_KANBAN_COLOR_HEX:
            return _COMPANY_KANBAN_COLOR_HEX[idx]
    return _DEFAULT_WORKFLOW_ACCENT_HEX


def _company_secondary_hex(company):
    """Muted / supporting UI color (theme modules; skip light background fields)."""
    if not company:
        return _DEFAULT_WORKFLOW_SECONDARY_HEX
    for fname in (
        "secondary_color",
        "login_page_text_color",
    ):
        if fname not in company._fields:
            continue
        val = company[fname]
        if isinstance(val, str):
            hx = _normalize_css_hex(val)
            if hx:
                return hx
    return _DEFAULT_WORKFLOW_SECONDARY_HEX


def _action_primary_view_id(action):
    if getattr(action, "view_id", None):
        return action.view_id.id
    views = getattr(action, "views", None) or []
    for pair in views:
        if not isinstance(pair, (list, tuple)) or len(pair) < 1:
            continue
        vid = _safe_int(pair[0])
        if vid:
            return vid
    return None


def _action_view_types(action):
    view_mode = (getattr(action, "view_mode", None) or "").strip()
    if not view_mode:
        return []
    view_types = []
    for raw in view_mode.split(","):
        vt = _normalize_view_type((raw or "").strip())
        if vt:
            view_types.append(vt)
    return view_types


class WorkflowBaseApi(http.Controller):
    @http.route(
        "/myflow_base",
        type="http",
        auth="user",
        website=True,
    )
    def get_page(self, **kw):
        return jinja_env.get_template("index.html").render({"title": "Myflow Base"})

    @http.route(
        "/workflow/<string:workflow_key>",
        type="http",
        auth="user",
        website=True,
    )
    def workflow_standalone_page(self, workflow_key, **kw):
        """One URL per workflow: ``/workflow/<key>`` (no module prefix)."""
        return jinja_env.get_template("index.html").render({"title": "Workflow"})

    @http.route(
        "/myflow_base/workflow/<string:workflow_key>",
        type="http",
        auth="user",
        website=True,
    )
    def legacy_workflow_path_redirect(self, workflow_key, **kw):
        return request.redirect("/workflow/%s" % quote(workflow_key, safe=""))

    def _serialize_workflow(self, wf):
        layout = {}
        if wf.layout:
            try:
                layout = json.loads(wf.layout)
            except (json.JSONDecodeError, TypeError):
                pass
        if not isinstance(layout, dict) or not all(k in layout for k in ("left", "middle", "right")):
            layout = {}
        if not layout:
            defaults = request.env["cr.workflow.design"]._get_default_layout_fallback()
            layout = defaults.get(wf.key, {})
        return {
            "id": wf.id,
            "name": wf.name,
            "key": wf.key,
            "description": wf.description or "",
            "layout": layout,
            "sequence": wf.sequence,
            "active": wf.active,
        }

    @http.route(
        [
            "/myflow_base/api/ui/theme",
            "/cr_product_configurations/api/ui/theme",
        ],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_ui_theme(self):
        company = request.env.company.sudo()
        return {
            "ok": True,
            "company_primary_hex": _company_primary_hex(company),
            "company_secondary_hex": _company_secondary_hex(company),
            "company_name": company.name or "",
        }

    @http.route(
        ["/myflow_base/api/workflows/list", "/cr_product_configurations/api/workflows/list"],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_list_workflows(self):
        workflows = request.env["cr.workflow.design"].search([("active", "=", True)])
        unique = []
        seen_keys = set()
        for w in workflows.sorted(key=lambda w: (w.sequence, w.id)):
            if w.key in seen_keys:
                continue
            seen_keys.add(w.key)
            unique.append(w)
        return [self._serialize_workflow(w) for w in unique]

    @http.route(
        ["/myflow_base/api/workflows/save", "/cr_product_configurations/api/workflows/save"],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_save_workflow(self, **kwargs):
        payload = _json_route_payload(kwargs)
        Workflow = request.env["cr.workflow.design"].sudo()

        wf_id = payload.get("id")
        vals = {}
        for field in ("name", "key", "description", "sequence", "active"):
            if field in payload:
                vals[field] = payload[field]
        if "layout" in payload:
            lo = payload["layout"]
            vals["layout"] = json.dumps(lo) if isinstance(lo, dict) else lo

        if not vals.get("name") and not wf_id:
            return {"ok": False, "error": "Name is required"}
        if not vals.get("key") and not wf_id:
            return {"ok": False, "error": "Key is required"}

        if wf_id:
            record = Workflow.browse(wf_id)
            if not record.exists():
                return {"ok": False, "error": "Workflow not found"}
            record.write(vals)
            return {"ok": True, "id": record.id}

        record = Workflow.create(vals)
        return {"ok": True, "id": record.id}

    _PROTECTED_WORKFLOW_KEYS = frozenset(("workflow-design", "add-workflow"))

    @http.route(
        ["/myflow_base/api/workflows/delete", "/cr_product_configurations/api/workflows/delete"],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_delete_workflow(self, **kwargs):
        payload = _json_route_payload(kwargs)
        raw_id = payload.get("id")
        try:
            wf_id = int(raw_id)
        except (TypeError, ValueError):
            return {"ok": False, "error": "Workflow id is required"}

        Workflow = request.env["cr.workflow.design"].sudo()
        record = Workflow.browse(wf_id)
        if not record.exists():
            return {"ok": False, "error": "Workflow not found"}
        if record.key in self._PROTECTED_WORKFLOW_KEYS:
            return {"ok": False, "error": "Cannot delete built-in workflow %r" % record.key}
        record.unlink()
        return {"ok": True}

    _WORKFLOW_AI_FORBIDDEN_KEYS = frozenset(("workflow-add-builder",))

    def _workflow_ai_icp(self):
        return request.env["ir.config_parameter"].sudo()

    def _workflow_ai_ssl_context_for_requests(self):
        """
        TLS for outbound workflow-AI HTTPS calls. Use when a proxy or local LLM uses a
        self-signed certificate (disable verify) or a private CA (custom bundle path).
        """
        icp = self._workflow_ai_icp()
        verify_raw = (icp.get_param("myflow_base.workflow_ai_ssl_verify") or "").strip().lower()
        if not verify_raw:
            verify_raw = (os.environ.get("WORKFLOW_AI_SSL_VERIFY") or "1").strip().lower()
        ca_bundle = (icp.get_param("myflow_base.workflow_ai_ssl_ca_bundle") or "").strip()
        if not ca_bundle:
            ca_bundle = (os.environ.get("WORKFLOW_AI_SSL_CA_BUNDLE") or "").strip()

        if verify_raw in ("0", "false", "no", "off"):
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            return ctx

        if ca_bundle and os.path.isfile(ca_bundle):
            try:
                return ssl.create_default_context(cafile=ca_bundle)
            except (OSError, ssl.SSLError):
                pass

        return None

    def _workflow_ai_http_post_json(self, url, headers, body, timeout=120):
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST")
        for hk, hv in headers.items():
            req.add_header(hk, hv)
        ctx = None
        if isinstance(url, str) and url.lower().startswith("https://"):
            ctx = self._workflow_ai_ssl_context_for_requests()
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace") if e.fp else ""
            return None, "HTTP %s: %s" % (e.code, err_body[:800])
        except urllib.error.URLError as e:
            return None, "Request failed: %s" % (e.reason,)
        try:
            return json.loads(raw), None
        except (json.JSONDecodeError, TypeError):
            return None, "Invalid JSON in LLM response"

    def _workflow_ai_chat_openai_compatible(self, base_url, bearer_token, model, messages, extra_headers=None):
        url = "%s/chat/completions" % base_url.rstrip("/")
        hdrs = {
            "Content-Type": "application/json",
            "Authorization": "Bearer %s" % bearer_token,
        }
        if extra_headers:
            for k, v in extra_headers.items():
                if v is not None and str(v).strip():
                    hdrs[k] = str(v).strip()
        body = {"model": model, "messages": messages, "temperature": 0.2}
        payload, err = self._workflow_ai_http_post_json(url, hdrs, body)
        if err:
            return None, err
        choices = (payload or {}).get("choices") or []
        if not choices:
            return None, "No choices in chat/completions response"
        msg = (choices[0] or {}).get("message") or {}
        content = msg.get("content")
        if not isinstance(content, str):
            return None, "Empty assistant message"
        return content, None

    def _workflow_ai_chat_anthropic(self, api_key, model, system_text, user_text):
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }
        body = {
            "model": model,
            "max_tokens": 8192,
            "system": system_text,
            "messages": [{"role": "user", "content": user_text}],
            "temperature": 0.2,
        }
        payload, err = self._workflow_ai_http_post_json(url, headers, body)
        if err:
            return None, err
        blocks = (payload or {}).get("content") or []
        parts = []
        for b in blocks:
            if isinstance(b, dict) and b.get("type") == "text" and isinstance(b.get("text"), str):
                parts.append(b["text"])
        text = "".join(parts).strip()
        if not text:
            return None, "Empty Anthropic assistant content"
        return text, None

    def _workflow_ai_config_openai_compatible(self):
        icp = self._workflow_ai_icp()
        api_key = (icp.get_param("myflow_base.workflow_ai_openai_api_key") or "").strip()
        if not api_key:
            api_key = (os.environ.get("WORKFLOW_AI_OPENAI_API_KEY") or "").strip()
        model = (icp.get_param("myflow_base.workflow_ai_model") or "").strip()
        if not model:
            model = (os.environ.get("WORKFLOW_AI_OPENAI_MODEL") or "gpt-4o-mini").strip()
        base_url = (icp.get_param("myflow_base.workflow_ai_openai_base_url") or "").strip()
        if not base_url:
            base_url = (os.environ.get("WORKFLOW_AI_OPENAI_BASE_URL") or "https://api.openai.com/v1").strip()
        return api_key, model, base_url.rstrip("/")

    def _workflow_ai_config_anthropic(self):
        icp = self._workflow_ai_icp()
        api_key = (icp.get_param("myflow_base.workflow_ai_anthropic_api_key") or "").strip()
        if not api_key:
            api_key = (os.environ.get("WORKFLOW_AI_ANTHROPIC_API_KEY") or "").strip()
        model = (icp.get_param("myflow_base.workflow_ai_anthropic_model") or "").strip()
        if not model:
            model = (os.environ.get("WORKFLOW_AI_ANTHROPIC_MODEL") or "claude-sonnet-4-20250514").strip()
        return api_key, model

    def _workflow_ai_config_openclaw(self):
        icp = self._workflow_ai_icp()
        token = (icp.get_param("myflow_base.workflow_ai_openclaw_token") or "").strip()
        if not token:
            token = (
                os.environ.get("OPENCLAW_GATEWAY_TOKEN")
                or os.environ.get("WORKFLOW_AI_OPENCLAW_TOKEN")
                or ""
            ).strip()
        base_url = (icp.get_param("myflow_base.workflow_ai_openclaw_base_url") or "").strip()
        if not base_url:
            base_url = (os.environ.get("WORKFLOW_AI_OPENCLAW_BASE_URL") or "http://127.0.0.1:18789/v1").strip()
        agent_id = (icp.get_param("myflow_base.workflow_ai_openclaw_agent_id") or "").strip()
        if not agent_id:
            agent_id = (os.environ.get("WORKFLOW_AI_OPENCLAW_AGENT_ID") or "main").strip()
        model = (icp.get_param("myflow_base.workflow_ai_openclaw_model") or "").strip()
        if not model:
            model = (os.environ.get("WORKFLOW_AI_OPENCLAW_MODEL") or "openclaw:main").strip()
        return token, base_url.rstrip("/"), agent_id, model

    def _workflow_ai_default_provider_icp(self):
        icp = self._workflow_ai_icp()
        p = (icp.get_param("myflow_base.workflow_ai_provider") or "").strip().lower()
        if p in ("openai", "openai_compatible"):
            return "openai_compatible"
        if p == "anthropic":
            return "anthropic"
        if p == "openclaw":
            return "openclaw"
        return "openai_compatible"

    def _workflow_ai_resolve_provider(self, payload):
        raw = payload.get("provider")
        if isinstance(raw, str) and raw.strip():
            p = raw.strip().lower()
            if p in ("openai", "openai_compatible"):
                return "openai_compatible"
            if p == "anthropic":
                return "anthropic"
            if p == "openclaw":
                return "openclaw"
        return self._workflow_ai_default_provider_icp()

    def _workflow_ai_parse_json_object(self, text):
        s = (text or "").strip()
        if s.startswith("```"):
            lines = s.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            s = "\n".join(lines).strip()
        try:
            return json.loads(s)
        except (json.JSONDecodeError, TypeError):
            pass
        m = re.search(r"\{[\s\S]*\}\s*$", s)
        if m:
            try:
                return json.loads(m.group(0))
            except (json.JSONDecodeError, TypeError):
                pass
        return None

    def _workflow_ai_normalize_view_type(self, raw):
        if not isinstance(raw, str):
            return ""
        t = raw.strip()
        if t == "list":
            return "tree"
        return t

    def _workflow_ai_validate_suggestion(self, data, catalog_by_key, existing_keys):
        if not isinstance(data, dict):
            return None, "Assistant did not return a JSON object"
        name = data.get("name")
        key = data.get("key")
        desc = data.get("description")
        if not isinstance(name, str) or not name.strip():
            return None, "Missing or invalid name"
        if not isinstance(key, str) or not key.strip():
            return None, "Missing or invalid key"
        if not isinstance(desc, str):
            desc = ""
        nk = key.strip().lower()
        nk = re.sub(r"[^a-z0-9_\s-]", "", nk)
        nk = re.sub(r"\s+", "-", nk)
        nk = re.sub(r"-+", "-", nk).strip("-")
        if not nk:
            return None, "Invalid normalized workflow key"
        if nk in existing_keys:
            return None, "Suggested key %r already exists; pick another in the UI or adjust the prompt." % nk
        areas = {}
        for a in ("left", "middle", "right"):
            block = data.get(a)
            if not isinstance(block, dict):
                return None, "Missing or invalid area %r" % a
            ck = block.get("componentKey")
            if not isinstance(ck, str) or not ck.strip():
                return None, "Missing componentKey for %r" % a
            ck = ck.strip()
            if ck in self._WORKFLOW_AI_FORBIDDEN_KEYS or ck not in catalog_by_key:
                return None, "Invalid componentKey %r for %r (must be from the catalog)" % (ck, a)
            meta = catalog_by_key[ck]
            src = (meta.get("source") or "").strip()
            mvt = block.get("menuViewType")
            if src == "menu":
                vtypes = []
                if isinstance(meta.get("viewTypes"), list):
                    vtypes = [
                        self._workflow_ai_normalize_view_type(x)
                        for x in meta["viewTypes"]
                        if isinstance(x, str) and self._workflow_ai_normalize_view_type(x)
                    ]
                elif isinstance(meta.get("viewType"), str) and meta["viewType"].strip():
                    vtypes = [self._workflow_ai_normalize_view_type(meta["viewType"])]
                vtypes = [x for x in vtypes if x]
                if isinstance(mvt, str) and mvt.strip():
                    norm = self._workflow_ai_normalize_view_type(mvt)
                    if vtypes and norm not in vtypes:
                        return None, "Invalid menuViewType %r for %r; allowed: %s" % (
                            mvt,
                            a,
                            ", ".join(vtypes),
                        )
                    areas[a] = {"componentKey": ck, "menuViewType": norm or (vtypes[0] if vtypes else "")}
                else:
                    areas[a] = {"componentKey": ck, "menuViewType": vtypes[0] if vtypes else ""}
            else:
                areas[a] = {"componentKey": ck, "menuViewType": ""}
        out = {
            "name": name.strip(),
            "key": nk,
            "description": desc.strip(),
            "left": areas["left"],
            "middle": areas["middle"],
            "right": areas["right"],
        }
        for dim_key, out_key in (("leftWidthPx", "leftWidthPx"), ("middleWidthPx", "middleWidthPx")):
            raw_w = data.get(dim_key)
            if raw_w is None:
                continue
            try:
                w = int(raw_w)
            except (TypeError, ValueError):
                continue
            w = max(120, min(600, w))
            out[out_key] = w
        return out, None

    def _workflow_ai_build_system_prompt(self):
        return _WORKFLOW_AI_SYSTEM_PROMPT

    @http.route(
        [
            "/myflow_base/api/workflows/ai_suggest",
            "/cr_product_configurations/api/workflows/ai_suggest",
        ],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_workflow_ai_suggest(self, **kwargs):
        payload = _json_route_payload(kwargs)
        prompt = payload.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            return {"ok": False, "error": "prompt is required"}
        catalog = payload.get("catalog")
        if not isinstance(catalog, list) or not catalog:
            return {"ok": False, "error": "catalog is required"}
        if len(catalog) > 600:
            return {"ok": False, "error": "catalog too large"}
        catalog_by_key = {}
        compact = []
        for item in catalog:
            if not isinstance(item, dict):
                continue
            k = item.get("key")
            if not isinstance(k, str) or not k.strip():
                continue
            k = k.strip()
            if k in self._WORKFLOW_AI_FORBIDDEN_KEYS:
                continue
            entry = {
                "key": k,
                "name": (item.get("name") or "")[:500],
                "description": (item.get("description") or "")[:2000],
                "source": (item.get("source") or "")[:64],
                "model": (item.get("model") or "")[:256],
                "menuPath": (item.get("menuPath") or "")[:2000],
            }
            vt = item.get("viewTypes")
            if isinstance(vt, list):
                entry["viewTypes"] = [str(x)[:32] for x in vt[:24] if isinstance(x, str)]
            elif isinstance(item.get("viewType"), str) and item["viewType"].strip():
                entry["viewType"] = item["viewType"].strip()[:32]
            catalog_by_key[k] = entry
            compact.append(entry)
        if len(catalog_by_key) < 3:
            return {"ok": False, "error": "catalog must include at least three assignable components"}

        existing = payload.get("existingWorkflowKeys")
        existing_keys = set()
        if isinstance(existing, list):
            for x in existing:
                if isinstance(x, str) and x.strip():
                    existing_keys.add(x.strip().lower())
        existing_keys.update(self._PROTECTED_WORKFLOW_KEYS)

        user_blob = {
            "user_request": prompt.strip()[:8000],
            "catalog": compact,
            "reserved_workflow_keys": sorted(existing_keys),
        }
        system_p = self._workflow_ai_build_system_prompt()
        user_json = json.dumps(user_blob, ensure_ascii=False)
        messages = [
            {"role": "system", "content": system_p},
            {"role": "user", "content": user_json},
        ]

        provider = self._workflow_ai_resolve_provider(payload)
        assistant_text = None
        err = None
        if provider == "anthropic":
            api_key, model = self._workflow_ai_config_anthropic()
            if not api_key:
                return {
                    "ok": False,
                    "error": "Anthropic is not configured. Set myflow_base.workflow_ai_anthropic_api_key "
                    "or WORKFLOW_AI_ANTHROPIC_API_KEY.",
                }
            assistant_text, err = self._workflow_ai_chat_anthropic(api_key, model, system_p, user_json)
        elif provider == "openclaw":
            token, base_url, agent_id, model = self._workflow_ai_config_openclaw()
            if not token:
                return {
                    "ok": False,
                    "error": "OpenClaw is not configured. Set myflow_base.workflow_ai_openclaw_token "
                    "or OPENCLAW_GATEWAY_TOKEN (gateway must expose POST /v1/chat/completions).",
                }
            assistant_text, err = self._workflow_ai_chat_openai_compatible(
                base_url,
                token,
                model,
                messages,
                {"x-openclaw-agent-id": agent_id},
            )
        else:
            api_key, model, base_url = self._workflow_ai_config_openai_compatible()
            if not api_key:
                return {
                    "ok": False,
                    "error": "OpenAI-compatible provider is not configured. Set "
                    "myflow_base.workflow_ai_openai_api_key or WORKFLOW_AI_OPENAI_API_KEY.",
                }
            assistant_text, err = self._workflow_ai_chat_openai_compatible(
                base_url, api_key, model, messages
            )

        if err:
            return {"ok": False, "error": err}
        parsed = self._workflow_ai_parse_json_object(assistant_text)
        suggestion, verr = self._workflow_ai_validate_suggestion(parsed, catalog_by_key, existing_keys)
        if verr:
            return {
                "ok": False,
                "error": verr,
                "assistant_raw": assistant_text[:12000],
            }
        return {"ok": True, "suggestion": suggestion}

    @http.route(
        [
            "/myflow_base/api/workflows/ai_providers",
            "/cr_product_configurations/api/workflows/ai_providers",
        ],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_workflow_ai_providers(self, **kwargs):
        ok_oak, _, _ = self._workflow_ai_config_openai_compatible()
        ok_ant, _ = self._workflow_ai_config_anthropic()
        ok_oc, _, _, _ = self._workflow_ai_config_openclaw()
        return {
            "ok": True,
            "defaultProvider": self._workflow_ai_default_provider_icp(),
            "providers": {
                "openai_compatible": {
                    "configured": bool(ok_oak),
                    "label": "OpenAI-compatible (OpenAI, Azure, proxies, …)",
                },
                "anthropic": {
                    "configured": bool(ok_ant),
                    "label": "Anthropic (Claude)",
                },
                "openclaw": {
                    "configured": bool(ok_oc),
                    "label": "OpenClaw gateway agent (/v1/chat/completions)",
                },
            },
        }

    def _workflow_ai_settings_is_admin(self):
        return request.env.user.has_group("base.group_system")

    def _workflow_ai_icp_get_str(self, icp, param_key, default=""):
        return (icp.get_param(param_key) or default).strip()

    @http.route(
        [
            "/myflow_base/api/workflows/ai_settings/load",
            "/cr_product_configurations/api/workflows/ai_settings/load",
        ],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_workflow_ai_settings_load(self, **kwargs):
        if not self._workflow_ai_settings_is_admin():
            return {"ok": True, "allowed": False}
        icp = request.env["ir.config_parameter"].sudo()
        p = self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_provider")
        if p not in ("openai_compatible", "anthropic", "openclaw"):
            p = "openai_compatible"
        verify_raw = self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_ssl_verify")
        if not verify_raw:
            verify_raw = (os.environ.get("WORKFLOW_AI_SSL_VERIFY") or "1").strip().lower()
        ca_disp = self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_ssl_ca_bundle")
        if not ca_disp:
            ca_disp = (os.environ.get("WORKFLOW_AI_SSL_CA_BUNDLE") or "").strip()
        return {
            "ok": True,
            "allowed": True,
            "provider": p,
            "openaiBaseUrl": self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_openai_base_url"),
            "openaiModel": self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_model"),
            "hasOpenaiKey": bool(self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_openai_api_key")),
            "anthropicModel": self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_anthropic_model"),
            "hasAnthropicKey": bool(self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_anthropic_api_key")),
            "openclawBaseUrl": self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_openclaw_base_url"),
            "openclawAgentId": self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_openclaw_agent_id"),
            "openclawModel": self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_openclaw_model"),
            "hasOpenclawToken": bool(self._workflow_ai_icp_get_str(icp, "myflow_base.workflow_ai_openclaw_token")),
            "sslVerify": verify_raw not in ("0", "false", "no", "off"),
            "sslCaBundle": ca_disp,
        }

    @http.route(
        [
            "/myflow_base/api/workflows/ai_settings/save",
            "/cr_product_configurations/api/workflows/ai_settings/save",
        ],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_workflow_ai_settings_save(self, **kwargs):
        if not self._workflow_ai_settings_is_admin():
            return {
                "ok": False,
                "error": "Only administrators can change workflow AI settings.",
                "forbidden": True,
            }
        payload = _json_route_payload(kwargs)
        icp = request.env["ir.config_parameter"].sudo()

        def write_str(param_key, max_len, raw):
            if raw is None:
                return
            if not isinstance(raw, str):
                return
            icp.set_param(param_key, raw.strip()[:max_len])

        prov = payload.get("provider")
        if isinstance(prov, str) and prov.strip().lower() in ("openai_compatible", "anthropic", "openclaw"):
            icp.set_param("myflow_base.workflow_ai_provider", prov.strip().lower())

        write_str("myflow_base.workflow_ai_openai_base_url", 512, payload.get("openaiBaseUrl"))
        write_str("myflow_base.workflow_ai_model", 128, payload.get("openaiModel"))
        write_str("myflow_base.workflow_ai_anthropic_model", 128, payload.get("anthropicModel"))
        write_str("myflow_base.workflow_ai_openclaw_base_url", 512, payload.get("openclawBaseUrl"))
        write_str("myflow_base.workflow_ai_openclaw_agent_id", 128, payload.get("openclawAgentId"))
        write_str("myflow_base.workflow_ai_openclaw_model", 128, payload.get("openclawModel"))

        sv = payload.get("sslVerify")
        if isinstance(sv, bool):
            icp.set_param("myflow_base.workflow_ai_ssl_verify", "1" if sv else "0")
        write_str("myflow_base.workflow_ai_ssl_ca_bundle", 1024, payload.get("sslCaBundle"))

        for payload_key, param_key in (
            ("openaiApiKey", "myflow_base.workflow_ai_openai_api_key"),
            ("anthropicApiKey", "myflow_base.workflow_ai_anthropic_api_key"),
            ("openclawToken", "myflow_base.workflow_ai_openclaw_token"),
        ):
            v = payload.get(payload_key)
            if isinstance(v, str) and v.strip():
                icp.set_param(param_key, v.strip()[:512])

        return {"ok": True}

    @http.route(
        ["/myflow_base/api/odoo_views/catalog", "/cr_product_configurations/api/odoo_views/catalog"],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_odoo_views_catalog(self, **kwargs):
        """
        Return a catalog of primary Odoo views for workflow component options.
        """
        payload = _json_route_payload(kwargs)
        View = request.env["ir.ui.view"].sudo()

        requested_types = payload.get("types")
        if isinstance(requested_types, list) and requested_types:
            normalized_types = [
                _normalize_view_type(t) for t in requested_types if isinstance(t, str)
            ]
            view_types = [t for t in normalized_types if t in ALLOWED_STANDARD_VIEW_TYPES]
            if not view_types:
                view_types = list(ALLOWED_STANDARD_VIEW_TYPES)
        else:
            view_types = list(ALLOWED_STANDARD_VIEW_TYPES)

        model_filter = payload.get("model")
        text_filter = payload.get("search")
        limit = _sanitize_limit(payload.get("limit"), default=250)
        offset = _sanitize_offset(payload.get("offset"))

        domain = [("active", "=", True), ("type", "in", view_types), ("model", "!=", False)]
        if "mode" in View._fields:
            domain.append(("mode", "=", "primary"))
        if isinstance(model_filter, str) and model_filter.strip():
            domain.append(("model", "ilike", model_filter.strip()))
        if isinstance(text_filter, str) and text_filter.strip():
            text = text_filter.strip()
            domain.extend(["|", ("name", "ilike", text), ("model", "ilike", text)])

        views = View.search(domain, order="model, type, priority, id", limit=limit, offset=offset)
        items = []
        for view in views:
            items.append(
                {
                    "id": view.id,
                    "name": view.name or "",
                    "model": view.model or "",
                    "type": view.type or "",
                    "priority": getattr(view, "priority", 16) or 16,
                    "key": "odoo-view-%s" % view.id,
                    "label": "%s / %s (%s)" % (view.model or "unknown.model", view.name or "Unnamed", view.type or "view"),
                }
            )
        return {"ok": True, "items": items}

    @http.route(
        ["/myflow_base/api/odoo_views/resolve", "/cr_product_configurations/api/odoo_views/resolve"],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_odoo_view_resolve(self, **kwargs):
        """
        Resolve a final (post-inheritance) architecture using Odoo model view APIs.
        """
        payload = _json_route_payload(kwargs)
        raw_view_id = payload.get("view_id")
        try:
            view_id = int(raw_view_id)
        except (TypeError, ValueError):
            return {"ok": False, "error": "view_id is required"}

        view = request.env["ir.ui.view"].sudo().browse(view_id)
        if not view.exists():
            return {"ok": False, "error": "View not found"}
        if not view.model:
            return {"ok": False, "error": "View model is missing"}
        if view.model not in request.env:
            return {"ok": False, "error": "Model %s not found" % view.model}

        view_type = _normalize_view_type(view.type)
        if view_type not in ALLOWED_STANDARD_VIEW_TYPES:
            return {"ok": False, "error": "Unsupported view type: %s" % (view.type or "")}

        model = request.env[view.model].sudo()
        try:
            if hasattr(model, "fields_view_get"):
                resolved = model.fields_view_get(view_id=view.id, view_type=view_type, toolbar=False, submenu=False)
            else:
                resolved = model.get_view(view_id=view.id, view_type=view_type)
        except Exception as err:
            return {"ok": False, "error": str(err)}

        fields_map = resolved.get("fields") or {}
        fields = []
        for name, spec in fields_map.items():
            if not isinstance(spec, dict):
                continue
            fields.append(
                {
                    "name": name,
                    "string": spec.get("string") or name,
                    "type": spec.get("type") or "",
                    "relation": spec.get("relation") or None,
                    "required": bool(spec.get("required", False)),
                    "readonly": bool(spec.get("readonly", False)),
                }
            )

        return {
            "ok": True,
            "view": {
                "id": view.id,
                "name": view.name or "",
                "model": view.model or "",
                "type": view.type or "",
                "key": "odoo-view-%s" % view.id,
            },
            "arch": resolved.get("arch") or "",
            "fields": fields,
        }

    @http.route(
        ["/myflow_base/api/odoo_menus/catalog", "/cr_product_configurations/api/odoo_menus/catalog"],
        type="json",
        auth="user",
        methods=["POST"],
        csrf=False,
    )
    def api_odoo_menu_catalog(self, **kwargs):
        """
        Return visible menu entries (for current user) as workflow-addable components.
        """
        payload = _json_route_payload(kwargs)
        limit = _sanitize_limit(payload.get("limit"), default=500, maximum=5000)
        offset = _sanitize_offset(payload.get("offset"))
        text_filter = (payload.get("search") or "").strip() if isinstance(payload.get("search"), str) else ""
        model_filter = (payload.get("model") or "").strip() if isinstance(payload.get("model"), str) else ""

        Menu = request.env["ir.ui.menu"]
        menus = Menu.search([("action", "!=", False)])
        if hasattr(Menu, "_filter_visible_menus"):
            try:
                menus = Menu._filter_visible_menus(menus)
            except Exception:
                # Fallback to raw search result if internals differ across Odoo versions.
                pass

        action_model_name = "ir.actions.act_window"
        if action_model_name not in request.env:
            return {"ok": True, "items": []}

        items = []
        for menu in menus.sorted(key=lambda m: (m.complete_name or m.name or "", m.id)):
            action = getattr(menu, "action", None)
            if not action:
                continue
            if action._name != action_model_name:
                continue

            res_model = action.res_model or ""
            if model_filter and model_filter.lower() not in res_model.lower():
                continue
            complete_name = menu.complete_name or menu.name or ""
            if text_filter:
                test_blob = " ".join([complete_name, menu.name or "", res_model, action.name or ""]).lower()
                if text_filter.lower() not in test_blob:
                    continue

            view_types = _action_view_types(action)
            primary_view_id = _action_primary_view_id(action)
            root = complete_name.split("/")[0].strip() if complete_name else (menu.name or "Menus")
            items.append(
                {
                    "id": menu.id,
                    "name": menu.name or "",
                    "complete_name": complete_name,
                    "root": root,
                    "key": "odoo-menu-%s" % menu.id,
                    "action_id": action.id,
                    "action_name": action.name or "",
                    "action_type": action._name,
                    "res_model": res_model,
                    "view_types": view_types,
                    "primary_view_id": primary_view_id,
                    "web_url": "/web#menu_id=%s&action=%s" % (menu.id, action.id),
                }
            )

        items = items[offset : offset + limit]
        return {"ok": True, "items": items}

