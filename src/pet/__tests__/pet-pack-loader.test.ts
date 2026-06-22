/**
 * pet-pack-loader.test.ts
 * Unit tests cho PetPackLoader: parse pet.json hợp lệ + reject schema sai.
 * Dùng vitest. Mock fetch và Image để chạy được trong môi trường jsdom/happy-dom.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadPetPack, PetPackValidationError } from "../pet-pack-loader.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Schema pet.json hợp lệ (khớp với src/assets/pets/blobby/pet.json) */
function validSchema() {
  return {
    id: "blobby",
    name: "Blobby",
    version: "1.0",
    spritesheet: "spritesheet.png",
    grid: { rows: 8, cols: 9, frameWidth: 192, frameHeight: 208 },
    anims: [
      { name: "idle",   row: 0, frames: 6, fps: 8 },
      { name: "wave",   row: 1, frames: 9, fps: 10 },
      { name: "run",    row: 2, frames: 9, fps: 12 },
      { name: "failed", row: 3, frames: 9, fps: 8 },
      { name: "review", row: 4, frames: 6, fps: 8 },
      { name: "jump",   row: 5, frames: 9, fps: 12 },
      { name: "extra1", row: 6, frames: 9, fps: 8 },
      { name: "extra2", row: 7, frames: 9, fps: 6 },
    ],
    copet_extensions: {
      eat:       { row: 6, frames: 9, fps: 8 },
      sleep:     { row: 7, frames: 9, fps: 4 },
      drag:      { row: 5, frames: 9, fps: 12 },
      working:   { row: 4, frames: 6, fps: 8 },
      celebrate: { row: 1, frames: 9, fps: 12 },
      evolve:    { row: 5, frames: 9, fps: 14 },
    },
  };
}

/** Setup mock fetch trả về JSON cho pet.json */
function mockFetchJson(json: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => json,
  }));
}

/** Setup mock Image load thành công */
function mockImageSuccess() {
  const MockImage = vi.fn().mockImplementation(function (this: HTMLImageElement) {
    // Gọi onload ngay sau khi set src
    Object.defineProperty(this, "src", {
      set() { this.onload?.(); },
      get() { return ""; },
    });
  });
  vi.stubGlobal("Image", MockImage);
}

/** Setup mock Image load thất bại */
function mockImageFailure() {
  const MockImage = vi.fn().mockImplementation(function (this: HTMLImageElement) {
    Object.defineProperty(this, "src", {
      set() { this.onerror?.(); },
      get() { return ""; },
    });
  });
  vi.stubGlobal("Image", MockImage);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("loadPetPack", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Happy path
  it("parse pet.json hợp lệ và trả về PetPack đầy đủ", async () => {
    mockFetchJson(validSchema());
    mockImageSuccess();

    const pack = await loadPetPack("/assets/pets/blobby");

    expect(pack.schema.id).toBe("blobby");
    expect(pack.schema.grid.rows).toBe(8);
    expect(pack.schema.grid.cols).toBe(9);
    expect(pack.schema.anims).toHaveLength(8);
    expect(pack.image).toBeDefined();
  });

  it("build animsByName map đúng", async () => {
    mockFetchJson(validSchema());
    mockImageSuccess();

    const pack = await loadPetPack("/assets/pets/blobby");

    expect(pack.animsByName.get("idle")).toBeDefined();
    expect(pack.animsByName.get("idle")?.row).toBe(0);
    expect(pack.animsByName.get("wave")?.row).toBe(1);
    expect(pack.animsByName.get("extra2")?.row).toBe(7);
    expect(pack.animsByName.size).toBe(8);
  });

  it("parse copet_extensions thành công", async () => {
    mockFetchJson(validSchema());
    mockImageSuccess();

    const pack = await loadPetPack("/assets/pets/blobby");

    expect(pack.schema.copet_extensions?.eat?.row).toBe(6);
    expect(pack.schema.copet_extensions?.sleep?.fps).toBe(4);
    expect(pack.schema.copet_extensions?.celebrate?.row).toBe(1);
  });

  // Schema validation failures
  it("reject nếu fetch trả về HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(loadPetPack("/missing")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/missing")).rejects.toThrow("404");
  });

  it("reject nếu thiếu field id", async () => {
    const bad = { ...validSchema(), id: "" };
    mockFetchJson(bad);

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("id");
  });

  it("reject nếu grid.rows sai (bắt buộc = 8)", async () => {
    const bad = { ...validSchema(), grid: { rows: 4, cols: 9, frameWidth: 192, frameHeight: 208 } };
    mockFetchJson(bad);

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("grid.rows");
  });

  it("reject nếu grid.cols sai (bắt buộc = 9)", async () => {
    const bad = { ...validSchema(), grid: { rows: 8, cols: 8, frameWidth: 192, frameHeight: 208 } };
    mockFetchJson(bad);

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("grid.cols");
  });

  it("reject nếu grid.frameWidth sai (bắt buộc = 192)", async () => {
    const bad = { ...validSchema(), grid: { rows: 8, cols: 9, frameWidth: 64, frameHeight: 208 } };
    mockFetchJson(bad);

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("grid.frameWidth");
  });

  it("reject nếu grid.frameHeight sai (bắt buộc = 208)", async () => {
    const bad = { ...validSchema(), grid: { rows: 8, cols: 9, frameWidth: 192, frameHeight: 64 } };
    mockFetchJson(bad);

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("grid.frameHeight");
  });

  it("reject nếu anims rỗng", async () => {
    const bad = { ...validSchema(), anims: [] };
    mockFetchJson(bad);

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("anims");
  });

  it("reject nếu anim có row ngoài [0..7]", async () => {
    const bad = {
      ...validSchema(),
      anims: [{ name: "idle", row: 9, frames: 6, fps: 8 }],
    };
    mockFetchJson(bad);

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("row");
  });

  it("reject nếu anim có frames = 0", async () => {
    const bad = {
      ...validSchema(),
      anims: [{ name: "idle", row: 0, frames: 0, fps: 8 }],
    };
    mockFetchJson(bad);

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("frames");
  });

  it("reject nếu anim có fps = 0", async () => {
    const bad = {
      ...validSchema(),
      anims: [{ name: "idle", row: 0, frames: 6, fps: 0 }],
    };
    mockFetchJson(bad);

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("fps");
  });

  it("reject nếu spritesheet image không load được", async () => {
    mockFetchJson(validSchema());
    mockImageFailure();

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow("spritesheet");
  });

  it("reject nếu pet.json là chuỗi, không phải object", async () => {
    mockFetchJson("not an object");

    await expect(loadPetPack("/assets/pets/blobby")).rejects.toThrow(PetPackValidationError);
  });
});
