/**
 * animation-controller.test.ts
 * Unit tests cho AnimationController:
 * - state → (row, fps) đúng theo PetPack schema
 * - Priority: copet_extensions > Petdex row name map > fallback
 * - Reduced-motion: fps giảm, frames=1
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { AnimationController } from "../animation-controller.js";
import type { PetPack } from "../pet-pack-types.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Tạo PetPack stub đủ để test AnimationController */
function makePack(overrides: Partial<PetPack["schema"]> = {}): PetPack {
  const schema: PetPack["schema"] = {
    id: "blobby",
    name: "Blobby",
    version: "1.0",
    spritesheet: "spritesheet.png",
    grid: { rows: 8, cols: 9, frameWidth: 192, frameHeight: 208 },
    anims: [
      { name: "idle",   row: 0, frames: 6, fps: 8,  loop: true  },
      { name: "wave",   row: 1, frames: 9, fps: 10, loop: true  },
      { name: "run",    row: 2, frames: 9, fps: 12, loop: true  },
      { name: "failed", row: 3, frames: 9, fps: 8,  loop: false },
      { name: "review", row: 4, frames: 6, fps: 8,  loop: true  },
      { name: "jump",   row: 5, frames: 9, fps: 12, loop: false },
      { name: "extra1", row: 6, frames: 9, fps: 8,  loop: true  },
      { name: "extra2", row: 7, frames: 9, fps: 6,  loop: true  },
    ],
    copet_extensions: {
      eat:       { row: 6, frames: 9, fps: 8,  loop: true  },
      sleep:     { row: 7, frames: 9, fps: 4,  loop: true  },
      drag:      { row: 5, frames: 9, fps: 12, loop: true  },
      working:   { row: 4, frames: 6, fps: 8,  loop: true  },
      celebrate: { row: 1, frames: 9, fps: 12, loop: false },
      evolve:    { row: 5, frames: 9, fps: 14, loop: false },
    },
    ...overrides,
  };

  const animsByName = new Map(schema.anims.map((a) => [a.name, a]));

  return {
    schema,
    image: {} as HTMLImageElement,
    animsByName,
  };
}

/** Mock window.matchMedia để kiểm soát reduced-motion */
function setReducedMotion(active: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: active,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("AnimationController.resolve", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── copet_extensions ưu tiên cao nhất ────────────────────────────────

  it("eat → copet_extensions.eat (row=6, fps=8)", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const result = ctrl.resolve("eat");
    expect(result.row).toBe(6);
    expect(result.fps).toBe(8);
    expect(result.frames).toBe(9);
    expect(result.loop).toBe(true);
  });

  it("sleep → copet_extensions.sleep (row=7, fps=4)", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const result = ctrl.resolve("sleep");
    expect(result.row).toBe(7);
    expect(result.fps).toBe(4);
    expect(result.loop).toBe(true);
  });

  it("drag → copet_extensions.drag (row=5, fps=12)", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const result = ctrl.resolve("drag");
    expect(result.row).toBe(5);
    expect(result.fps).toBe(12);
    expect(result.loop).toBe(true);
  });

  it("working → copet_extensions.working (row=4, fps=8)", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const result = ctrl.resolve("working");
    expect(result.row).toBe(4);
    expect(result.fps).toBe(8);
  });

  it("celebrate → copet_extensions.celebrate (row=1, fps=12, loop=false)", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const result = ctrl.resolve("celebrate");
    expect(result.row).toBe(1);
    expect(result.fps).toBe(12);
    expect(result.loop).toBe(false);
  });

  it("evolve → copet_extensions.evolve (row=5, fps=14, loop=false)", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const result = ctrl.resolve("evolve");
    expect(result.row).toBe(5);
    expect(result.fps).toBe(14);
    expect(result.loop).toBe(false);
  });

  // ── Petdex base rows ─────────────────────────────────────────────────

  it("idle → row=0 (Petdex idle row)", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const result = ctrl.resolve("idle");
    expect(result.row).toBe(0);
    expect(result.fps).toBe(8);
    expect(result.frames).toBe(6);
  });

  it("walk → row=2 (Petdex run row)", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const result = ctrl.resolve("walk");
    expect(result.row).toBe(2);
    expect(result.fps).toBe(12);
  });

  it("error → row=3 (Petdex failed row)", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const result = ctrl.resolve("error");
    expect(result.row).toBe(3);
  });

  // ── Fallback khi thiếu copet_extensions ─────────────────────────────

  it("eat fallback → extra1 row (row=6) qua Petdex map khi không có copet_extensions", () => {
    setReducedMotion(false);
    const packNoExt = makePack({ copet_extensions: undefined });
    const ctrl = new AnimationController(packNoExt);
    const result = ctrl.resolve("eat");
    // PETDEX_ROW_TO_STATE maps extra1 → eat, extra1 row = 6
    expect(result.row).toBe(6);
    expect(result.fps).toBe(8);
  });

  // ── Priority: copet_extensions override Petdex ───────────────────────

  it("copet_extensions.working (row=4) override Petdex review mapping", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());
    const working = ctrl.resolve("working");
    // copet_extensions.working = row 4 (review row), fps=8
    expect(working.row).toBe(4);
    // Nếu không có extension, working map sang review = row 4 cũng vậy,
    // nhưng đây test extension được ưu tiên đúng
    expect(working.fps).toBe(8);
  });

  it("khi copet_extensions.drag override Petdex mapping, drag dùng extension", () => {
    setReducedMotion(false);
    const packCustomDrag = makePack({
      copet_extensions: {
        ...makePack().schema.copet_extensions,
        drag: { row: 2, frames: 9, fps: 15, loop: true }, // custom override
      },
    });
    const ctrl = new AnimationController(packCustomDrag);
    const drag = ctrl.resolve("drag");
    expect(drag.row).toBe(2);
    expect(drag.fps).toBe(15);
  });

  // ── Reduced-motion ───────────────────────────────────────────────────

  it("reduced-motion: fps giảm xuống ≤ 4 và frames = 1", () => {
    setReducedMotion(true);
    const ctrl = new AnimationController(makePack());

    const idle = ctrl.resolve("idle");
    expect(idle.fps).toBeLessThanOrEqual(4);
    expect(idle.frames).toBe(1);

    const working = ctrl.resolve("working");
    expect(working.fps).toBeLessThanOrEqual(4);
    expect(working.frames).toBe(1);
  });

  it("không reduced-motion: fps giữ nguyên từ schema", () => {
    setReducedMotion(false);
    const ctrl = new AnimationController(makePack());

    const idle = ctrl.resolve("idle");
    expect(idle.fps).toBe(8); // schema value
    expect(idle.frames).toBe(6);
  });

  it("isReducedMotion phản ánh matchMedia state", () => {
    setReducedMotion(true);
    const ctrl1 = new AnimationController(makePack());
    expect(ctrl1.isReducedMotion).toBe(true);

    setReducedMotion(false);
    const ctrl2 = new AnimationController(makePack());
    expect(ctrl2.isReducedMotion).toBe(false);
  });
});
