/**
 * sessions-entry.tsx — tray popover control panel (Phase 1 redesign).
 *
 * Layout (top→bottom): header (agent counts) → companion card → agents list →
 * toggles (Show pet) → footer (Settings / Quit). Dismissed natively: a global
 * mouse monitor in tray.rs hides it on a click in any other app, the footer
 * actions hide it explicitly, and Escape hides it here (no webview-blur listener).
 *
 * Phase 1 uses only existing data. Phase 2-4 add today's token/feed counts,
 * pet name, size slider, and the menu-bar / updates toggles.
 */

import "../shared/design-tokens.css";
import "../shared/session-list.css";
import "./sessions.css";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { getCurrentWindow } from "@tauri-apps/api/window";
import SessionList from "../shared/SessionList.js";
import CompanionCard from "./CompanionCard.js";
import { createSessionsSignal, createThemeSignal, createNowSignal } from "../shared/use-sessions.js";
import { countRunning } from "../shared/session-counts.js";
import { togglePet, openSettings, quitApp } from "../shared/tauri-commands.js";

// ── Dismiss wiring (module scope: one window per webview) ─────────────────────
// Native dismissal: a global mouse monitor in the Rust tray code hides the popover
// on a click in any OTHER app (replaces the Accessory-unreliable webview blur); the
// footer actions hide it explicitly; Escape hides it here.
const win = getCurrentWindow();

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") void win.hide();
});

// ── Popover component ────────────────────────────────────────────────────────
function Popover() {
  const sessions = createSessionsSignal();
  const theme = createThemeSignal();
  const now = createNowSignal();

  // Local optimistic state (Phase 1): not yet synced with shortcut-driven toggles.
  const [petShown, setPetShown] = createSignal(true);
  async function handleTogglePet(): Promise<void> {
    const next = !petShown();
    setPetShown(next);
    // The pet now shows via orderFrontRegardless (never takes key), so toggling it
    // no longer blurs this popover — no focus suppression needed.
    try {
      await togglePet();
    } catch {
      setPetShown(!next); // revert on failure
    }
  }

  return (
    <div class="sessions-panel">
      <div class="popover-header">
        <span class="popover-title">Copet</span>
        <span class="popover-sub">
          {sessions().length} agents · {countRunning(sessions())} running
        </span>
      </div>

      <CompanionCard />

      <div class="popover-section-label">AGENTS</div>
      <SessionList sessions={sessions} theme={theme} now={now} />

      <div class="popover-toggles">
        <div class="popover-toggle-row">
          <span>🐾 Show pet</span>
          <button
            class={`toggle ${petShown() ? "toggle--on" : ""}`}
            role="switch"
            aria-checked={petShown()}
            onClick={handleTogglePet}
            aria-label="Show pet"
          >
            <span class="toggle-thumb" />
          </button>
        </div>
      </div>

      <div class="popover-footer">
        <button class="popover-foot-btn" onClick={() => { void win.hide(); void openSettings(); }}>
          ⚙ Settings
        </button>
        <button class="popover-foot-btn" onClick={() => void quitApp()}>
          ⏻ Quit
        </button>
      </div>
    </div>
  );
}

const root = document.getElementById("sessions-root");
if (root) {
  render(() => <Popover />, root);
}
