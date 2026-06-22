/**
 * hud-entry.tsx — SolidJS mount point for the HUD window (Phase 06).
 * Mirrors shop-entry.tsx pattern: import CSS, render component into #hud-root.
 */

import "./hud.css";
import { render } from "solid-js/web";
import StatsHud from "./StatsHud.js";

const root = document.getElementById("hud-root");
if (root) {
  render(() => <StatsHud />, root);
}
