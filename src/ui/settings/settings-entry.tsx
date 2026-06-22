/**
 * settings-entry.tsx — SolidJS mount point for the Settings window (Phase 06).
 */

import "./settings.css";
import { render } from "solid-js/web";
import Settings from "./Settings.js";

const root = document.getElementById("settings-root");
if (root) {
  render(() => <Settings />, root);
}
