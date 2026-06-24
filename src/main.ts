/**
 * main.ts — app entry point (pet window / owner role).
 * - mountPet(): pet render engine + click-through + drag (Phase 02).
 * - initTamagotchi(): stat loop + offline decay + persistence (Phase 04).
 * - initAgentBridge(): wire agent-status-changed → pet reaction (Phase 07).
 * HUD hiển thị stats ở Phase 06; pet phản ứng theo stats/agent ở Phase 07.
 */

import { mountPet } from "./pet/index.js";
import { initTamagotchi } from "./tamagotchi/index.js";
import { initAgentBridge } from "./agent-bridge/agent-bridge.js";
import { mountTooltip } from "./pet/pet-tooltip.js";

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
if (!canvas) {
  throw new Error("[main] Không tìm thấy #pet-canvas trong DOM");
}

// Vòng đời Tamagotchi: load state → offline decay → tick (60s) + auto-save.
// role "owner": pet window is the single writer for copet-pet.json.
initTamagotchi({ role: "owner" }).catch((err: unknown) => {
  console.error("[Copet] initTamagotchi thất bại:", err);
});

// Mount pet then wire agent-bridge (Phase 07) with the returned handle.
// agent-bridge only runs in the pet window (owner) — correct single-writer.
mountPet(canvas)
  .then(({ handle }) => {
    // Session panel: pinned at a fixed anchor above the (stationary) pet, shown
    // only while a session is working/waiting. getPosition() delegates to
    // RenderLoop.position (constant now). agent-bridge feeds it sessions + theme.
    const tooltipHandle = mountTooltip(canvas, () => handle.getPosition());
    return initAgentBridge(handle, tooltipHandle);
  })
  .catch((err: unknown) => {
    console.error("[Copet] mountPet / agent-bridge thất bại:", err);
  });
