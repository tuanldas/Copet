/**
 * pet-tooltip.ts — persistent session panel anchored to the pet.
 *
 * (Was a hover tooltip.) Now ALWAYS visible by default: renders the running
 * sessions list right next to the pet and follows the pet's position each frame.
 * Read-only + pointer-events:none so it never blocks clicks / click-through.
 * Content is built by the pure renderTooltipHtml() helper; data is pushed in by
 * agent-bridge via update() (sessions + current theme).
 *
 * Usage:
 *   const panel = mountTooltip(canvas, () => handle.getPosition());
 *   panel.update({ sessions, theme });
 *   panel.destroy(); // on unmount
 */

import { renderTooltipHtml, type TooltipData } from "./tooltip-render.js";

export type { TooltipData };

/** Public handle returned by mountTooltip(). */
export interface TooltipHandle {
  /** Update panel data (called by agent-bridge on every aggregate / theme change). */
  update(data: TooltipData): void;
  /** Remove DOM element, the refresh timer, and the position loop. */
  destroy(): void;
}

/** Logical pet height (must match pet/index.ts PET_DISPLAY_HEIGHT) — for flip-below. */
const PET_H = 104;
/** Gap between the panel and the pet sprite (px). */
const GAP = 8;

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
  const el = document.createElement("div");
  el.id = "pet-tooltip";
  applyBaseStyles(el);

  // Sibling of canvas — avoids DPR transform inheritance.
  const parent = canvas.parentElement ?? document.body;
  parent.appendChild(el);

  let _current: TooltipData = { sessions: [], theme: "kitchen" };
  let _tick = 0;
  let _raf = 0;

  const nowS = (): number => Math.floor(Date.now() / 1000);

  function paint(): void {
    el.innerHTML = renderTooltipHtml(_current, nowS());
  }

  /** Anchor the panel above the pet (flip below near the top), clamped to the window. */
  function reposition(): void {
    const rect = canvas.getBoundingClientRect();
    const pos = getPosition();
    const w = el.offsetWidth || 200;
    const h = el.offsetHeight || 48;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left + pos.x;
    let top = rect.top + pos.y - h - GAP;
    if (top < 0) top = rect.top + pos.y + PET_H + GAP; // flip below the pet

    left = Math.min(Math.max(0, left), Math.max(0, vw - w));
    top = Math.min(Math.max(0, top), Math.max(0, vh - h));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function frame(): void {
    reposition();
    _raf = requestAnimationFrame(frame);
  }

  // Persistent: paint once, follow the pet each frame, refresh durations every second.
  paint();
  _raf = requestAnimationFrame(frame);
  _tick = window.setInterval(paint, 1000);

  return {
    update(data: TooltipData): void {
      _current = data;
      paint();
      reposition();
    },

    destroy(): void {
      if (_tick) {
        clearInterval(_tick);
        _tick = 0;
      }
      if (_raf) {
        cancelAnimationFrame(_raf);
        _raf = 0;
      }
      el.remove();
    },
  };
}

function applyBaseStyles(el: HTMLDivElement): void {
  Object.assign(el.style, {
    position: "fixed",
    zIndex: "9999",
    background: "rgba(15,23,42,0.92)",
    color: "#f1f5f9",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "12px",
    lineHeight: "1.5",
    pointerEvents: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
    fontFamily: "system-ui, sans-serif",
    maxWidth: "200px",
  });
}
