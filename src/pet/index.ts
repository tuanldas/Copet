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
 *
 * Phase 07 additions (ADDITIVE — does not change render/drag/click-through core):
 * - mountPet now returns PetHandle in addition to cleanup function.
 * - PetHandle exposes sendAgentEvent(), setGlow(), playParticle().
 * - Glow state is stored and drawn as a canvas halo each render frame.
 * - Particle "hearts"/"sparkle" plays a one-shot canvas effect.
 * - All effects respect prefers-reduced-motion (skip particles, dim glow).
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { openHud } from "../ui/shared/tauri-commands.js";

import { loadPetPack } from "./pet-pack-loader.js";
import { SpritePlayer } from "./sprite-player.js";
import { AnimationController } from "./animation-controller.js";
import { RenderLoop } from "./render-loop.js";
import { petStore, getPetState, TRANSIENT_STATES } from "./pet-state-machine.js";
import type { AgentEventType } from "./pet-state-machine.js";
import type { AnimResolution } from "./animation-controller.js";
import { onPetDataChange, getPetData } from "../tamagotchi/pet-store.js";
import { findItem } from "../economy/item-catalog.js";

// ── Phase 07: PetHandle public API ───────────────────────────────────────────

/**
 * Public handle returned by mountPet().
 * agent-bridge uses this to push agent state + visual effects into the pet.
 * All methods are additive — they do not touch drag/click-through/anim core.
 */
export interface PetHandle {
  /** Send an AGENT_EVENT to the pet state machine. */
  sendAgentEvent(agentState: AgentEventType): void;
  /** Set glow halo color around the pet (null = no glow). */
  setGlow(color: string | null): void;
  /** Play a one-shot particle effect ("hearts" | "flash"). */
  playParticle(kind: "hearts" | "flash"): void;
  /** Returns current logical pet position (for tooltip positioning). */
  getPosition(): { x: number; y: number };
}

/** Particle burst descriptor (internal). */
interface ParticleBurst {
  kind: "hearts" | "flash";
  /** ms timestamp when the burst started */
  startedAt: number;
  /** Duration in ms */
  durationMs: number;
}

/** Glow/particle state — mutated by PetHandle methods, read by render callback. */
const _agentVisual = {
  glowColor: null as string | null,
  burst: null as ParticleBurst | null,
};

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
 * @returns object with cleanup function and PetHandle for agent-bridge (Phase 07)
 */
export async function mountPet(
  canvas: HTMLCanvasElement,
): Promise<{ cleanup: () => void; handle: PetHandle }> {
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

  // ── 3. Cosmetic overlay cache ─────────────────────────────────────────────
  // Pre-load overlay images keyed by URL so drawImage doesn't re-fetch per frame.
  const overlayCache = new Map<string, HTMLImageElement>();

  function getOverlayImage(url: string): HTMLImageElement | null {
    if (overlayCache.has(url)) return overlayCache.get(url)!;
    const img = new Image();
    img.src = url;
    img.decoding = "async";
    overlayCache.set(url, img);
    return img.complete ? img : null; // Return null until fully decoded.
  }

  // ── 4. Render loop ────────────────────────────────────────────────────────
  const loop = new RenderLoop(
    { petWidth: PET_DISPLAY_WIDTH, petHeight: PET_DISPLAY_HEIGHT, canvas },
    animCtrl.resolve(getPetState()),
    ({ frameIndex, position, timestamp }) => {
      player.clearAll();

      // Phase 07: draw glow halo BEFORE pet sprite so it sits behind the sprite.
      if (_agentVisual.glowColor) {
        drawGlow(ctx, position.x, position.y, _agentVisual.glowColor);
      }

      player.draw({
        row: animCtrl.resolve(getPetState()).row,
        col: frameIndex,
        destX: position.x,
        destY: position.y,
        destWidth: PET_DISPLAY_WIDTH,
        destHeight: PET_DISPLAY_HEIGHT,
      });

      // Draw cosmetic overlays after the pet sprite (same dest rect).
      drawCosmeticOverlays(ctx, position.x, position.y);

      // Phase 07: draw particle burst ABOVE everything.
      if (_agentVisual.burst) {
        const age = timestamp - _agentVisual.burst.startedAt;
        if (age < _agentVisual.burst.durationMs) {
          drawParticles(ctx, position.x, position.y, _agentVisual.burst, age);
        } else {
          _agentVisual.burst = null; // burst finished
        }
      }

      reportHitRect(position, timestamp);
    }
  );

  /**
   * Draw equipped cosmetic overlays onto the canvas context.
   * Overlays use the same destX/destY/size as the pet sprite so they align.
   * Called inside the render callback — no allocations per frame (cache lookup only).
   */
  function drawCosmeticOverlays(
    context: CanvasRenderingContext2D,
    destX: number,
    destY: number,
  ): void {
    const { equipped } = getPetData();
    const slotIds = [equipped.hat, equipped.accessory].filter(Boolean) as string[];

    for (const itemId of slotIds) {
      const catalogItem = findItem(itemId);
      if (!catalogItem || catalogItem.kind !== "cosmetic") continue;
      const img = getOverlayImage(catalogItem.overlaySprite);
      if (!img) continue; // Not yet decoded — skip this frame, shows next.
      context.drawImage(img, destX, destY, PET_DISPLAY_WIDTH, PET_DISPLAY_HEIGHT);
    }
  }

  // ── 5. Cosmetics subscription — force overlay redraw on equip/unequip ─────
  // When PetData.equipped changes the next render frame will pick it up via
  // getPetData() inside drawCosmeticOverlays(). The subscription here pre-warms
  // the image cache so the overlay appears without a 1-frame blank gap.
  const unsubCosmetics = onPetDataChange((data) => {
    const slotIds = [data.equipped.hat, data.equipped.accessory].filter(Boolean) as string[];
    for (const itemId of slotIds) {
      const catalogItem = findItem(itemId);
      if (catalogItem?.kind === "cosmetic") {
        getOverlayImage(catalogItem.overlaySprite); // warms cache
      }
    }
  });

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

  // ── Phase 06: right-click on pet canvas → open HUD ───────────────────────
  // Only fires when cursor is over the pet body (click-through already allows
  // events at that position). preventDefault stops the native context menu.
  const onContextMenu = (e: Event): void => {
    e.preventDefault();
    const me = e as MouseEvent;
    if (!isPointerOnPet(me, canvas, loop.position)) return;
    openHud().catch((err: unknown) => {
      console.warn("[mountPet] openHud failed:", err);
    });
  };
  canvas.addEventListener("contextmenu", onContextMenu);

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
    unsubCosmetics();
    clearInterval(tickInterval);
    clearTimeout(animDoneTimer);
    if (devCycleTimer) clearInterval(devCycleTimer);
    unlistenFocus?.();
    window.removeEventListener("resize", onResize);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("blur", onWindowBlur);
    canvas.removeEventListener("mousedown", onMouseDown);
    canvas.removeEventListener("contextmenu", onContextMenu);
    overlayCache.clear();
    // Reset Phase 07 visual state so HMR remount starts clean
    _agentVisual.glowColor = null;
    _agentVisual.burst = null;
  };

  window.addEventListener("beforeunload", cleanup, { once: true });

  // ── Phase 07: PetHandle implementation ───────────────────────────────────
  const handle: PetHandle = {
    sendAgentEvent(agentState: AgentEventType): void {
      petStore.send({ type: "AGENT_EVENT", agentState });
    },

    setGlow(color: string | null): void {
      // Store the raw hex color; reduced-motion dimming is applied in drawGlow
      // via ctx.globalAlpha — never mutate the hex string (appending "80" would
      // create a 10-char hex that confuses subsequent alpha appends in drawGlow).
      _agentVisual.glowColor = color;
    },

    playParticle(kind: "hearts" | "flash"): void {
      // Respect reduced-motion: skip particles entirely
      if (prefersReducedMotion()) return;
      _agentVisual.burst = {
        kind,
        startedAt: performance.now(),
        durationMs: kind === "flash" ? 400 : 1200,
      };
    },

    getPosition(): { x: number; y: number } {
      return { ...loop.position };
    },
  };

  return { cleanup, handle };
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

