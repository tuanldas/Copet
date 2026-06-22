/**
 * main.ts — app entry point.
 * - mountPet(): pet render engine + click-through + drag (Phase 02).
 * - initTamagotchi(): stat loop + offline decay + persistence (Phase 04).
 * HUD hiển thị stats ở Phase 06; pet phản ứng theo stats/agent ở Phase 07.
 */

import { mountPet } from "./pet/index.js";
import { initTamagotchi } from "./tamagotchi/index.js";

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
if (!canvas) {
  throw new Error("[main] Không tìm thấy #pet-canvas trong DOM");
}

mountPet(canvas).catch((err: unknown) => {
  console.error("[Copet] mountPet thất bại:", err);
});

// Vòng đời Tamagotchi: load state → offline decay → tick (60s) + auto-save.
initTamagotchi().catch((err: unknown) => {
  console.error("[Copet] initTamagotchi thất bại:", err);
});
