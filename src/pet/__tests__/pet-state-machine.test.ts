/**
 * pet-state-machine.test.ts
 * Unit tests cho petStore (@xstate/store):
 * - Transitions cơ bản: FEED, AGENT_EVENT, DRAG_START/END, SLEEP/WAKE, TICK
 * - Priority: drag > sleep_forced > agent_state > mood
 * - Auto-revert: ANIM_DONE đưa transient state về base, reset agentState
 * - Không stuck: celebrate/error sau ANIM_DONE không trả lại celebrate/error
 */

import { describe, it, expect, beforeEach } from "vitest";
import { petStore, getPetContext, getPetState, TRANSIENT_STATES } from "../pet-state-machine.js";
import type { PetState } from "../pet-state-machine.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Reset store về initial state trước mỗi test */
function resetStore(): void {
  // Đưa về idle: xóa tất cả cờ
  petStore.send({ type: "WAKE" }); // bỏ sleepForced
  petStore.send({ type: "AGENT_EVENT", agentState: "idle" });
  // Nếu đang transient, trigger ANIM_DONE để về idle
  if (TRANSIENT_STATES.has(getPetState())) {
    petStore.send({ type: "ANIM_DONE" });
  }
  // Nếu đang drag, end drag
  if (getPetState() === "drag") {
    petStore.send({ type: "DRAG_END" });
  }
}

// ── TRANSIENT_STATES set ───────────────────────────────────────────────────

describe("TRANSIENT_STATES", () => {
  it("chứa đúng 4 states one-shot", () => {
    const expected: PetState[] = ["eat", "celebrate", "error", "evolve"];
    for (const s of expected) {
      expect(TRANSIENT_STATES.has(s)).toBe(true);
    }
  });

  it("KHÔNG chứa persistent states", () => {
    const persistent: PetState[] = ["idle", "walk", "drag", "sleep", "working"];
    for (const s of persistent) {
      expect(TRANSIENT_STATES.has(s)).toBe(false);
    }
  });
});

// ── Basic transitions ──────────────────────────────────────────────────────

describe("FEED event", () => {
  beforeEach(resetStore);

  it("idle → eat", () => {
    expect(getPetState()).toBe("idle");
    petStore.send({ type: "FEED" });
    expect(getPetState()).toBe("eat");
  });

  it("không interrupt drag", () => {
    petStore.send({ type: "DRAG_START" });
    expect(getPetState()).toBe("drag");
    petStore.send({ type: "FEED" });
    expect(getPetState()).toBe("drag");
  });

  it("không interrupt transient state đang chạy", () => {
    petStore.send({ type: "FEED" }); // vào eat
    expect(getPetState()).toBe("eat");
    petStore.send({ type: "FEED" }); // FEED lần 2 trong transient → bị ignore
    expect(getPetState()).toBe("eat");
  });
});

describe("AGENT_EVENT", () => {
  beforeEach(resetStore);

  it("working → state working", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    expect(getPetState()).toBe("working");
    expect(getPetContext().agentState).toBe("working");
  });

  it("done_success → celebrate (transient)", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "done_success" });
    expect(getPetState()).toBe("celebrate");
    expect(TRANSIENT_STATES.has("celebrate")).toBe(true);
  });

  it("done_error → error (transient)", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "done_error" });
    expect(getPetState()).toBe("error");
    expect(TRANSIENT_STATES.has("error")).toBe(true);
  });

  it("idle → khôi phục về prev idle/walk", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    expect(getPetState()).toBe("working");
    petStore.send({ type: "AGENT_EVENT", agentState: "idle" });
    // prev là "idle" (trạng thái trước khi working)
    expect(getPetState()).toBe("idle");
  });

  it("không đổi current khi đang drag (giữ drag, chỉ update agentState)", () => {
    petStore.send({ type: "DRAG_START" });
    expect(getPetState()).toBe("drag");
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    expect(getPetState()).toBe("drag"); // drag không bị interrupt
    expect(getPetContext().agentState).toBe("working"); // agentState vẫn được cập nhật
  });
});

