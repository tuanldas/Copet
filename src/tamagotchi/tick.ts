/**
 * tick.ts — 60-second interval driver for Tamagotchi Core (Phase 04).
 *
 * Each tick applies stat decay + care score update + evolution check.
 * The tick is paused when document is hidden (visibilitychange) to avoid
 * double-decay: offline-decay.ts handles the gap when the app comes back.
 *
 * Tick is NOT running during hidden state; offline-decay fills the gap on resume.
 */

/** Callback signature invoked on each tick. */
export type TickCallback = () => void;

const TICK_INTERVAL_MS = 60_000; // 1 minute

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _callback: TickCallback | null = null;
let _paused = false;

/**
 * Start the tick loop. Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param callback - Called once per tick while the window is visible.
 */
export function startTick(callback: TickCallback): void {
  if (_intervalId !== null) return; // Already running.

  _callback = callback;
  _paused = document.hidden;

  _intervalId = setInterval(() => {
    if (!_paused) {
      _callback?.();
    }
  }, TICK_INTERVAL_MS);

  // Pause tick while window is hidden; resume (without immediate tick) when shown.
  // The offline-decay handler in index.ts fires on resume to cover the gap.
  document.addEventListener("visibilitychange", _onVisibilityChange);
}

/** Stop the tick loop and remove listeners. */
export function stopTick(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  document.removeEventListener("visibilitychange", _onVisibilityChange);
  _callback = null;
  _paused = false;
}

function _onVisibilityChange(): void {
  _paused = document.hidden;
}
