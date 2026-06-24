/**
 * pet-tooltip.ts — persistent session panel anchored to the pet.
 *
 * (Was a hover tooltip that followed the pet each frame.) Now pinned at a FIXED
 * anchor above the (stationary) pet — recomputed only on mount + window resize,
 * never per-frame — and shown ONLY while there's an active session
 * (working/waiting), hidden otherwise. Read-only + pointer-events:none so it
 * never blocks clicks / click-through.
 *
 * Style split: the panel SHELL (white bg, fixed 400px, radius/shadow/font) is set
 * inline on the element; everything inline can't express — the down-caret
 * (`::after`) and the per-row `.cpt-*` classes (state colours, fonts) — lives in a
 * single SCOPED stylesheet injected once into <head>. We deliberately do NOT
 * import design-tokens.css: its global `body{background}` + `*{}` reset would
 * break the transparent overlay window. Only `#pet-tooltip` / `.cpt-*` are scoped.
 *
 * Content is built by the pure renderTooltipHtml() helper; data is pushed in by
 * agent-bridge via update() (sessions + current theme).
 *
 * Usage:
 *   const panel = mountTooltip(canvas, () => handle.getPosition());
 *   panel.update({ sessions, theme });
 *   panel.destroy(); // on unmount
 */

import { renderTooltipHtml, hasActiveSessions, type TooltipData } from "./tooltip-render.js";

export type { TooltipData };

/** Public handle returned by mountTooltip(). */
export interface TooltipHandle {
  /** Update panel data (called by agent-bridge on every aggregate / theme change). */
  update(data: TooltipData): void;
  /** Remove DOM element, the refresh timer, and the resize listener. */
  destroy(): void;
}

/** Gap between the panel and the pet sprite (px). */
const GAP = 8;

/** Fixed panel width (px) — "gấp đôi" the old 200px max. */
const PANEL_WIDTH = 400;

/** id of the single injected stylesheet (dedupe guard across remounts). */
const STYLE_ID = "cpt-tooltip-style";

/**
 * Scoped panel stylesheet. `@import` MUST be first (CSS spec) or the fonts are
 * ignored. Contains ONLY `#pet-tooltip` caret + `.cpt-*` rules — never `html`,
 * `body`, or `*` (those would leak into the transparent overlay window).
 */
const PANEL_CSS = `@import url('https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&family=Nunito:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
#pet-tooltip::after{content:"";position:absolute;left:50%;bottom:-8px;transform:translateX(-50%) rotate(45deg);width:16px;height:16px;background:#ffffff;border-right:1px solid rgba(15,23,42,0.08);border-bottom:1px solid rgba(15,23,42,0.08);}
.cpt-empty{padding:10px 14px;color:#64748b;}
.cpt-row{padding:12px 14px;}
.cpt-row + .cpt-row{border-top:1px solid rgba(15,23,42,0.08);}
.cpt-head{display:flex;align-items:center;gap:8px;}
.cpt-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;}
.cpt-dot--working{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.18);}
.cpt-dot--waiting{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,0.18);}
.cpt-dot--done{background:#22c55e;}
.cpt-dot--idle{background:#94a3b8;}
.cpt-dot--error{background:#ef4444;}
.cpt-badge{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:#fff;border-radius:5px;padding:1px 6px;flex:0 0 auto;background:#94a3b8;}
.cpt-row--working .cpt-badge{background:#3b82f6;}
.cpt-row--waiting .cpt-badge{background:#f59e0b;}
.cpt-row--done .cpt-badge{background:#22c55e;}
.cpt-row--error .cpt-badge{background:#ef4444;}
.cpt-name{font-family:'JetBrains Mono',ui-monospace,monospace;font-weight:500;font-size:13.5px;color:#1e1e2e;flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cpt-timer{font-family:'Pixelify Sans',ui-monospace,monospace;font-size:13px;color:#64748b;flex:0 0 auto;font-variant-numeric:tabular-nums;}
.cpt-state{margin-top:7px;font-size:12.5px;font-weight:700;}
.cpt-state--working{color:#3b82f6;}
.cpt-state--waiting{color:#f59e0b;}
.cpt-state--done{color:#22c55e;}
.cpt-state--idle{color:#94a3b8;}
.cpt-state--error{color:#ef4444;}
.cpt-cmd{margin-top:5px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11.5px;color:#1e1e2e;line-height:1.5;overflow-wrap:anywhere;}
.cpt-cmd--ask{font-family:'Nunito',system-ui,sans-serif;font-size:12.5px;color:#1e1e2e;}
.cpt-tool{color:#3b82f6;font-weight:500;}
.cpt-meta{margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:#64748b;font-variant-numeric:tabular-nums;}
.cpt-model{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;background:rgba(30,30,46,0.06);border-radius:5px;padding:2px 6px;}
.cpt-tok-in{color:#22c55e;font-weight:700;}
.cpt-tok-out{color:#3b82f6;font-weight:700;}
.cpt-more{padding:6px 14px;font-size:11px;color:#94a3b8;}`;

