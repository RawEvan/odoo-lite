import React, { useCallback, useEffect, useRef } from "react";
import type { OdooMenuCatalogItem } from "./odooViewService";

/**
 * Build `/web#...` client URLs for menu-linked act_window actions.
 * Replaces or appends `view_type` so the Odoo web client opens the chosen mode.
 */
export function menuActionUrlWithViewType(webUrl: string, viewType: string): string {
  if (!viewType || !webUrl) return webUrl;
  const hashIdx = webUrl.indexOf("#");
  if (hashIdx < 0) {
    return `${webUrl}#view_type=${encodeURIComponent(viewType)}`;
  }
  const prefix = webUrl.slice(0, hashIdx + 1);
  const fragment = webUrl.slice(hashIdx + 1);
  const parts = fragment
    .split("&")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !p.startsWith("view_type="));
  parts.push(`view_type=${encodeURIComponent(viewType)}`);
  return `${prefix}${parts.join("&")}`;
}

/** Resolve the hash URL for embedding, using a view type allowed by the action (or the action default). */
export function resolveMenuLinkedClientUrl(item: OdooMenuCatalogItem, viewType: string): string {
  const types = Array.isArray(item.view_types) ? item.view_types : [];
  const vt =
    viewType && types.includes(viewType) ? viewType : types[0] || "";
  if (!vt) return item.web_url;
  return menuActionUrlWithViewType(item.web_url, vt);
}

/** Injected into same-origin `/web` iframes to drop global shell (matches Odoo + Spiffy themes in this repo). */
export const EMBED_HIDE_ODOO_CHROME_STYLE_ID = "cr-workflow-embed-hide-odoo-chrome";

/**
 * Selectors derived from:
 * - `o_main_navbar`, `o_menu_systray` (standard web client)
 * - `web.neutralize_banner` → `#oe_neutralize_banner`; Spiffy adds `.oe_neutralize_banner_active` on its parent
 * - Spiffy SCSS uses `header + .o_action_manager` / `.oe_neutralize_banner_active + header`
 */
const EMBED_HIDE_ODOO_CHROME_CSS = `
.o_web_client .oe_neutralize_banner_active {
  display: none !important;
}

.o_web_client > header,
.o_web_client > nav.o_main_navbar,
.o_web_client > .o_main_navbar,
.o_web_client header.o_main_navbar {
  display: none !important;
}

.o_web_client {
  display: flex !important;
  flex-direction: column !important;
  height: 100vh !important;
  max-height: 100vh !important;
}

.o_web_client .o_action_manager {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  margin-top: 0 !important;
  padding-top: 0 !important;
}
`;

/** Hide the neutralize-testing banner row (`#oe_neutralize_banner` sits inside a wrapper div). */
function hideNeutralizeBannerRow(doc: Document): void {
  const mark = doc.getElementById("oe_neutralize_banner");
  const row = mark?.parentElement;
  if (row?.isConnected) {
    row.style.setProperty("display", "none", "important");
  }
}

function appendHideChromeStyle(doc: Document): void {
  if (doc.getElementById(EMBED_HIDE_ODOO_CHROME_STYLE_ID)) return;
  const el = doc.createElement("style");
  el.id = EMBED_HIDE_ODOO_CHROME_STYLE_ID;
  el.textContent = EMBED_HIDE_ODOO_CHROME_CSS;
  doc.head?.appendChild(el);
}

/**
 * Strip Odoo global chrome inside a same-origin `/web` iframe. No-op if cross-origin or `head` missing.
 * Retries hiding the neutralize banner because it sometimes mounts after the first load event.
 */
export function injectOdooEmbedChromeHide(iframe: HTMLIFrameElement | null): number[] {
  const timerIds: number[] = [];
  if (!iframe) return timerIds;
  let doc: Document | null = null;
  try {
    doc = iframe.contentDocument;
  } catch {
    return timerIds;
  }
  if (!doc?.head) return timerIds;

  appendHideChromeStyle(doc);
  hideNeutralizeBannerRow(doc);

  for (const ms of [400, 1200, 3000]) {
    timerIds.push(
      window.setTimeout(() => {
        try {
          const d = iframe.contentDocument;
          if (d) {
            appendHideChromeStyle(d);
            hideNeutralizeBannerRow(d);
          }
        } catch {
          /* ignore */
        }
      }, ms)
    );
  }
  return timerIds;
}

export interface MenuLinkedPageEmbedProps {
  item: OdooMenuCatalogItem;
  /** Odoo view mode: tree, form, kanban, … */
  viewType: string;
  /** Shown when the browser blocks same-origin iframe embedding of `/web` */
  openInNewTabLabel?: string;
}

/**
 * Renders the Odoo web client for a menu action inside an iframe.
 * Same-origin only: injects CSS to hide the main navbar, systray, and neutralize banner so only the action view shows.
 */
export const MenuLinkedPageEmbed: React.FC<MenuLinkedPageEmbedProps> = ({
  item,
  viewType,
  openInNewTabLabel = "Open in new tab",
}) => {
  const src = resolveMenuLinkedClientUrl(item, viewType);
  const title = `${item.complete_name || item.name || "Menu"} · ${viewType || "view"}`;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hideTimersRef = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const id of hideTimersRef.current) {
        window.clearTimeout(id);
      }
      hideTimersRef.current = [];
    };
  }, []);

  const onIframeLoad = useCallback(() => {
    for (const id of hideTimersRef.current) {
      window.clearTimeout(id);
    }
    hideTimersRef.current = injectOdooEmbedChromeHide(iframeRef.current);
  }, []);

  return (
    <div className="menu-linked-page-render">
      <div className="menu-linked-page-render-frame-wrap">
        <iframe
          ref={iframeRef}
          key={`${item.key}-${viewType}`}
          className="menu-linked-page-render-frame"
          title={title}
          src={src}
          onLoad={onIframeLoad}
        />
      </div>
      <a
        className="menu-linked-page-render-open"
        href={src}
        target="_blank"
        rel="noopener noreferrer"
      >
        {openInNewTabLabel}
      </a>
    </div>
  );
};
