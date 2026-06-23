/**
 * Settings.tsx — Copet Settings panel (Phase 06).
 *
 * Sections:
 *   - Global shortcut: text input + apply button (calls set_global_shortcut).
 *   - Autostart: toggle (enable_autostart / is_autostart_enabled).
 *   - Pet select: radio/buttons — only "blobby" in MVP.
 *   - Reduced-motion: toggle (adds .reduced-motion to :root in all windows).
 *   - Pet position reset: invoke positioner preset (BottomRight corner).
 *
 * All state is stored via Tauri commands that persist to the store.
 * This window is a client — no tama:state reading needed here.
 */

import { createSignal, onMount, Show } from "solid-js";
import type { Component } from "solid-js";
import {
  enableAutostart,
  isAutostartEnabled,
  setGlobalShortcut,
  selectPet,
  setLabelTheme,
  setTranscriptOptin,
  getSettings,
  resetPetPosition,
  installHook,
  uninstallHook,
  hookStatus,
  type HookAgent,
} from "../shared/tauri-commands.js";
import { emit } from "@tauri-apps/api/event";
import { LABEL_THEMES } from "../../agent-bridge/state-labels.js";
import type { LabelTheme } from "../../types/session-snapshot.js";

// ── Local storage key for reduced-motion preference ──────────────────────────
const REDUCED_MOTION_KEY = "copet-reduced-motion";

function getStoredReducedMotion(): boolean {
  return localStorage.getItem(REDUCED_MOTION_KEY) === "true";
}

function applyReducedMotion(enabled: boolean): void {
  if (enabled) {
    document.documentElement.classList.add("reduced-motion");
  } else {
    document.documentElement.classList.remove("reduced-motion");
  }
  localStorage.setItem(REDUCED_MOTION_KEY, String(enabled));
}

