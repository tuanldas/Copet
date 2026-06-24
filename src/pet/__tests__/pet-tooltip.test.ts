/**
 * pet-tooltip.test.ts — mountTooltip DOM behaviour (happy-dom): white 400px shell
 * inline, scoped stylesheet injected once, caret + cpt-* classes, no global rules,
 * visibility toggle, destroy cleanup. Geometry is NOT asserted (happy-dom no layout).
 */

import { describe, it, expect, afterEach } from "vitest";
import { mountTooltip } from "../pet-tooltip.js";
import type { SessionSnapshot } from "../../types/session-snapshot.js";
import type { AgentState } from "../../types/agent-event.js";

function snap(state: AgentState, extra: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return { sessionId: "s1", agent: "claude-code", project: "proj", state, tool: null, since: 1000, ts: 1000, ...extra };
}

function mountOn() {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const handle = mountTooltip(canvas, () => ({ x: 0, y: 0 }));
  return { canvas, handle };
}

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById("cpt-tooltip-style")?.remove();
});

describe("mountTooltip", () => {
  it("creates #pet-tooltip under the canvas parent", () => {
    const { handle } = mountOn();
    const el = document.getElementById("pet-tooltip");
    expect(el).not.toBeNull();
    expect(el?.parentElement).toBe(document.body);
    handle.destroy();
  });

  it("applies the white 400px shell inline (happy-dom reads inline styles)", () => {
    const { handle } = mountOn();
    const el = document.getElementById("pet-tooltip") as HTMLDivElement;
    expect(el.style.width).toBe("400px");
    expect(el.style.position).toBe("fixed");
    expect(el.style.pointerEvents).toBe("none");
    expect((el.getAttribute("style") || "").toLowerCase()).toContain("#ffffff");
    handle.destroy();
  });

  it("injects the scoped stylesheet exactly once across remounts", () => {
    const a = mountOn();
    const b = mountOn();
    expect(document.querySelectorAll("style#cpt-tooltip-style").length).toBe(1);
    a.handle.destroy();
    b.handle.destroy();
    const c = mountOn();
    expect(document.querySelectorAll("style#cpt-tooltip-style").length).toBe(1);
    c.handle.destroy();
  });

  it("scopes styles: caret + cpt-* classes, @import first, no global body/html/* rules", () => {
    const { handle } = mountOn();
    const css = document.getElementById("cpt-tooltip-style")?.textContent || "";
    expect(css.trimStart().startsWith("@import")).toBe(true);
    expect(css).toContain("#pet-tooltip::after");
    const compact = css.replace(/\s+/g, "");
    expect(compact).toContain(".cpt-dot--working");
    expect(compact).not.toContain("body{");
    expect(compact).not.toContain("html{");
    expect(compact).not.toContain("*{");
    handle.destroy();
  });

  it("shows the panel only when a session is active", () => {
    const { handle } = mountOn();
    const el = document.getElementById("pet-tooltip") as HTMLDivElement;
    handle.update({ sessions: [snap("working")], theme: "kitchen" });
    expect(el.style.display).toBe("block");
    expect(el.innerHTML).toContain("cpt-row");
    handle.update({ sessions: [], theme: "kitchen" });
    expect(el.style.display).toBe("none");
    handle.destroy();
  });

  it("destroy() removes the panel element", () => {
    const { handle } = mountOn();
    expect(document.getElementById("pet-tooltip")).not.toBeNull();
    handle.destroy();
    expect(document.getElementById("pet-tooltip")).toBeNull();
  });
});
