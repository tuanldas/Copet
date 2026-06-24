/**
 * agent-bridge.ts — Wires agent-status-changed Tauri events to pet reactions.
 *
 * Runs ONLY in the pet window (owner role). Responsibilities:
 *   1. Listen to `agent-status-changed` Tauri events.
 *   2. Update SessionTracker; aggregate to effectiveState.
 *   3. Dispatch AGENT_EVENT to pet state machine (gated by coalesce, except
 *      one-shot states done/error always replay).
 *   4. Set glow/particle on pet handle.
 *   5. Update tooltip overlay.
 *   6. Apply XP via applyAgentXp (done events, dedup per session_id+ts).
 *      applyAgentXp is the SOLE source of XP + token accounting — never
 *      call addTokens directly in this module.
 *   7. Invoke set_tray_state Rust command (only on effectiveState change).
 *   8. setInterval to expire stale sessions, re-aggregate, and prune _xpDedup.
 *
 * Coalescing: loop states (working/waiting/idle) only dispatch pet + tray when
 * effectiveState changes. One-shot states (done/error) always replay so that
 * successive turns trigger the celebrate/error animation each time.
 */

import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { AgentEvent, AgentState } from "../types/agent-event.js";
import { SessionTracker } from "./session-tracker.js";
import { getReaction } from "./reaction-map.js";
import { getCurrentTheme, initLabelTheme, onThemeChange } from "../ui/shared/label-theme-store.js";
import { petStore } from "../pet/pet-state-machine.js";
import { applyAgentXp } from "../tamagotchi/index.js";
import type { PetHandle } from "../pet/index.js";
import type { TooltipHandle } from "../pet/pet-tooltip.js";

/** Expire active (working/waiting) sessions after 5 minutes of inactivity. */
const SESSION_TIMEOUT_MS = 300_000;

/**
 * Expire finished (done/error) sessions much sooner so completed turns don't
 * pile up as lingering "Full"/"Burnt" rows. Combined with EXPIRE_INTERVAL_MS,
 * a finished session clears ~45–60 s after its last event.
 */
const DONE_SESSION_TIMEOUT_MS = 45_000;

/**
 * Interval between stale-session checks (ms). Kept below DONE_SESSION_TIMEOUT_MS
 * so finished sessions clear close to their 45 s window rather than lagging a
 * full check cycle behind.
 */
const EXPIRE_INTERVAL_MS = 15_000;

/**
 * Dedup set for done XP: keys are `${session_id}:${ts}`.
 * Prevents double-counting if the daemon emits duplicate done events.
 * Pruned in the expire interval (capped or cleared of old entries).
 */
const _xpDedup = new Set<string>();

/**
 * One-shot states that must replay their reaction even when effectiveState
 * does not change (consecutive done/error turns from the same session).
 */
const ONE_SHOT_STATES = new Set<AgentState>(["done", "error"]);

/** Last effectiveState dispatched to pet/tray (coalesce gate for loop states). */
let _lastEffective: AgentState = "idle";

/** Unlisten function returned by `listen()`. */
let _unlisten: (() => void) | null = null;

/** Unlisten for `label-theme-changed` (tooltip refresh only). */
let _themeUnlisten: (() => void) | null = null;

/** Expire-stale interval handle. */
let _expireInterval = 0;

const _tracker = new SessionTracker();

/**
 * Broadcast the current session list to all windows (HUD, tray popover) so they
 * can render the running-sessions view. The pet window owns the tracker and is
 * the sole emitter; it does NOT listen to its own broadcast (the tooltip reads
 * the tracker directly).
 */
function _broadcast(): void {
  emit("sessions-snapshot", _tracker.list()).catch((err: unknown) => {
    console.warn("[agent-bridge] sessions-snapshot emit failed:", err);
  });
}

/**
 * Initialize the agent bridge. Call once after mountPet() in the pet window.
 *
 * @param petHandle - handle returned by mountPet()
 * @param tooltipHandle - handle returned by mountTooltip()
 * @returns cleanup function (removes listener + interval)
 */
export async function initAgentBridge(
  petHandle: PetHandle,
  tooltipHandle: TooltipHandle,
): Promise<() => void> {
  // ── 1. Listen to Tauri agent events ────────────────────────────────────────
  _unlisten = await listen<AgentEvent>("agent-status-changed", (ev) => {
    _handleEvent(ev.payload, petHandle, tooltipHandle);
  });

  // Label theme: load once + refresh the tooltip on change. This deliberately
  // refreshes ONLY the tooltip — it must not re-run _reAggregate, which would
  // replay the one-shot done/error pet animations on a mere theme switch.
  void initLabelTheme();
  _themeUnlisten = await onThemeChange(() => {
    tooltipHandle.update({ sessions: _tracker.list(), theme: getCurrentTheme() });
  });

  // ── 2. Expire stale sessions on interval ────────────────────────────────────
  _expireInterval = window.setInterval(() => {
    const nowMs = Date.now();
    const removed = _tracker.expireStale(nowMs, SESSION_TIMEOUT_MS, DONE_SESSION_TIMEOUT_MS);
    if (removed) {
      _reAggregate(petHandle, tooltipHandle);
      _broadcast();
    }
    // Prune _xpDedup: remove entries whose ts is older than SESSION_TIMEOUT.
    // Key format is `${session_id}:${ts}` where ts is epoch seconds.
    const cutoffS = Math.floor(nowMs / 1000) - Math.floor(SESSION_TIMEOUT_MS / 1000);
    for (const key of _xpDedup) {
      const colonIdx = key.lastIndexOf(":");
      if (colonIdx !== -1) {
        const ts = Number(key.slice(colonIdx + 1));
        if (!Number.isNaN(ts) && ts < cutoffS) {
          _xpDedup.delete(key);
        }
      }
    }
  }, EXPIRE_INTERVAL_MS);

  return _cleanup;
}

