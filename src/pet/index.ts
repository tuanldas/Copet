/**
 * pet/index.ts
 * Entry point của pet engine: wire loader + player + state machine + loop.
 * Export `mountPet(canvas)` — đây là API duy nhất cho src/main.ts.
 *
 * Responsibilities:
 * - Load pet-pack (pet.json + spritesheet)
 * - Khởi tạo SpritePlayer, AnimationController, RenderLoop
 * - Xử lý input: mousedown → startDragging() + DRAG_START/END events
 * - Report hit-rect sang Rust qua set_pet_hit_rect (click-through)
 * - Hẹn ANIM_DONE cho các transient state (eat/celebrate/error/evolve)
 * - Safety DRAG_END khi window blur (tránh pet kẹt drag state, tauri#10767)
 * - DEV-only auto-cycle demo timer (overlay window không có keyboard focus)
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

import { loadPetPack } from "./pet-pack-loader.js";
import { SpritePlayer } from "./sprite-player.js";
import { AnimationController } from "./animation-controller.js";
import { RenderLoop } from "./render-loop.js";
import { petStore, getPetState, TRANSIENT_STATES } from "./pet-state-machine.js";
import type { AnimResolution } from "./animation-controller.js";

/** Kích thước hiển thị pet trên canvas (logical px) — scale từ 192×208 xuống */
const PET_DISPLAY_WIDTH = 96;
const PET_DISPLAY_HEIGHT = 104;

/** URL gốc của pet-pack MVP (phục vụ từ public/) */
const PET_PACK_BASE_URL = "/assets/pets/blobby";

/** DEV-only: bật auto-cycle demo (overlay window không nhận keyboard focus) */
const DEV_MODE = import.meta.env.DEV;

/**
 * Mount pet engine lên canvas.
 * @param canvas - Element #pet-canvas trong DOM
 * @returns cleanup function — gọi khi HMR remount để tránh listener leak
 */
