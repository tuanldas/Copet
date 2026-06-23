/**
 * session-tracker.test.ts
 * Unit tests for SessionTracker: aggregate priority, expire stale, dedup.
 * Pure logic — no DOM/Tauri deps.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SessionTracker } from "../session-tracker.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Now in seconds (ts field of AgentEvent). */
const NOW_S = Math.floor(Date.now() / 1000);
/** Now in ms (for expireStale). */
const NOW_MS = NOW_S * 1000;

// ── Single session ────────────────────────────────────────────────────────────

describe("SessionTracker — single session", () => {
  let tracker: SessionTracker;

  beforeEach(() => {
    tracker = new SessionTracker();
  });

  it("starts empty → aggregate returns idle with sessionCount 0", () => {
    const r = tracker.aggregate();
    expect(r.effectiveState).toBe("idle");
    expect(r.sessionCount).toBe(0);
    expect(r.latest).toBeNull();
  });

  it("working session → effectiveState = working", () => {
    tracker.update("s1", "working", NOW_S, "claude-code", "my-project");
    const r = tracker.aggregate();
    expect(r.effectiveState).toBe("working");
    expect(r.sessionCount).toBe(1);
    expect(r.latest?.project).toBe("my-project");
  });

  it("done session → effectiveState = done", () => {
    tracker.update("s1", "done", NOW_S, "claude-code", null);
    expect(tracker.aggregate().effectiveState).toBe("done");
  });

  it("update same session_id changes its state", () => {
    tracker.update("s1", "working", NOW_S, "claude-code", null);
    tracker.update("s1", "done", NOW_S + 5, "claude-code", null);
    const r = tracker.aggregate();
    expect(r.effectiveState).toBe("done");
    expect(r.sessionCount).toBe(1);
  });
});

// ── Multi-session priority ────────────────────────────────────────────────────

describe("SessionTracker — multi-session priority (working > waiting > error > done > idle)", () => {
  let tracker: SessionTracker;

  beforeEach(() => {
    tracker = new SessionTracker();
  });

  it("working + done → aggregate = working", () => {
    tracker.update("s1", "working", NOW_S, "claude-code", "proj-a");
    tracker.update("s2", "done", NOW_S, "claude-code", "proj-b");
    const r = tracker.aggregate();
    expect(r.effectiveState).toBe("working");
    expect(r.sessionCount).toBe(2);
  });

  it("waiting + done → aggregate = waiting", () => {
    tracker.update("s1", "waiting", NOW_S, "claude-code", null);
    tracker.update("s2", "done", NOW_S, "claude-code", null);
    expect(tracker.aggregate().effectiveState).toBe("waiting");
  });

  it("error + done → aggregate = error", () => {
    tracker.update("s1", "error", NOW_S, "claude-code", null);
    tracker.update("s2", "done", NOW_S, "claude-code", null);
    expect(tracker.aggregate().effectiveState).toBe("error");
  });

  it("done + idle → aggregate = done", () => {
    tracker.update("s1", "done", NOW_S, "claude-code", null);
    tracker.update("s2", "idle", NOW_S, "claude-code", null);
    expect(tracker.aggregate().effectiveState).toBe("done");
  });

  it("three sessions: working + error + done → working wins", () => {
    tracker.update("s1", "error", NOW_S, "claude-code", null);
    tracker.update("s2", "done", NOW_S, "claude-code", null);
    tracker.update("s3", "working", NOW_S, "claude-code", null);
    expect(tracker.aggregate().effectiveState).toBe("working");
  });

  it("all idle → aggregate = idle", () => {
    tracker.update("s1", "idle", NOW_S, "claude-code", null);
    tracker.update("s2", "idle", NOW_S, "claude-code", null);
    expect(tracker.aggregate().effectiveState).toBe("idle");
  });
});

// ── Expire stale ──────────────────────────────────────────────────────────────