/** Inject the scoped stylesheet once (shared by every panel instance). */
function injectStyleOnce(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
}

/**
 * Mount the persistent session panel for the pet canvas.
 *
 * @param canvas - #pet-canvas element
 * @param getPosition - returns the pet's current logical position {x, y}
 */
export function mountTooltip(
  canvas: HTMLCanvasElement,
  getPosition: () => { x: number; y: number },
): TooltipHandle {
  injectStyleOnce();

  const el = document.createElement("div");
  el.id = "pet-tooltip";
  applyBaseStyles(el);

  // Sibling of canvas — avoids DPR transform inheritance.
  const parent = canvas.parentElement ?? document.body;
  parent.appendChild(el);

  let _current: TooltipData = { sessions: [], theme: "kitchen" };
  let _tick = 0;

  const nowS = (): number => Math.floor(Date.now() / 1000);

  function paint(): void {
    el.innerHTML = renderTooltipHtml(_current, nowS());
  }

  /**
   * Ghim panel ở vị trí CỐ ĐỊNH phía trên pet, clamp trong cửa sổ.
   * Pet đứng yên nên getPosition() là hằng → chỉ cần tính lúc mount + on resize,
   * KHÔNG chạy mỗi frame (đây là nguyên nhân panel cũ nhảy theo pet).
   */
  function positionPanel(): void {
    const rect = canvas.getBoundingClientRect();
    const pos = getPosition();
    const w = el.offsetWidth || PANEL_WIDTH;
    const h = el.offsetHeight || 48;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Neo phía trên pet; clamp top ≥ 0 (cửa sổ thấp → ngồi sát mép trên thay vì lật xuống).
    const left = Math.min(Math.max(0, rect.left + pos.x), Math.max(0, vw - w));
    const top = Math.min(Math.max(0, rect.top + pos.y - h - GAP), Math.max(0, vh - h));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  /** Hiện panel chỉ khi có session working/waiting; ẩn hẳn nếu không. */
  function applyVisibility(): void {
    const show = hasActiveSessions(_current.sessions);
    el.style.display = show ? "block" : "none";
    if (show) {
      paint();
      positionPanel();
    }
  }

  // Pet đứng yên → không follow mỗi frame. Chỉ tính lại anchor khi cửa sổ resize.
  const onResize = (): void => {
    if (el.style.display !== "none") positionPanel();
  };
  window.addEventListener("resize", onResize);

  // Ẩn cho tới khi có session active; refresh duration mỗi giây khi đang hiện.
  applyVisibility();
  _tick = window.setInterval(() => {
    if (el.style.display !== "none") paint();
  }, 1000);

  return {
    update(data: TooltipData): void {
      _current = data;
      applyVisibility();
    },

    destroy(): void {
      if (_tick) {
        clearInterval(_tick);
        _tick = 0;
      }
      window.removeEventListener("resize", onResize);
      el.remove();
    },
  };
}

/**
 * Inline panel SHELL — kept inline (not in the stylesheet) so positionPanel reads
 * a reliable width and unit tests can assert via `el.style.*`. Visual extras
 * (caret, row colours, fonts) come from the scoped #pet-tooltip / .cpt-* sheet.
 */
function applyBaseStyles(el: HTMLDivElement): void {
  Object.assign(el.style, {
    position: "fixed",
    zIndex: "9999",
    pointerEvents: "none",
    width: `${PANEL_WIDTH}px`,
    background: "#ffffff",
    color: "#1e1e2e",
    borderRadius: "12px",
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
    fontFamily: "'Nunito', system-ui, sans-serif",
    fontSize: "12px",
  });
}
