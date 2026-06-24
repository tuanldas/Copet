/**
 * render-loop.ts
 * requestAnimationFrame loop với:
 * - Pause tự động khi document hidden (visibilitychange) → tiết kiệm CPU
 * - Resume khi visible lại
 * - Pet đứng yên ở vị trí nghỉ (không roam); walk chỉ cycling frame tại chỗ
 * - FPS throttle: chỉ advance frame khi đủ thời gian theo fps của animation hiện tại
 */

import type { AnimResolution } from "./animation-controller.js";
import type { PetState } from "./pet-state-machine.js";

/** Callback được gọi mỗi frame render */
export type FrameCallback = (params: FrameParams) => void;

export interface FrameParams {
  /** Frame index hiện tại trong animation (0-indexed, đã wrap theo frames) */
  frameIndex: number;
  /** Timestamp từ rAF (ms, monotonic) */
  timestamp: number;
  /** Pet position hiện tại */
  position: PetPosition;
}

export interface PetPosition {
  x: number;
  y: number;
}

/** Config của render loop */
export interface RenderLoopConfig {
  /** Kích thước pet hiển thị (logical px) */
  petWidth: number;
  petHeight: number;
  /** Canvas element để tính bounds */
  canvas: HTMLCanvasElement;
}

/**
 * RenderLoop: quản lý rAF loop, frame timing, walk logic.
 * Tách biệt khỏi draw logic — chỉ tính "khi nào" và "frame nào".
 */
export class RenderLoop {
  private rafId = 0;
  private running = false;
  private frameIndex = 0;
  private lastFrameTime = 0;
  private currentResolution: AnimResolution;
  private currentState: PetState = "idle";
  private readonly callback: FrameCallback;

  /** Vị trí pet hiện tại (logical px, tính từ góc trên-trái của pet) */
  position: PetPosition;

  constructor(
    config: RenderLoopConfig,
    initialResolution: AnimResolution,
    callback: FrameCallback
  ) {
    this.currentResolution = initialResolution;
    this.callback = callback;

    // Vị trí nghỉ: GIỮA canvas (pet đứng yên) — đúng điểm khởi đầu cũ nên LUÔN
    // hiển thị. Fallback window.innerHeight + clamp ≥0 để pet không bao giờ rơi
    // ra ngoài cửa sổ dù clientWidth/Height chưa layout (=0) lúc khởi tạo.
    const canvas = config.canvas;
    const cw = canvas.clientWidth || window.innerWidth || 220;
    const ch = canvas.clientHeight || window.innerHeight || 220;
    this.position = {
      x: Math.max(0, (cw - config.petWidth) / 2),
      y: Math.max(0, (ch - config.petHeight) / 2),
    };
  }

  /** Cập nhật animation resolution khi state thay đổi */
  updateResolution(resolution: AnimResolution, state: PetState): void {
    const stateChanged = state !== this.currentState;
    this.currentResolution = resolution;
    this.currentState = state;
    // Reset frame khi đổi animation (tránh frame index vượt bounds mới)
    if (stateChanged) {
      this.frameIndex = 0;
      this.lastFrameTime = 0;
    }
  }

  /** Bắt đầu loop */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.rafId = requestAnimationFrame(this.tick);

    // Pause khi hidden, resume khi visible
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  /** Dừng loop hoàn toàn (unmount) */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.rafId);
    } else if (this.running) {
      // Reset lastFrameTime để tránh time-skip lớn sau khi ẩn
      this.lastFrameTime = 0;
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  private readonly tick = (timestamp: number): void => {
    if (!this.running) return;

    const { fps, frames, loop } = this.currentResolution;
    const msPerFrame = 1000 / fps;

    // Advance frame index khi đủ thời gian
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = timestamp;
    }
    const elapsed = timestamp - this.lastFrameTime;
    if (elapsed >= msPerFrame) {
      const steps = Math.floor(elapsed / msPerFrame);
      if (loop) {
        this.frameIndex = (this.frameIndex + steps) % frames;
      } else {
        this.frameIndex = Math.min(this.frameIndex + steps, frames - 1);
      }
      this.lastFrameTime = timestamp - (elapsed % msPerFrame);
    }

    this.callback({
      frameIndex: this.frameIndex,
      timestamp,
      position: { ...this.position },
    });

    this.rafId = requestAnimationFrame(this.tick);
  };
}