describe("DRAG_START / DRAG_END", () => {
  beforeEach(resetStore);

  it("DRAG_START override idle → drag", () => {
    expect(getPetState()).toBe("idle");
    petStore.send({ type: "DRAG_START" });
    expect(getPetState()).toBe("drag");
  });

  it("DRAG_END khôi phục về idle sau drag", () => {
    petStore.send({ type: "DRAG_START" });
    petStore.send({ type: "DRAG_END" });
    expect(getPetState()).toBe("idle");
  });

  it("DRAG_START trong working → drag; DRAG_END → working", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    expect(getPetState()).toBe("working");
    petStore.send({ type: "DRAG_START" });
    expect(getPetState()).toBe("drag");
    petStore.send({ type: "DRAG_END" });
    // agentState = working → resolveBase trả working
    expect(getPetState()).toBe("working");
  });

  it("DRAG_START trong sleep_forced → drag; DRAG_END → sleep (sleepForced vẫn active)", () => {
    petStore.send({ type: "SLEEP", forced: true });
    expect(getPetContext().sleepForced).toBe(true);
    petStore.send({ type: "DRAG_START" });
    expect(getPetState()).toBe("drag");
    petStore.send({ type: "DRAG_END" });
    // sleepForced còn → về sleep
    expect(getPetState()).toBe("sleep");
  });
});

describe("SLEEP / WAKE", () => {
  beforeEach(resetStore);

  it("SLEEP chuyển về sleep", () => {
    petStore.send({ type: "SLEEP", forced: false });
    expect(getPetState()).toBe("sleep");
    expect(getPetContext().sleepForced).toBe(false);
  });

  it("SLEEP forced set sleepForced=true", () => {
    petStore.send({ type: "SLEEP", forced: true });
    expect(getPetContext().sleepForced).toBe(true);
  });

  it("WAKE sau sleep thường → idle", () => {
    petStore.send({ type: "SLEEP", forced: false });
    petStore.send({ type: "WAKE" });
    expect(getPetState()).toBe("idle");
    expect(getPetContext().sleepForced).toBe(false);
  });

  it("WAKE sau sleep forced → bỏ forced, về idle", () => {
    petStore.send({ type: "SLEEP", forced: true });
    expect(getPetContext().sleepForced).toBe(true);
    petStore.send({ type: "WAKE" });
    expect(getPetContext().sleepForced).toBe(false);
    expect(getPetState()).toBe("idle");
  });

  it("SLEEP không interrupt drag", () => {
    petStore.send({ type: "DRAG_START" });
    petStore.send({ type: "SLEEP", forced: false });
    expect(getPetState()).toBe("drag");
  });
});

describe("TICK", () => {
  beforeEach(resetStore);

  it("không có effect khi đang drag", () => {
    petStore.send({ type: "DRAG_START" });
    petStore.send({ type: "TICK" });
    expect(getPetState()).toBe("drag");
  });

  it("không có effect khi sleepForced", () => {
    petStore.send({ type: "SLEEP", forced: true });
    petStore.send({ type: "TICK" });
    expect(getPetState()).toBe("sleep");
  });

  it("không có effect khi agentState != idle", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    petStore.send({ type: "TICK" });
    expect(getPetState()).toBe("working");
  });

  it("không interrupt transient state", () => {
    petStore.send({ type: "FEED" });
    expect(getPetState()).toBe("eat");
    petStore.send({ type: "TICK" });
    expect(getPetState()).toBe("eat");
  });
});

// ── Priority ───────────────────────────────────────────────────────────────

describe("Priority: drag > sleep_forced > agent_state > mood", () => {
  beforeEach(resetStore);

  it("drag beat sleep_forced: DRAG_START trong sleep_forced → drag", () => {
    petStore.send({ type: "SLEEP", forced: true });
    petStore.send({ type: "DRAG_START" });
    expect(getPetState()).toBe("drag");
  });

  it("drag beat working: DRAG_START trong working → drag", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    petStore.send({ type: "DRAG_START" });
    expect(getPetState()).toBe("drag");
  });

  it("sleep_forced beat working: SLEEP forced khi working → sleep", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    petStore.send({ type: "SLEEP", forced: true });
    expect(getPetState()).toBe("sleep");
    expect(getPetContext().sleepForced).toBe(true);
  });

  it("working beat idle mood: AGENT_EVENT working override idle", () => {
    expect(getPetState()).toBe("idle");
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    expect(getPetState()).toBe("working");
  });

  it("DRAG_END khi sleepForced=true → trở về sleep (không phải prev)", () => {
    petStore.send({ type: "SLEEP", forced: true });
    petStore.send({ type: "DRAG_START" });
    petStore.send({ type: "DRAG_END" });
    expect(getPetState()).toBe("sleep");
  });
});