const Settings: Component = () => {
  // ── Shortcut ────────────────────────────────────────────────────────────────
  const [shortcut, setShortcut] = createSignal("CmdOrCtrl+Shift+P");
  const [shortcutStatus, setShortcutStatus] = createSignal("");

  async function handleApplyShortcut(): Promise<void> {
    setShortcutStatus("");
    try {
      await setGlobalShortcut(shortcut());
      setShortcutStatus("Saved.");
    } catch (e) {
      setShortcutStatus(`Error: ${String(e)}`);
    }
    setTimeout(() => setShortcutStatus(""), 2500);
  }

  // ── Autostart ───────────────────────────────────────────────────────────────
  const [autostart, setAutostart] = createSignal(false);
  const [autostartBusy, setAutostartBusy] = createSignal(false);

  async function handleAutostartToggle(): Promise<void> {
    setAutostartBusy(true);
    try {
      await enableAutostart(!autostart());
      setAutostart(!autostart());
    } catch {
      // Leave toggle unchanged on error.
    } finally {
      setAutostartBusy(false);
    }
  }

  // ── Pet select ──────────────────────────────────────────────────────────────
  const [selectedPet, setSelectedPet] = createSignal("blobby");

  async function handleSelectPet(id: string): Promise<void> {
    try {
      await selectPet(id);
      setSelectedPet(id);
    } catch {
      // No-op on unknown id (Rust validates).
    }
  }

  // ── Status-label theme ───────────────────────────────────────────────────────
  const [labelTheme, setLabelThemeSig] = createSignal<LabelTheme>("kitchen");

  const THEME_NAMES: Record<LabelTheme, string> = {
    kitchen: "🍳 Bếp núc",
    mood: "😊 Cảm xúc",
    garden: "🌱 Vườn tược",
  };

  async function handleSelectTheme(theme: LabelTheme): Promise<void> {
    try {
      await setLabelTheme(theme);
      setLabelThemeSig(theme);
      // Broadcast so HUD / popover / tooltip relabel immediately (no restart).
      await emit("label-theme-changed", { theme });
    } catch {
      // No-op on unknown theme (Rust validates).
    }
  }

  // ── Transcript enrichment opt-in (privacy-sensitive, default off) ────────────
  const [transcriptOptin, setTranscriptOptinSig] = createSignal(false);
  const [transcriptBusy, setTranscriptBusy] = createSignal(false);

  async function handleTranscriptToggle(): Promise<void> {
    const next = !transcriptOptin();
    setTranscriptBusy(true);
    try {
      await setTranscriptOptin(next);
      setTranscriptOptinSig(next);
    } catch {
      // Leave toggle unchanged on error.
    } finally {
      setTranscriptBusy(false);
    }
  }

  // ── Reduced-motion ──────────────────────────────────────────────────────────
  const [reducedMotion, setReducedMotion] = createSignal(false);

  function handleReducedMotionToggle(): void {
    const next = !reducedMotion();
    setReducedMotion(next);
    applyReducedMotion(next);
  }

  // ── Hook install (Phase 08) ─────────────────────────────────────────────────
  // Per-agent installed state + busy flag + status message.
  const HOOK_AGENTS: HookAgent[] = ["claude", "codex", "gemini"];
  const [hookInstalled, setHookInstalled] = createSignal<Record<HookAgent, boolean>>({
    claude: false,
    codex: false,
    gemini: false,
  });
  const [hookBusy, setHookBusy] = createSignal<Record<HookAgent, boolean>>({
    claude: false,
    codex: false,
    gemini: false,
  });
  const [hookMsg, setHookMsg] = createSignal("");

  async function refreshHookStatus(): Promise<void> {
    const results = await Promise.all(
      HOOK_AGENTS.map((a) => hookStatus(a).catch(() => false)),
    );
    const next: Record<HookAgent, boolean> = { claude: false, codex: false, gemini: false };
    HOOK_AGENTS.forEach((a, i) => { next[a] = results[i] as boolean; });
    setHookInstalled(next);
  }

  async function handleHookToggle(agent: HookAgent): Promise<void> {
    setHookBusy({ ...hookBusy(), [agent]: true });
    setHookMsg("");
    try {
      if (hookInstalled()[agent]) {
        const msg = await uninstallHook(agent);
        setHookMsg(msg);
      } else {
        const msg = await installHook(agent);
        setHookMsg(msg);
      }
      await refreshHookStatus();
    } catch (e) {
      setHookMsg(`Error: ${String(e)}`);
    } finally {
      setHookBusy({ ...hookBusy(), [agent]: false });
      setTimeout(() => setHookMsg(""), 4000);
    }
  }

  // ── Position reset ──────────────────────────────────────────────────────────
  const [posStatus, setPosStatus] = createSignal("");

  async function handleResetPosition(): Promise<void> {
    setPosStatus("");
    try {
      // Rust command acts on the "pet" window label — not the Settings window.
      // Never use JS moveWindow() here: it would snap Settings, not the pet.
      await resetPetPosition();
      setPosStatus("Pet moved to bottom-right.");
    } catch (e) {
      setPosStatus(`Error: ${String(e)}`);
    }
    setTimeout(() => setPosStatus(""), 2500);
  }

  // ── Mount: read persisted values ────────────────────────────────────────────
  onMount(async () => {
    // H3 fix: load shortcut + selected pet from store (not hardcoded).
    try {
      const saved = await getSettings();
      setShortcut(saved.shortcut);
      setSelectedPet(saved.selected_pet);
      setLabelThemeSig(saved.label_theme);
      setTranscriptOptinSig(saved.transcript_optin);
    } catch {
      // First launch or store unavailable — keep signal defaults.
    }

    // Autostart state.
    try {
      const enabled = await isAutostartEnabled();
      setAutostart(enabled);
    } catch {
      // Plugin may not be available in dev; leave false.
    }

    // Reduced-motion from localStorage.
    const rm = getStoredReducedMotion();
    setReducedMotion(rm);
    applyReducedMotion(rm);

    // Hook install status (Phase 08).
    await refreshHookStatus().catch(() => {});
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div id="settings-root">
      <header class="settings-header">
        <h1 class="settings-title">Settings</h1>
      </header>

      <div class="settings-body">

        {/* ── Global shortcut ──────────────────────────────────────────────── */}
        <section class="settings-section" aria-labelledby="sec-shortcut">
          <h2 id="sec-shortcut" class="settings-section-title">Toggle Pet Shortcut</h2>
          <p class="settings-hint">
            Keyboard shortcut to show / hide your pet from anywhere.
          </p>
          <div class="settings-row">
            <input
              class="settings-input"
              type="text"
              value={shortcut()}
              onInput={(e) => setShortcut(e.currentTarget.value)}
              aria-label="Global shortcut string"
              placeholder="e.g. CmdOrCtrl+Shift+P"
            />
            <button class="btn btn--primary" onClick={handleApplyShortcut}>
              Apply
            </button>
          </div>
          <Show when={shortcutStatus()}>
            <p class="settings-status">{shortcutStatus()}</p>
          </Show>
        </section>

        {/* ── Autostart ────────────────────────────────────────────────────── */}
        <section class="settings-section" aria-labelledby="sec-autostart">
          <h2 id="sec-autostart" class="settings-section-title">Launch at Login</h2>
          <div class="settings-row settings-row--between">
            <span class="settings-label">Start Copet automatically on login</span>
            <button
              class={`toggle ${autostart() ? "toggle--on" : ""}`}
              role="switch"
              aria-checked={autostart()}
              disabled={autostartBusy()}
              onClick={handleAutostartToggle}
              aria-label="Launch at login"
            >
              <span class="toggle-thumb" />
            </button>
          </div>
        </section>

        {/* ── Pet select ───────────────────────────────────────────────────── */}
        <section class="settings-section" aria-labelledby="sec-pet">
          <h2 id="sec-pet" class="settings-section-title">Choose Pet</h2>
          <div class="pet-select-row">
            <button
              class={`pet-option ${selectedPet() === "blobby" ? "pet-option--selected" : ""}`}
              onClick={() => handleSelectPet("blobby")}
              aria-pressed={selectedPet() === "blobby"}
            >
              <span class="pet-option-emoji">🟣</span>
              <span class="pet-option-name">Blobby</span>
            </button>
            {/* More pets will be added in future phases */}
            <button class="pet-option pet-option--locked" disabled aria-disabled="true">
              <span class="pet-option-emoji">🔒</span>
              <span class="pet-option-name">Coming soon</span>
            </button>
          </div>
        </section>

        {/* ── Status-label theme ───────────────────────────────────────────── */}
        <section class="settings-section" aria-labelledby="sec-labels">
          <h2 id="sec-labels" class="settings-section-title">Nhãn trạng thái</h2>
          <p class="settings-hint">
            Bộ nhãn cho trạng thái session (hiện ở HUD, popover, tooltip).
          </p>
          <div class="pet-select-row">
            {LABEL_THEMES.map((t) => (
              <button
                class={`pet-option ${labelTheme() === t ? "pet-option--selected" : ""}`}
                onClick={() => handleSelectTheme(t)}
                aria-pressed={labelTheme() === t}
              >
                <span class="pet-option-name">{THEME_NAMES[t]}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Transcript enrichment (privacy opt-in) ───────────────────────── */}
        <section class="settings-section" aria-labelledby="sec-transcript">
          <h2 id="sec-transcript" class="settings-section-title">Model &amp; tóm tắt task</h2>
          <p class="settings-hint">
            Hiển thị model, tóm tắt task, tin nhắn cuối &amp; tokens cho session Claude.
            <strong> Cần đọc nội dung transcript hội thoại</strong> — chỉ bật nếu bạn đồng ý.
            Mặc định tắt. Chỉ áp dụng cho Claude Code.
          </p>
          <div class="settings-row settings-row--between">
            <span class="settings-label">Đọc transcript để hiện model + tóm tắt</span>
            <button
              class={`toggle ${transcriptOptin() ? "toggle--on" : ""}`}
              role="switch"
              aria-checked={transcriptOptin()}
              disabled={transcriptBusy()}
              onClick={handleTranscriptToggle}
              aria-label="Đọc transcript (model + tóm tắt task)"
            >
              <span class="toggle-thumb" />
            </button>
          </div>
        </section>

        {/* ── Reduced motion ───────────────────────────────────────────────── */}
        <section class="settings-section" aria-labelledby="sec-motion">
          <h2 id="sec-motion" class="settings-section-title">Accessibility</h2>
          <div class="settings-row settings-row--between">
            <span class="settings-label">Reduced motion (fewer animations)</span>
            <button
              class={`toggle ${reducedMotion() ? "toggle--on" : ""}`}
              role="switch"
              aria-checked={reducedMotion()}
              onClick={handleReducedMotionToggle}
              aria-label="Reduced motion"
            >
              <span class="toggle-thumb" />
            </button>
          </div>
        </section>

        {/* ── Install hooks (Phase 08) ─────────────────────────────────────── */}
        <section class="settings-section" aria-labelledby="sec-hooks">
          <h2 id="sec-hooks" class="settings-section-title">Agent Hooks</h2>
          <p class="settings-hint">
            Connect Copet to your AI coding agents so the pet reacts to their activity.
          </p>
          {HOOK_AGENTS.map((agent) => {
            const installed = () => hookInstalled()[agent];
            const busy = () => hookBusy()[agent];
            const label = agent.charAt(0).toUpperCase() + agent.slice(1);
            return (
              <div class="settings-row settings-row--between" style="margin-bottom:6px">
                <span class="settings-label">
                  {label}
                  {installed() && <span class="hook-badge"> installed</span>}
                </span>
                <button
                  class={`btn ${installed() ? "btn--ghost" : "btn--primary"}`}
                  disabled={busy()}
                  onClick={() => handleHookToggle(agent)}
                  aria-label={`${installed() ? "Uninstall" : "Install"} ${label} hook`}
                >
                  {busy() ? "…" : installed() ? "Uninstall" : "Install"}
                </button>
              </div>
            );
          })}
          <Show when={hookMsg()}>
            <p class="settings-status">{hookMsg()}</p>
          </Show>
        </section>

        {/* ── Pet position reset ───────────────────────────────────────────── */}
        <section class="settings-section" aria-labelledby="sec-position">
          <h2 id="sec-position" class="settings-section-title">Pet Position</h2>
          <div class="settings-row settings-row--between">
            <span class="settings-label">Snap pet to bottom-right corner</span>
            <button class="btn btn--ghost" onClick={handleResetPosition}>
              Reset
            </button>
          </div>
          <Show when={posStatus()}>
            <p class="settings-status">{posStatus()}</p>
          </Show>
        </section>

      </div>
    </div>
  );
};

export default Settings;
