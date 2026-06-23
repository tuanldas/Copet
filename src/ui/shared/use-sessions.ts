/**
 * use-sessions.ts — SolidJS signal factories shared by the HUD and tray popover.
 *
 * Each window subscribes independently; the pet window is the sole broadcaster.
 * All factories register their own onCleanup, so they must be called within a
 * component's reactive scope.
 */

import { createSignal, onCleanup, onMount } from "solid-js";
import type { Accessor } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { SessionSnapshot, LabelTheme } from "../../types/session-snapshot.js";
import { getCurrentTheme, initLabelTheme, onThemeChange } from "./label-theme-store.js";

/** Live list of sessions from the `sessions-snapshot` broadcast. */
export function createSessionsSignal(): Accessor<SessionSnapshot[]> {
  const [sessions, setSessions] = createSignal<SessionSnapshot[]>([]);
  const unlistenPromise = listen<SessionSnapshot[]>("sessions-snapshot", (e) => {
    setSessions(e.payload ?? []);
  });
  onCleanup(() => {
    void unlistenPromise.then((un) => un());
  });
  return sessions;
}

/** Current label theme, kept in sync with Settings changes. */
export function createThemeSignal(): Accessor<LabelTheme> {
  const [theme, setTheme] = createSignal<LabelTheme>(getCurrentTheme());
  let unlisten: (() => void) | null = null;
  onMount(async () => {
    setTheme(await initLabelTheme());
    unlisten = await onThemeChange((t) => setTheme(t));
  });
  onCleanup(() => unlisten?.());
  return theme;
}

/** Epoch-seconds clock that ticks every `ms` to refresh duration cells. */
export function createNowSignal(ms = 1000): Accessor<number> {
  const [now, setNow] = createSignal(Math.floor(Date.now() / 1000));
  const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
  onCleanup(() => clearInterval(id));
  return now;
}