describe("SessionTracker — expireStale", () => {
  let tracker: SessionTracker;

  beforeEach(() => {
    tracker = new SessionTracker();
  });

  it("fresh session is NOT expired", () => {
    tracker.update("s1", "working", NOW_S, "claude-code", null);
    const removed = tracker.expireStale(NOW_MS, 300_000);
    expect(removed).toBe(false);
    expect(tracker.size).toBe(1);
  });

  it("stale session (older than timeout) IS removed", () => {
    const staleTs = NOW_S - 400; // 400 s ago → beyond 300 s timeout
    tracker.update("s1", "working", staleTs, "claude-code", null);
    const removed = tracker.expireStale(NOW_MS, 300_000);
    expect(removed).toBe(true);
    expect(tracker.size).toBe(0);
  });

  it("after expiring stale session, aggregate returns idle", () => {
    const staleTs = NOW_S - 400;
    tracker.update("s1", "working", staleTs, "claude-code", null);
    tracker.expireStale(NOW_MS, 300_000);
    const r = tracker.aggregate();
    expect(r.effectiveState).toBe("idle");
    expect(r.sessionCount).toBe(0);
  });

  it("only stale sessions are removed; fresh ones remain", () => {
    const staleTs = NOW_S - 400;
    tracker.update("stale", "working", staleTs, "claude-code", null);
    tracker.update("fresh", "done", NOW_S, "claude-code", null);
    tracker.expireStale(NOW_MS, 300_000);
    expect(tracker.size).toBe(1);
    expect(tracker.get("fresh")).toBeDefined();
    expect(tracker.get("stale")).toBeUndefined();
  });

  it("after stale removed, aggregate reflects only remaining sessions", () => {
    tracker.update("stale", "working", NOW_S - 400, "claude-code", null);
    tracker.update("fresh", "done", NOW_S, "claude-code", null);
    tracker.expireStale(NOW_MS, 300_000);
    expect(tracker.aggregate().effectiveState).toBe("done");
  });

  it("expireStale returns false when nothing removed", () => {
    expect(tracker.expireStale(NOW_MS, 300_000)).toBe(false);
  });
});

// ── Priority full order ───────────────────────────────────────────────────────

describe("SessionTracker — full priority order verification", () => {
  const PRIORITY_ORDER = ["working", "waiting", "error", "done", "idle"] as const;

  it("higher priority state wins over every lower-priority state", () => {
    for (let hi = 0; hi < PRIORITY_ORDER.length - 1; hi++) {
      for (let lo = hi + 1; lo < PRIORITY_ORDER.length; lo++) {
        const tracker = new SessionTracker();
        tracker.update("hi", PRIORITY_ORDER[hi], NOW_S, null, null);
        tracker.update("lo", PRIORITY_ORDER[lo], NOW_S, null, null);
        const result = tracker.aggregate().effectiveState;
        expect(result).toBe(PRIORITY_ORDER[hi]);
      }
    }
  });
});

// ── since tracking ──────────────────────────────────────────────────────────

describe("SessionTracker — since tracking", () => {
  it("new session: since === ts", () => {
    const t = new SessionTracker();
    t.update("s1", "working", NOW_S, "claude-code", "p");
    expect(t.list()[0].since).toBe(NOW_S);
  });

  it("working → working keeps since unchanged", () => {
    const t = new SessionTracker();
    t.update("s1", "working", NOW_S, "claude-code", "p");
    t.update("s1", "working", NOW_S + 30, "claude-code", "p");
    expect(t.list()[0].since).toBe(NOW_S);
  });

  it("waiting → working keeps since (same turn)", () => {
    const t = new SessionTracker();
    t.update("s1", "working", NOW_S, "claude-code", "p");
    t.update("s1", "waiting", NOW_S + 10, "claude-code", "p");
    t.update("s1", "working", NOW_S + 20, "claude-code", "p");
    expect(t.list()[0].since).toBe(NOW_S);
  });

  it("done → working resets since (new turn)", () => {
    const t = new SessionTracker();
    t.update("s1", "working", NOW_S, "claude-code", "p");
    t.update("s1", "done", NOW_S + 10, "claude-code", "p");
    t.update("s1", "working", NOW_S + 20, "claude-code", "p");
    expect(t.list()[0].since).toBe(NOW_S + 20);
  });

  it("error → working resets since", () => {
    const t = new SessionTracker();
    t.update("s1", "error", NOW_S, "claude-code", "p");
    t.update("s1", "working", NOW_S + 5, "claude-code", "p");
    expect(t.list()[0].since).toBe(NOW_S + 5);
  });
});

// ── list() ──────────────────────────────────────────────────────────────────

describe("SessionTracker — list()", () => {
  it("returns one snapshot per session with sessionId + since", () => {
    const t = new SessionTracker();
    t.update("a", "working", NOW_S, "claude-code", "pa");
    t.update("b", "done", NOW_S, "codex", "pb");
    const list = t.list();
    expect(list.length).toBe(2);
    expect(list.map((s) => s.sessionId).sort()).toEqual(["a", "b"]);
    for (const s of list) expect(typeof s.since).toBe("number");
  });

  it("excludes expired sessions", () => {
    const t = new SessionTracker();
    t.update("stale", "working", NOW_S - 400, "claude-code", null);
    t.update("fresh", "working", NOW_S, "claude-code", null);
    t.expireStale(NOW_MS, 300_000);
    expect(t.list().map((s) => s.sessionId)).toEqual(["fresh"]);
  });
});