// ── Auto-revert (Fix #1) ───────────────────────────────────────────────────

describe("ANIM_DONE — auto-revert transient states", () => {
  beforeEach(resetStore);

  it("eat + ANIM_DONE → idle (agentState=idle)", () => {
    petStore.send({ type: "FEED" });
    expect(getPetState()).toBe("eat");
    petStore.send({ type: "ANIM_DONE" });
    expect(getPetState()).toBe("idle");
  });

  it("celebrate + ANIM_DONE → idle và reset agentState về idle", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "done_success" });
    expect(getPetState()).toBe("celebrate");
    expect(getPetContext().agentState).toBe("done_success");

    petStore.send({ type: "ANIM_DONE" });

    expect(getPetState()).toBe("idle");
    // agentState PHẢI reset về idle để resolveBase không loop lại celebrate
    expect(getPetContext().agentState).toBe("idle");
  });

  it("error + ANIM_DONE → idle và reset agentState về idle", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "done_error" });
    expect(getPetState()).toBe("error");
    expect(getPetContext().agentState).toBe("done_error");

    petStore.send({ type: "ANIM_DONE" });

    expect(getPetState()).toBe("idle");
    expect(getPetContext().agentState).toBe("idle");
  });

  it("ANIM_DONE khi idle (persistent) → không đổi state", () => {
    expect(getPetState()).toBe("idle");
    petStore.send({ type: "ANIM_DONE" });
    expect(getPetState()).toBe("idle");
  });

  it("ANIM_DONE khi working (persistent) → không đổi state", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    expect(getPetState()).toBe("working");
    petStore.send({ type: "ANIM_DONE" });
    expect(getPetState()).toBe("working");
  });

  it("celebrate → ANIM_DONE → idle → không còn celebrate (không stuck)", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "done_success" });
    expect(getPetState()).toBe("celebrate");
    petStore.send({ type: "ANIM_DONE" });
    expect(getPetState()).toBe("idle");
    // Gửi ANIM_DONE lần nữa — không có gì thay đổi (idle là persistent)
    petStore.send({ type: "ANIM_DONE" });
    expect(getPetState()).toBe("idle");
  });

  it("error → ANIM_DONE → idle → TICK không về error lại", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "done_error" });
    petStore.send({ type: "ANIM_DONE" });
    expect(getPetState()).toBe("idle");
    expect(getPetContext().agentState).toBe("idle");
    // TICK trong idle agentState → không chuyển về error
    petStore.send({ type: "TICK" });
    expect(getPetState()).not.toBe("error");
  });

  it("eat revert về working nếu agentState=working khi ANIM_DONE", () => {
    petStore.send({ type: "AGENT_EVENT", agentState: "working" });
    // FEED trong transient check: eat không interrupt transient,
    // nhưng khi working ta vẫn có thể feed (FEED chỉ block khi drag/transient)
    // working là persistent, không phải transient → FEED hoạt động
    petStore.send({ type: "FEED" });
    expect(getPetState()).toBe("eat");
    // agentState vẫn là working
    expect(getPetContext().agentState).toBe("working");

    petStore.send({ type: "ANIM_DONE" });
    // eat không reset agentState → resolveBase thấy working → về working
    expect(getPetState()).toBe("working");
    expect(getPetContext().agentState).toBe("working");
  });

  it("DRAG_START interrupt transient (eat) → DRAG_END về idle", () => {
    petStore.send({ type: "FEED" });
    expect(getPetState()).toBe("eat");
    petStore.send({ type: "DRAG_START" });
    expect(getPetState()).toBe("drag");
    petStore.send({ type: "DRAG_END" });
    // prev được lưu trước eat (idle) khi DRAG_START
    expect(getPetState()).toBe("idle");
  });
});