/** Handle a single incoming AgentEvent payload. */
function _handleEvent(
  event: AgentEvent,
  petHandle: PetHandle,
  tooltipHandle: TooltipHandle,
): void {
  const {
    session_id,
    state,
    ts,
    agent,
    project,
    tool,
    tool_input,
    cwd_full,
    message,
    prompt,
    model,
    summary,
    last_message,
    tokens_in,
    tokens_out,
    ended,
  } = event;

  // Session terminated (Claude SessionEnd, e.g. after /clear): remove it outright
  // instead of updating. Otherwise the cleared session lingers as a stale "done"
  // entry until the 5-min expiry, overlapping the freshly-started session.
  // No XP here — the turn's preceding Stop event already awarded it.
  if (ended) {
    if (_tracker.remove(session_id)) {
      _reAggregate(petHandle, tooltipHandle);
      _broadcast();
    }
    return;
  }

  // Update session tracker (enrichment fields bundled as the trailing info arg).
  _tracker.update(session_id, state, ts, agent, project, tool, {
    toolInput: tool_input,
    cwdFull: cwd_full,
    message,
    prompt,
    model,
    summary,
    lastMessage: last_message,
    tokensIn: tokens_in,
    tokensOut: tokens_out,
  });

  // XP + token accounting: applyAgentXp is the SOLE writer.
  // done → +10 XP (dedup per session_id:ts prevents double-count on replay).
  // tool != null → +1 XP +1 token (real agent hook events only; copet-run
  //   wrapper sends tool: null on done/error so wrapper runs give 0 tokens).
  if (state === "done") {
    const dedupKey = `${session_id}:${ts}`;
    if (!_xpDedup.has(dedupKey)) {
      _xpDedup.add(dedupKey);
      applyAgentXp(event);
    }
  } else if (event.tool !== null) {
    // working event with a tool (real agent tool_call, not wrapper done)
    applyAgentXp(event);
  }

  _reAggregate(petHandle, tooltipHandle);
  _broadcast();
}

/**
 * Re-compute aggregate and update pet/tray.
 *
 * Coalesce rules:
 * - Tooltip: always updated (project/count can change without state change).
 * - Loop states (working/waiting/idle): dispatch pet + tray only on change.
 * - One-shot states (done/error): always replay pet event + particle so that
 *   consecutive turns of the same state each trigger the animation.
 * - Tray: only updated when effectiveState changes (loop or one-shot).
 */
function _reAggregate(petHandle: PetHandle, tooltipHandle: TooltipHandle): void {
  const { effectiveState } = _tracker.aggregate();
  const reaction = getReaction(effectiveState);

  // ── Tooltip: always update (full session list + current theme) ─────────────
  tooltipHandle.update({
    sessions: _tracker.list(),
    theme: getCurrentTheme(),
  });

  const stateChanged = effectiveState !== _lastEffective;

  // ── One-shot states: always replay pet reaction ────────────────────────────
  if (ONE_SHOT_STATES.has(effectiveState)) {
    petStore.send({ type: "AGENT_EVENT", agentState: reaction.petAgentState });
    petHandle.setGlow(reaction.glowColor);
    if (reaction.particle) {
      petHandle.playParticle(reaction.particle);
    }
    // Tray only if state changed
    if (stateChanged) {
      _lastEffective = effectiveState;
      invoke("set_tray_state", { state: effectiveState }).catch((err: unknown) => {
        console.warn("[agent-bridge] set_tray_state failed:", err);
      });
    }
    return;
  }

  // ── Loop states: gate on effectiveState change ─────────────────────────────
  if (!stateChanged) return;
  _lastEffective = effectiveState;

  petStore.send({ type: "AGENT_EVENT", agentState: reaction.petAgentState });
  petHandle.setGlow(reaction.glowColor);

  invoke("set_tray_state", { state: effectiveState }).catch((err: unknown) => {
    console.warn("[agent-bridge] set_tray_state failed:", err);
  });
}

/** Remove listener and clear interval. */
function _cleanup(): void {
  _unlisten?.();
  _unlisten = null;
  _themeUnlisten?.();
  _themeUnlisten = null;
  if (_expireInterval) {
    clearInterval(_expireInterval);
    _expireInterval = 0;
  }
}
