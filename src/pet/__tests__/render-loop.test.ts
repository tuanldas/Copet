/**
 * render-loop.test.ts
 * Pet đứng yên (anti-jitter):
 * - resting position = đáy-giữa cửa sổ (không còn center theo cả 2 trục)
 * - position BẤT BIẾN khi state=walk (đã bỏ dịch chuyển trong stepWalk)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { RenderLoop } from "../render-loop.js";
import type { AnimResolution } from "../animation-controller.js";

const PET_W = 96;
const PET_H = 104;

const RES: AnimResolution = { row: 0, frames: 4, fps: 8, loop: true };

/** Canvas tối thiểu đủ cho RenderLoop (chỉ đọc clientWidth/clientHeight). */
function fakeCanvas(w = 220, h = 220): HTMLCanvasElement {
  return { clientWidth: w, clientHeight: h } as unknown as HTMLCanvasElement;
}

describe("RenderLoop position (pet đứng yên)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("nghỉ ở giữa cửa sổ", () => {
    const loop = new RenderLoop(
      { petWidth: PET_W, petHeight: PET_H, canvas: fakeCanvas(220, 220) },
      RES,
      () => {},
    );
    expect(loop.position.x).toBe((220 - PET_W) / 2);
    expect(loop.position.y).toBe((220 - PET_H) / 2);
  });

  it("KHÔNG di chuyển pet khi đang walk", () => {
    const captured: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      captured.push(cb);
      return captured.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const loop = new RenderLoop(
      { petWidth: PET_W, petHeight: PET_H, canvas: fakeCanvas(220, 220) },
      RES,
      () => {},
    );
    const rest = { ...loop.position };

    loop.updateResolution(RES, "walk");
    loop.start();

    // Mô phỏng 60 frame (~1s @60fps); tick tự reschedule nên dùng cb mới nhất.
    let ts = 16;
    for (let i = 0; i < 60; i++) {
      captured[captured.length - 1](ts);
      ts += 16;
    }

    expect(loop.position).toEqual(rest);
    loop.stop();
  });
});
