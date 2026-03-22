import React, { useCallback, useEffect, useRef, useState } from "react";
import { ACCENT_PRESET_HEX, SECONDARY_PRESET_HEX, useWorkflowAccent } from "./WorkflowAccentContext";
import {
  loadWorkflowAiSettings,
  saveWorkflowAiSettings,
  type WorkflowAiProviderId,
} from "./workflowService";

function hexForColorInput(hex: string, fallback: string): string {
  const h = hex.trim();
  if (h.length === 7 && h.startsWith("#")) return h;
  if (h.length === 4 && h.startsWith("#")) {
    const [, r, g, b] = h;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

type SettingsTab = "appearance" | "workflowAi";

const WorkflowAccentSettings: React.FC = () => {
  const {
    effectiveHex,
    effectiveSecondaryHex,
    companyName,
    companyHex,
    companySecondaryHex,
    hasUserThemeOverride,
    setAccentHex,
    setSecondaryAccentHex,
    resetToCompanyTheme,
  } = useWorkflowAccent();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<SettingsTab>("appearance");
  const [aiAllowed, setAiAllowed] = useState(false);
  const [aiLoadState, setAiLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState<WorkflowAiProviderId>("openai_compatible");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [anthropicModel, setAnthropicModel] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [openclawBaseUrl, setOpenclawBaseUrl] = useState("");
  const [openclawAgentId, setOpenclawAgentId] = useState("");
  const [openclawModel, setOpenclawModel] = useState("");
  const [openclawToken, setOpenclawToken] = useState("");
  const [hasOpenclawToken, setHasOpenclawToken] = useState(false);
  const [sslVerify, setSslVerify] = useState(true);
  const [sslCaBundle, setSslCaBundle] = useState("");

  const loadAi = useCallback(async () => {
    setAiLoadState("loading");
    setAiMessage(null);
    try {
      const data = await loadWorkflowAiSettings();
      if (!data.ok) {
        setAiAllowed(false);
        setAiLoadState("error");
        setAiMessage(data.error || "Could not load AI settings.");
        return;
      }
      if (!data.allowed) {
        setAiAllowed(false);
        setAiLoadState("ready");
        return;
      }
      setAiAllowed(true);
      setAiProvider(data.provider ?? "openai_compatible");
      setOpenaiBaseUrl(data.openaiBaseUrl ?? "");
      setOpenaiModel(data.openaiModel ?? "");
      setHasOpenaiKey(Boolean(data.hasOpenaiKey));
      setAnthropicModel(data.anthropicModel ?? "");
      setHasAnthropicKey(Boolean(data.hasAnthropicKey));
      setOpenclawBaseUrl(data.openclawBaseUrl ?? "");
      setOpenclawAgentId(data.openclawAgentId ?? "");
      setOpenclawModel(data.openclawModel ?? "");
      setHasOpenclawToken(Boolean(data.hasOpenclawToken));
      setSslVerify(data.sslVerify !== false);
      setSslCaBundle(data.sslCaBundle ?? "");
      setOpenaiApiKey("");
      setAnthropicApiKey("");
      setOpenclawToken("");
      setAiLoadState("ready");
    } catch (e) {
      setAiAllowed(false);
      setAiLoadState("error");
      setAiMessage(e instanceof Error ? e.message : "Could not load AI settings.");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (aiLoadState === "idle") void loadAi();
  }, [open, aiLoadState, loadAi]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTab("appearance");
      setAiLoadState("idle");
      setAiMessage(null);
    }
  }, [open]);

  const onSaveAi = async () => {
    setAiSaving(true);
    setAiMessage(null);
    try {
      const res = await saveWorkflowAiSettings({
        provider: aiProvider,
        openaiBaseUrl,
        openaiModel,
        openaiApiKey: openaiApiKey.trim() || undefined,
        anthropicModel,
        anthropicApiKey: anthropicApiKey.trim() || undefined,
        openclawBaseUrl,
        openclawAgentId,
        openclawModel,
        openclawToken: openclawToken.trim() || undefined,
        sslVerify,
        sslCaBundle,
      });
      if (!res.ok) {
        setAiMessage(res.error || "Save failed.");
        return;
      }
      await loadAi();
      setAiMessage("Saved.");
    } catch (e) {
      setAiMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setAiSaving(false);
    }
  };

  return (
    <div className="workflow-accent-settings" ref={rootRef}>
      <button
        type="button"
        className="workflow-accent-settings-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Settings"
        onClick={() => setOpen((v) => !v)}
      >
        Settings
      </button>
      {open ? (
        <div className="workflow-accent-settings-panel" role="dialog" aria-label="Workflow settings">
          {aiAllowed ? (
            <div className="workflow-settings-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "appearance"}
                className={`workflow-settings-tab${tab === "appearance" ? " workflow-settings-tab--active" : ""}`}
                onClick={() => setTab("appearance")}
              >
                Appearance
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "workflowAi"}
                className={`workflow-settings-tab${tab === "workflowAi" ? " workflow-settings-tab--active" : ""}`}
                onClick={() => setTab("workflowAi")}
              >
                Workflow AI
              </button>
            </div>
          ) : (
            <div className="workflow-accent-settings-title">Appearance</div>
          )}

          {tab === "appearance" && (
            <>
              {!aiAllowed && <div className="workflow-accent-settings-title workflow-accent-settings-title--solo">Appearance</div>}
              {companyName ? (
                <p className="workflow-accent-settings-hint">
                  Defaults follow <strong>{companyName}</strong>
                  <br />
                  <span className="workflow-accent-settings-hint-meta">
                    Primary {companyHex} · Secondary {companySecondaryHex}
                  </span>
                </p>
              ) : null}

              <div className="workflow-accent-settings-section">
                <div className="workflow-accent-settings-label">Primary (accent)</div>
                <div className="workflow-accent-settings-palette">
                  {ACCENT_PRESET_HEX.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`workflow-accent-swatch${effectiveHex.toLowerCase() === h.toLowerCase() ? " workflow-accent-swatch--active" : ""}`}
                      style={{ backgroundColor: h }}
                      title={h}
                      aria-label={`Primary accent ${h}`}
                      onClick={() => setAccentHex(h)}
                    />
                  ))}
                </div>
                <label className="workflow-accent-settings-picker-wrap">
                  <span className="workflow-accent-settings-label-sub">Custom primary</span>
                  <input
                    type="color"
                    className="workflow-accent-color-input"
                    value={hexForColorInput(effectiveHex, "#f16300")}
                    onChange={(e) => setAccentHex(e.target.value)}
                    aria-label="Pick custom primary color"
                  />
                </label>
              </div>

              <div className="workflow-accent-settings-section workflow-accent-settings-section--secondary">
                <div className="workflow-accent-settings-label">Secondary (muted)</div>
                <div className="workflow-accent-settings-palette">
                  {SECONDARY_PRESET_HEX.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={`workflow-accent-swatch${effectiveSecondaryHex.toLowerCase() === h.toLowerCase() ? " workflow-accent-swatch--active" : ""}`}
                      style={{ backgroundColor: h }}
                      title={h}
                      aria-label={`Secondary color ${h}`}
                      onClick={() => setSecondaryAccentHex(h)}
                    />
                  ))}
                </div>
                <label className="workflow-accent-settings-picker-wrap">
                  <span className="workflow-accent-settings-label-sub">Custom secondary</span>
                  <input
                    type="color"
                    className="workflow-accent-color-input"
                    value={hexForColorInput(effectiveSecondaryHex, "#7b96a1")}
                    onChange={(e) => setSecondaryAccentHex(e.target.value)}
                    aria-label="Pick custom secondary color"
                  />
                </label>
              </div>

              <button
                type="button"
                className="workflow-accent-settings-reset"
                onClick={() => {
                  resetToCompanyTheme();
                  setOpen(false);
                }}
                disabled={!hasUserThemeOverride}
              >
                Use company colors
              </button>
            </>
          )}

          {tab === "workflowAi" && aiAllowed && (
            <div className="workflow-ai-settings">
              <p className="workflow-ai-settings-intro">
                Stored in Odoo (<code>ir.config_parameter</code>). Keys are never shown after save; leave a key field
                empty to keep the current value. Environment variables still override when set on the server.
              </p>
              {aiLoadState === "loading" && <p className="workflow-ai-settings-status">Loading…</p>}
              {aiLoadState === "error" && aiMessage && (
                <p className="workflow-ai-settings-status workflow-ai-settings-status--error">{aiMessage}</p>
              )}
              {aiLoadState === "ready" && (
                <>
                  <label className="workflow-ai-settings-field">
                    <span className="workflow-ai-settings-label">Default provider</span>
                    <select
                      className="workflow-ai-settings-input"
                      value={aiProvider}
                      onChange={(e) => setAiProvider(e.target.value as WorkflowAiProviderId)}
                    >
                      <option value="openai_compatible">OpenAI-compatible</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="openclaw">OpenClaw gateway</option>
                    </select>
                  </label>

                  <div className="workflow-ai-settings-group">
                    <div className="workflow-ai-settings-group-title">OpenAI-compatible</div>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">Base URL</span>
                      <input
                        className="workflow-ai-settings-input"
                        value={openaiBaseUrl}
                        onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                        placeholder="https://api.openai.com/v1"
                        autoComplete="off"
                      />
                    </label>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">Model</span>
                      <input
                        className="workflow-ai-settings-input"
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        placeholder="gpt-4o-mini"
                        autoComplete="off"
                      />
                    </label>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">
                        API key {hasOpenaiKey ? <em className="workflow-ai-settings-hint-inline">(set)</em> : null}
                      </span>
                      <input
                        className="workflow-ai-settings-input"
                        type="password"
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        placeholder="Leave blank to keep"
                        autoComplete="new-password"
                      />
                    </label>
                  </div>

                  <div className="workflow-ai-settings-group">
                    <div className="workflow-ai-settings-group-title">Anthropic</div>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">Model</span>
                      <input
                        className="workflow-ai-settings-input"
                        value={anthropicModel}
                        onChange={(e) => setAnthropicModel(e.target.value)}
                        placeholder="claude-…"
                        autoComplete="off"
                      />
                    </label>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">
                        API key {hasAnthropicKey ? <em className="workflow-ai-settings-hint-inline">(set)</em> : null}
                      </span>
                      <input
                        className="workflow-ai-settings-input"
                        type="password"
                        value={anthropicApiKey}
                        onChange={(e) => setAnthropicApiKey(e.target.value)}
                        placeholder="Leave blank to keep"
                        autoComplete="new-password"
                      />
                    </label>
                  </div>

                  <div className="workflow-ai-settings-group">
                    <div className="workflow-ai-settings-group-title">OpenClaw</div>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">Gateway base URL</span>
                      <input
                        className="workflow-ai-settings-input"
                        value={openclawBaseUrl}
                        onChange={(e) => setOpenclawBaseUrl(e.target.value)}
                        placeholder="http://127.0.0.1:18789/v1"
                        autoComplete="off"
                      />
                    </label>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">Agent id</span>
                      <input
                        className="workflow-ai-settings-input"
                        value={openclawAgentId}
                        onChange={(e) => setOpenclawAgentId(e.target.value)}
                        placeholder="main"
                        autoComplete="off"
                      />
                    </label>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">Model id</span>
                      <input
                        className="workflow-ai-settings-input"
                        value={openclawModel}
                        onChange={(e) => setOpenclawModel(e.target.value)}
                        placeholder="openclaw:main"
                        autoComplete="off"
                      />
                    </label>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">
                        Gateway token {hasOpenclawToken ? <em className="workflow-ai-settings-hint-inline">(set)</em> : null}
                      </span>
                      <input
                        className="workflow-ai-settings-input"
                        type="password"
                        value={openclawToken}
                        onChange={(e) => setOpenclawToken(e.target.value)}
                        placeholder="Leave blank to keep"
                        autoComplete="new-password"
                      />
                    </label>
                  </div>

                  <div className="workflow-ai-settings-group">
                    <div className="workflow-ai-settings-group-title">HTTPS to LLM</div>
                    <label className="workflow-ai-settings-field workflow-ai-settings-field--row">
                      <input
                        type="checkbox"
                        checked={sslVerify}
                        onChange={(e) => setSslVerify(e.target.checked)}
                      />
                      <span className="workflow-ai-settings-label workflow-ai-settings-label--inline">
                        Verify TLS certificates (recommended)
                      </span>
                    </label>
                    <p className="workflow-ai-settings-warn">
                      If you see SSL errors (e.g. self-signed chain), turn this off for testing or set a custom CA
                      bundle path on the Odoo server. Disabling verification is insecure on untrusted networks.
                    </p>
                    <label className="workflow-ai-settings-field">
                      <span className="workflow-ai-settings-label">Custom CA bundle (PEM path on server)</span>
                      <input
                        className="workflow-ai-settings-input"
                        value={sslCaBundle}
                        onChange={(e) => setSslCaBundle(e.target.value)}
                        placeholder="/path/to/ca-bundle.pem"
                        autoComplete="off"
                      />
                    </label>
                  </div>

                  {aiMessage && aiLoadState === "ready" && !aiMessage.startsWith("Could not") && (
                    <p className="workflow-ai-settings-status workflow-ai-settings-status--ok">{aiMessage}</p>
                  )}

                  <button
                    type="button"
                    className="workflow-ai-settings-save"
                    disabled={aiSaving}
                    onClick={() => void onSaveAi()}
                  >
                    {aiSaving ? "Saving…" : "Save AI settings"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default WorkflowAccentSettings;