export async function mountPet(canvas: HTMLCanvasElement): Promise<() => void> {
  // ── DPR setup ────────────────────────────────────────────────────────────
  setupCanvasDpr(canvas);
  // Track resize handler để remove khi cleanup (tránh leak khi HMR remount) [Fix #5]
  const onResize = (): void => setupCanvasDpr(canvas);
  window.addEventListener("resize", onResize);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[mountPet] Không lấy được 2D context từ canvas");

  // ── 1. Load pet-pack ─────────────────────────────────────────────────────
  const pack = await loadPetPack(PET_PACK_BASE_URL);
  const player = new SpritePlayer(pack, ctx);
  const animCtrl = new AnimationController(pack);

  // ── 2. Hit-rect reporting ─────────────────────────────────────────────────
  // Throttle ~30fps; force=true bỏ gate (dùng khi state đổi hoặc walk dừng) [Fix #4]
  let lastReportTs = 0;
  let lastRX = Number.NaN;
  let lastRY = Number.NaN;

  const reportHitRect = (pos: { x: number; y: number }, ts: number, force = false): void => {
    const tooSoon = ts - lastReportTs < 33;
    const noMove = Math.abs(pos.x - lastRX) < 1 && Math.abs(pos.y - lastRY) < 1;
    if (!force && (tooSoon || noMove)) return;
    lastReportTs = ts;
    lastRX = pos.x;
    lastRY = pos.y;
    void invoke("set_pet_hit_rect", {
      x: pos.x,
      y: pos.y,
      w: PET_DISPLAY_WIDTH,
      h: PET_DISPLAY_HEIGHT,
    });
  };

  // ── 3. Render loop ────────────────────────────────────────────────────────
  const loop = new RenderLoop(
    { petWidth: PET_DISPLAY_WIDTH, petHeight: PET_DISPLAY_HEIGHT, canvas },
    animCtrl.resolve(getPetState()),
    ({ frameIndex, position, timestamp }) => {
      player.clearAll();
      player.draw({
        row: animCtrl.resolve(getPetState()).row,
        col: frameIndex,
        destX: position.x,
        destY: position.y,
        destWidth: PET_DISPLAY_WIDTH,
        destHeight: PET_DISPLAY_HEIGHT,
      });
      reportHitRect(position, timestamp);
    }
  );

  // ── 4. Transient state auto-revert [Fix #1: stuck states] ────────────────
  // Khi vào transient state, hẹn ANIM_DONE = (frames/fps * 1000) ms.
  // Cancel timer nếu state đổi trước (vd drag interrupt).
  let animDoneTimer = 0;

  const scheduleAnimDone = (resolution: AnimResolution): void => {
    clearTimeout(animDoneTimer);
    const durationMs = Math.ceil((resolution.frames / resolution.fps) * 1000);
    animDoneTimer = window.setTimeout(() => {
      petStore.send({ type: "ANIM_DONE" });
    }, durationMs);
  };

  // ── 5. State machine subscription ────────────────────────────────────────
  // petStore.subscribe() trả về Subscription { unsubscribe() }
  const subscription = petStore.subscribe((snapshot) => {
    const state = snapshot.context.current;
    const resolution = animCtrl.resolve(state);
    loop.updateResolution(resolution, state);

    // Force hit-rect sync khi state đổi (bỏ qua throttle+delta) [Fix #4]
    reportHitRect(loop.position, performance.now(), true);

    if (TRANSIENT_STATES.has(state)) {
      scheduleAnimDone(resolution);
    } else {
      clearTimeout(animDoneTimer);
    }
  });

  // ── 6. Drag input ─────────────────────────────────────────────────────────
  const appWindow = getCurrentWindow();

  // Dùng wrapper EventListener-typed để removeEventListener khớp đúng reference
  const onMouseDown = (e: Event): void => {
    const me = e as MouseEvent;
    if (me.button !== 0) return;
    if (!isPointerOnPet(me, canvas, loop.position)) return;
    petStore.send({ type: "DRAG_START" });
    // startDragging là async; lỗi không làm crash — log để debug
    appWindow.startDragging().catch((err: unknown) => {
      console.warn("[mountPet] startDragging failed:", err);
    });
  };
  canvas.addEventListener("mousedown", onMouseDown);

  const onMouseUp = (e: Event): void => {
    const me = e as MouseEvent;
    if (me.button !== 0) return;
    if (getPetState() === "drag") {
      petStore.send({ type: "DRAG_END" });
    }
  };
  window.addEventListener("mouseup", onMouseUp);

  // ── 7. Safety DRAG_END khi blur [Fix #2: drag kẹt sau startDragging] ─────
  // Tauri webview có thể không nhận mouseup sau startDragging() (tauri#10767).
  // window.blur là fallback sync; onFocusChanged là Tauri-native nếu available.
  const onWindowBlur = (): void => {
    if (getPetState() === "drag") {
      petStore.send({ type: "DRAG_END" });
    }
  };
  window.addEventListener("blur", onWindowBlur);

  // Tauri-native focus listener (tốt hơn window.blur trong webview context)
  // Nếu API không available, window.blur fallback đã đủ — không throw.
  let unlistenFocus: (() => void) | undefined;
  try {
    unlistenFocus = await appWindow.onFocusChanged(({ payload: focused }) => {
      if (!focused && getPetState() === "drag") {
        petStore.send({ type: "DRAG_END" });
      }
    });
  } catch {
    // onFocusChanged không available → window.blur fallback đủ
  }

  // ── 8. TICK định kỳ ──────────────────────────────────────────────────────
  const tickInterval = window.setInterval(() => {
    petStore.send({ type: "TICK" });
  }, 5000);

  // ── 9. DEV auto-cycle demo [Fix #3: keyboard không ăn trên overlay] ──────
  let devCycleTimer = 0;
  if (DEV_MODE) {
    devCycleTimer = setupDevAutoCycle();
  }

  // ── 10. Start render loop ─────────────────────────────────────────────────
  loop.start();

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const cleanup = (): void => {
    loop.stop();
    subscription.unsubscribe();
    clearInterval(tickInterval);
    clearTimeout(animDoneTimer);
    if (devCycleTimer) clearInterval(devCycleTimer);
    unlistenFocus?.();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("blur", onWindowBlur);
    canvas.removeEventListener("mousedown", onMouseDown);
  };

  window.addEventListener("beforeunload", cleanup, { once: true });
  return cleanup;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Thiết lập canvas backing buffer theo devicePixelRatio (Retina support). */
function setupCanvasDpr(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || window.innerWidth;
  const cssH = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

/** Kiểm tra pointer nằm trong AABB của pet (logical px). */
function isPointerOnPet(
  e: MouseEvent,
  canvas: HTMLCanvasElement,
  position: { x: number; y: number }
): boolean {
  const rect = canvas.getBoundingClientRect();
  const localX = e.clientX - rect.left;
  const localY = e.clientY - rect.top;
  return (
    localX >= position.x &&
    localX <= position.x + PET_DISPLAY_WIDTH &&
    localY >= position.y &&
    localY <= position.y + PET_DISPLAY_HEIGHT
  );
}

/**
 * DEV-only: auto-cycle qua các state mỗi ~3s để verify animation bằng mắt.
 * Dùng timer vì overlay window không có keyboard focus → keydown không bắn.
 */
function setupDevAutoCycle(): number {
  type StoreEvent = Parameters<typeof petStore.send>[0];
  const cycle: Array<{ label: string; event: StoreEvent }> = [
    { label: "idle",      event: { type: "AGENT_EVENT", agentState: "idle" } },
    { label: "walk",      event: { type: "TICK" } },
    { label: "working",   event: { type: "AGENT_EVENT", agentState: "working" } },
    { label: "celebrate", event: { type: "AGENT_EVENT", agentState: "done_success" } },
    { label: "eat",       event: { type: "FEED" } },
    { label: "error",     event: { type: "AGENT_EVENT", agentState: "done_error" } },
    { label: "sleep",     event: { type: "SLEEP", forced: false } },
    { label: "wake",      event: { type: "WAKE" } },
  ];
  let stepIdx = 0;

  console.info(
    "[Copet DEV] Auto-cycle bật — mỗi 3s: idle→walk→working→celebrate→eat→error→sleep→wake"
  );

  return window.setInterval(() => {
    const step = cycle[stepIdx % cycle.length];
    petStore.send(step.event);
    console.debug(`[DEV] → ${step.label} | state=${getPetState()}`);
    stepIdx++;
  }, 3000);
}