/** Phase 07: Check OS prefers-reduced-motion. */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Phase 07: Draw glow halo behind pet sprite.
 * Uses a radial gradient centred on the pet bounding box.
 * Reduced-motion: dims glow to 40% opacity via ctx.globalAlpha.
 * The color param must be a plain 6-char hex (e.g. "#3B82F6"); no alpha
 * suffix is appended to avoid creating invalid 10-char hex strings.
 */
function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  const cx = x + PET_DISPLAY_WIDTH / 2;
  const cy = y + PET_DISPLAY_HEIGHT / 2;
  const radius = Math.max(PET_DISPLAY_WIDTH, PET_DISPLAY_HEIGHT) * 0.75;

  // Use ctx.globalAlpha for reduced-motion dimming; gradient stops use
  // inline alpha on the hex (#rrggbbaa — 8-char CSS color, always valid).
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, color + "66");   // 40% alpha centre
  grad.addColorStop(0.5, color + "33"); // 20% alpha mid
  grad.addColorStop(1, color + "00");   // transparent edge

  ctx.save();
  // Reduced-motion: render at 40% of normal opacity so glow is subtle.
  ctx.globalAlpha = prefersReducedMotion() ? 0.4 : 1.0;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius, radius * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Phase 07: Draw one-shot particle burst (hearts / sparkle / flash).
 * progress is age/durationMs in [0,1]. Simple canvas-based particles.
 */
function drawParticles(
  ctx: CanvasRenderingContext2D,
  petX: number,
  petY: number,
  burst: { kind: "hearts" | "flash"; durationMs: number },
  ageMs: number,
): void {
  const progress = Math.min(ageMs / burst.durationMs, 1);

  ctx.save();

  if (burst.kind === "flash") {
    // Red flash overlay that fades out quickly
    const alpha = Math.max(0, 0.5 * (1 - progress * 2));
    ctx.fillStyle = `rgba(239,68,68,${alpha.toFixed(3)})`;
    ctx.fillRect(petX, petY, PET_DISPLAY_WIDTH, PET_DISPLAY_HEIGHT);
  } else {
    // "hearts": scatter 6 heart symbols upward from pet centre
    const SYMBOLS = ["♥", "♡", "♥"];
    const cx = petX + PET_DISPLAY_WIDTH / 2;
    const cy = petY + PET_DISPLAY_HEIGHT / 2;

    ctx.font = "14px serif";
    ctx.textAlign = "center";

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const spread = 36 * progress;
      const rise = 30 * progress;
      const px = cx + Math.cos(angle) * spread;
      const py = cy - rise - Math.sin(angle) * spread * 0.3;
      const alpha = Math.max(0, 1 - progress * 1.4);
      ctx.globalAlpha = alpha;
      ctx.fillText(SYMBOLS[i % SYMBOLS.length], px, py);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
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
