/**
 * main.ts — Phase 02
 * Entry point: mount pet engine lên canvas.
 * Phase 01 PoC (vòng tròn + thủ công invoke) đã được thay thế bởi mountPet().
 * Click-through (set_pet_hit_rect) và drag (startDragging) nằm trong pet/index.ts.
 */

import { mountPet } from "./pet/index.js";

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
if (!canvas) {
  throw new Error("[main] Không tìm thấy #pet-canvas trong DOM");
}

mountPet(canvas).catch((err: unknown) => {
  console.error("[Copet] mountPet thất bại:", err);
});
