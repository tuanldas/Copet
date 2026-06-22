/**
 * render-loop.ts
 * requestAnimationFrame loop với:
 * - Pause tự động khi document hidden (visibilitychange) → tiết kiệm CPU
 * - Resume khi visible lại
 * - Walk clamp: giữ pet trong window bounds
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

/** Walk vector: hướng và tốc độ di chuyển */
interface WalkVector {
  dx: number;
  dy: number;
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
  private readonly config: RenderLoopConfig;

  /** Vị trí pet hiện tại (logical px, tính từ góc trên-trái của pet) */
  position: PetPosition;

  /** Walk vector ngẫu nhiên, đổi mỗi khi bắt đầu walk */
  private walkVector: WalkVector = { dx: 0, dy: 0 };
  /** Bộ đếm bước walk (tick) trước khi đổi hướng */
  private walkStepsLeft = 0;

  constructor(
    config: RenderLoopConfig,
    initialResolution: AnimResolution,
    callback: FrameCallback
  ) {
    this.config = config;
    this.currentResolution = initialResolution;
    this.callback = callback;

    // Bắt đầu ở giữa canvas
    const canvas = config.canvas;
    this.position = {
      x: (canvas.clientWidth - config.petWidth) / 2,
      y: (canvas.clientHeight - config.petHeight) / 2,
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

    // Walk logic: update vị trí nếu đang walk
    if (this.currentState === "walk") {
      this.stepWalk();
    }

    this.callback({
      frameIndex: this.frameIndex,
      timestamp,
      position: { ...this.position },
    });

    this.rafId = requestAnimationFrame(this.tick);
  };

  /**
   * Di chuyển pet theo walk vector, clamp trong bounds canvas.
   * Đổi hướng ngẫu nhiên sau mỗi walkStepsLeft bước.
   */
  private stepWalk(): void {
    if (this.walkStepsLeft <= 0) {
      // Chọn hướng ngẫu nhiên mới (tốc độ 1–2 px/frame)
      const speed = 1 + Math.random() * 1;
      const angle = Math.random() * Math.PI * 2;
      this.walkVector = {
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
      };
      // Di chuyển 60–180 frame trước khi đổi hướng (~1–3s @ 60fps)
      this.walkStepsLeft = 60 + Math.floor(Math.random() * 120);
    }

    const canvas = this.config.canvas;
    const maxX = canvas.clientWidth - this.config.petWidth;
    const maxY = canvas.clientHeight - this.config.petHeight;

    let newX = this.position.x + this.walkVector.dx;
    let newY = this.position.y + this.walkVector.dy;

    // Bounce lại khi chạm biên
    if (newX < 0 || newX > maxX) {
      this.walkVector.dx *= -1;
      newX = Math.max(0, Math.min(maxX, newX));
    }
    if (newY < 0 || newY > maxY) {
      this.walkVector.dy *= -1;
      newY = Math.max(0, Math.min(maxY, newY));
    }

    this.position = { x: newX, y: newY };
    this.walkStepsLeft--;
  }
}
