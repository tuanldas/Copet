// Phase 01 PoC — prove the transparent-overlay contract before building the engine:
//   - opaque pixels (the drawn pet body) capture the mouse and drag the OS window
//   - transparent pixels pass clicks through to the app underneath
//     (macOS: automatic for fully-transparent pixels; if not, Phase 01 risk
//      mitigation adds a Rust cursor-poll toggle of setIgnoreCursorEvents)
// Replaced by the real sprite renderer in Phase 02.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

const appWindow = getCurrentWindow();

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas")!;
const ctx = canvas.getContext("2d")!;

// Pet stand-in geometry (logical px), kept in scope for hit-testing.
const PET_RADIUS = 64;

function center(): { x: number; y: number } {
  return { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

let tick = 0;
function draw(): void {
  const { x, y } = center();
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  // Gentle idle bob so the PoC visibly animates.
  const bob = Math.sin(tick / 30) * 4;
  const cy = y + bob;

  // Body — opaque region; this is what must capture clicks.
  ctx.beginPath();
  ctx.arc(x, cy, PET_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#8B5CF6"; // brand violet (docs/design-guidelines.md)
  ctx.fill();

  // Eyes — quick sign of life.
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - 22, cy - 10, 9, 0, Math.PI * 2);
  ctx.arc(x + 22, cy - 10, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1E1E2E";
  ctx.beginPath();
  ctx.arc(x - 22, cy - 10, 4, 0, Math.PI * 2);
  ctx.arc(x + 22, cy - 10, 4, 0, Math.PI * 2);
  ctx.fill();
}

// Is the pointer over the opaque pet body (vs. the transparent passthrough area)?
function isOnPet(clientX: number, clientY: number): boolean {
  const rect = canvas.getBoundingClientRect();
  const { x, y } = center();
  const dx = clientX - rect.left - x;
  const dy = clientY - rect.top - y;
  return dx * dx + dy * dy <= PET_RADIUS * PET_RADIUS;
}

// Drag the OS window only when grabbing the pet body.
canvas.addEventListener("mousedown", async (e) => {
  if (e.button !== 0 || !isOnPet(e.clientX, e.clientY)) return;
  await appWindow.startDragging();
});

// Animation loop, paused while the window is hidden to save CPU (kept in Phase 02).
let raf = 0;
function loop(): void {
  tick += 1;
  draw();
  raf = requestAnimationFrame(loop);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cancelAnimationFrame(raf);
  else loop();
});

window.addEventListener("resize", resize);
resize();
loop();

// Tell Rust the pet's interactive radius so click-through hit-testing (Rust cursor poll)
// matches the drawn body. See src-tauri/src/lib.rs.
void invoke("set_pet_hit_radius", { radius: PET_RADIUS });
