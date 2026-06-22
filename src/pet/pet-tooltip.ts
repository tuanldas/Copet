/**
 * pet-tooltip.ts — DOM overlay tooltip for the pet canvas.
 *
 * Shows agent/state/project/sessionCount on mouseenter over the pet body.
 * Hides on mouseleave. No external deps — pure DOM.
 *
 * Usage:
 *   const tooltip = mountTooltip(canvas, () => handle.getPosition());
 *   tooltip.update({ agent, state, project, sessionCount });
 *   tooltip.destroy(); // on unmount
 */

import type { AgentId, AgentState } from "../types/agent-event.js";

/** Data shown in the tooltip overlay. */
export interface TooltipData {
  agent: AgentId | null;
  state: AgentState;
  project: string | null;
  sessionCount: number;
}

/** Public handle returned by mountTooltip(). */
export interface TooltipHandle {
  /** Update tooltip text (call on every aggregate re-compute). */
  update(data: TooltipData): void;
  /** Remove DOM elements and event listeners. */
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
  // ── Create tooltip element ─────────────────────────────────────────────────
  const el = document.createElement("div");
  el.id = "pet-tooltip";
  el.setAttribute("role", "tooltip");
  el.setAttribute("aria-live", "polite");
  applyBaseStyles(el);
  el.style.display = "none";

  // Sibling of canvas — avoids DPR transform inheritance
  const parent = canvas.parentElement ?? document.body;
  parent.appendChild(el);

  // ── Current data (mutable via handle.update) ───────────────────────────────
  let _current: TooltipData = {
    agent: null,
    state: "idle",
    project: null,
    sessionCount: 0,
  };

  // ── Inner show/hide (close over el and _current) ───────────────────────────
  function show(cx: number, cy: number): void {
    renderContent(el, _current);
    positionTooltip(el, cx, cy);
    el.style.display = "block";
  }

  function hide(): void {
    el.style.display = "none";
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  const onEnter = (e: Event): void => {
    const me = e as MouseEvent;
    if (overPet(me)) show(me.clientX, me.clientY);
  };

  const onMove = (e: Event): void => {
    if (el.style.display === "none") return;
    const me = e as MouseEvent;
    if (overPet(me)) {
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

  // ── Public handle ──────────────────────────────────────────────────────────
  return {
    update(data: TooltipData): void {
      _current = data;
      // Re-render in-place if tooltip is currently visible
      if (el.style.display !== "none") {
        renderContent(el, _current);
      }
    },

    destroy(): void {
      canvas.removeEventListener("mouseenter", onEnter);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      el.remove();
    },
  };
}

// ── Pure rendering helpers ────────────────────────────────────────────────────

function positionTooltip(el: HTMLDivElement, cx: number, cy: number): void {
  const vw = window.innerWidth;
  const tooltipW = 200;
  const tooltipH = 52;
  const offset = 12;

  let left = cx + offset;
  let top = cy - tooltipH - offset;

  if (left + tooltipW > vw) left = cx - tooltipW - offset;
  if (top < 0) top = cy + offset;

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function renderContent(el: HTMLDivElement, data: TooltipData): void {
  const agentLabel = data.agent ?? "agent";
  const projectPart = data.project ? ` · ${escHtml(data.project)}` : "";
  const stateLabel = `${stateSymbol(data.state)} ${escHtml(data.state)}`;
  const countPart = data.sessionCount > 1 ? ` (${data.sessionCount} sessions)` : "";

  el.innerHTML =
    `<div style="font-weight:600">${escHtml(agentLabel)}${projectPart}</div>` +
    `<div style="opacity:0.8">${stateLabel}${escHtml(countPart)}</div>`;
}

function stateSymbol(state: AgentState): string {
  const map: Record<AgentState, string> = {
    working: "⚙",
    waiting: "⏳",
    done: "✓",
    error: "✗",
    idle: "·",
  };
  return map[state] ?? "·";
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
    whiteSpace: "nowrap",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
    fontFamily: "system-ui, sans-serif",
    maxWidth: "240px",
  });
}
