/**
 * sessions-entry.tsx — mount point for the tray popover window.
 *
 * Renders the shared SessionList and auto-hides on blur / Escape. macOS Accessory
 * policy can make blur unreliable, so Escape + clicking the tray again (handled
 * in tray.rs) are the fallback ways to dismiss the popover.
 */

import "../shared/design-tokens.css";
import "../shared/session-list.css";
import "./sessions.css";
import { render } from "solid-js/web";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SessionList from "../shared/SessionList.js";
import { createSessionsSignal, createThemeSignal, createNowSignal } from "../shared/use-sessions.js";

// ── Auto-hide wiring (module scope: one window per webview) ───────────────────
const win = getCurrentWindow();
let justShown = false;

void win.onFocusChanged(({ payload: focused }) => {
  if (focused) {
    // Ignore the transient blur that can fire right after show() on macOS.
    justShown = true;
    setTimeout(() => { justShown = false; }, 200);
  } else if (!justShown) {
    void win.hide();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") void win.hide();
});

// ── Popover component ────────────────────────────────────────────────────────
function Popover() {
  const sessions = createSessionsSignal();
  const theme = createThemeSignal();
  const now = createNowSignal();
  return (
    <div class="sessions-panel">
      <div class="sessions-header">Sessions đang chạy</div>
      <SessionList sessions={sessions} theme={theme} now={now} />
    </div>
  );
}

const root = document.getElementById("sessions-root");
if (root) {
  render(() => <Popover />, root);
}
