/**
 * pet-tooltip.ts — DOM overlay tooltip listing running sessions.
 *
 * Shows the session list on hover over the pet body and refreshes the duration
 * column every second while visible. Rendering is delegated to the pure
 * renderTooltipHtml() helper (unit-tested separately).
 *
 * Usage:
 *   const tooltip = mountTooltip(canvas, () => handle.getPosition());
 *   tooltip.update({ sessions, theme });
 *   tooltip.destroy(); // on unmount
 */

import { renderTooltipHtml, type TooltipData } from "./tooltip-render.js";

export type { TooltipData };

/** Public handle returned by mountTooltip(). */
export interface TooltipHandle {
  /** Update tooltip data (call on every aggregate re-compute / theme change). */
  update(data: TooltipData): void;
  /** Remove DOM elements, listeners, and the refresh timer. */
  destroy(): void;
}

/** Logical pet dimensions — must match pet/index.ts PET_DISPLAY_* constants. */
const PET_W = 96;
const PET_H = 104;

/**
 * Mount a tooltip DOM overlay for the pet canvas.
 *
 * @param canvas - #pet-canvas element
 * @param getPosition - returns current pet logical position {x, y}
 */
export function mountTooltip(
  canvas: HTMLCanvasElement,
  getPosition: () => { x: number; y: number },
): TooltipHandle {
  const el = document.createElement("div");
  el.id = "pet-tooltip";
  el.setAttribute("role", "tooltip");
  applyBaseStyles(el);
  el.style.display = "none";

  // Sibling of canvas — avoids DPR transform inheritance.
  const parent = canvas.parentElement ?? document.body;
  parent.appendChild(el);

  let _current: TooltipData = { sessions: [], theme: "kitchen" };
  let _lastXY: { x: number; y: number } | null = null;
  let _tick = 0;

  const nowS = (): number => Math.floor(Date.now() / 1000);

  function paint(): void {
    el.innerHTML = renderTooltipHtml(_current, nowS());
  }

  function startTick(): void {
    if (_tick) return;
    _tick = window.setInterval(paint, 1000);
  }

  function stopTick(): void {
    if (_tick) {
      clearInterval(_tick);
      _tick = 0;
    }
  }

  function show(cx: number, cy: number): void {
    paint();
    positionTooltip(el, cx, cy);
    el.style.display = "block";
    startTick();
  }

  function hide(): void {
    el.style.display = "none";
    stopTick();
  }

  const onEnter = (e: Event): void => {
    const me = e as MouseEvent;
    if (overPet(me)) {
      _lastXY = { x: me.clientX, y: me.clientY };
      show(me.clientX, me.clientY);
    }
  };

  const onMove = (e: Event): void => {
    if (el.style.display === "none") return;
    const me = e as MouseEvent;
    if (overPet(me)) {
      _lastXY = { x: me.clientX, y: me.clientY };
      positionTooltip(el, me.clientX, me.clientY);
    } else {
      hide();
    }
  };

  const onLeave = (): void => hide();

  function overPet(me: MouseEvent): boolean {
    const rect = canvas.getBoundingClientRect();
    const pos = getPosition();
    const lx = me.clientX - rect.left;
    const ly = me.clientY - rect.top;
    return lx >= pos.x && lx <= pos.x + PET_W && ly >= pos.y && ly <= pos.y + PET_H;
  }

  canvas.addEventListener("mouseenter", onEnter);
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("mouseleave", onLeave);

  return {
    update(data: TooltipData): void {
      _current = data;
      if (el.style.display !== "none") {
        paint();
        if (_lastXY) positionTooltip(el, _lastXY.x, _lastXY.y);
      }
    },

    destroy(): void {
      stopTick();
      canvas.removeEventListener("mouseenter", onEnter);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      el.remove();
    },
  };
}

// ── Pure positioning + styles ─────────────────────────────────────────────────

function positionTooltip(el: HTMLDivElement, cx: number, cy: number): void {
  const vw = window.innerWidth;
  const tooltipW = 220;
  const tooltipH = Math.max(40, el.offsetHeight || 60);
  const offset = 12;

  let left = cx + offset;
  let top = cy - tooltipH - offset;

  if (left + tooltipW > vw) left = cx - tooltipW - offset;
  if (top < 0) top = cy + offset;

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
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
    maxWidth: "260px",
  });
}
