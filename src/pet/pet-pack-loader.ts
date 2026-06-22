/**
 * pet-pack-loader.ts
 * Fetch + parse + validate pet.json, load spritesheet image.
 * Reject nếu schema hoặc grid sai chuẩn Petdex (8×9, 192×208).
 * Expose PetPack cho các module khác dùng.
 */

import type {
  PetPackSchema,
  PetPack,
  AnimRow,
} from "./pet-pack-types.js";
import {
  PETDEX_GRID_ROWS,
  PETDEX_GRID_COLS,
  PETDEX_FRAME_WIDTH,
  PETDEX_FRAME_HEIGHT,
} from "./pet-pack-types.js";

/** Lỗi validate schema pet.json */
export class PetPackValidationError extends Error {
  constructor(message: string) {
    super(`[PetPackLoader] ${message}`);
    this.name = "PetPackValidationError";
  }
}

/**
 * Validate schema pet.json:
 * - Bắt buộc có id, name, version, spritesheet, grid, anims
 * - Grid phải đúng 8×9, frame 192×208
 * - Mỗi AnimRow: row ∈ [0..7], frames ∈ [1..9], fps > 0
 */
function validateSchema(raw: unknown): PetPackSchema {
  if (!raw || typeof raw !== "object") {
    throw new PetPackValidationError("pet.json phải là object JSON hợp lệ");
  }

  const obj = raw as Record<string, unknown>;

  // Kiểm tra các field bắt buộc
  const requiredStrings = ["id", "name", "version", "spritesheet"] as const;
  for (const key of requiredStrings) {
    if (typeof obj[key] !== "string" || !(obj[key] as string).trim()) {
      throw new PetPackValidationError(`Thiếu hoặc sai field: "${key}"`);
    }
  }

  // Validate grid
  const grid = obj["grid"];
  if (!grid || typeof grid !== "object") {
    throw new PetPackValidationError('Thiếu field "grid"');
  }
  const g = grid as Record<string, unknown>;

  if (g["rows"] !== PETDEX_GRID_ROWS) {
    throw new PetPackValidationError(
      `grid.rows phải là ${PETDEX_GRID_ROWS}, nhận được ${g["rows"]}`
    );
  }
  if (g["cols"] !== PETDEX_GRID_COLS) {
    throw new PetPackValidationError(
      `grid.cols phải là ${PETDEX_GRID_COLS}, nhận được ${g["cols"]}`
    );
  }
  if (g["frameWidth"] !== PETDEX_FRAME_WIDTH) {
    throw new PetPackValidationError(
      `grid.frameWidth phải là ${PETDEX_FRAME_WIDTH}, nhận được ${g["frameWidth"]}`
    );
  }
  if (g["frameHeight"] !== PETDEX_FRAME_HEIGHT) {
    throw new PetPackValidationError(
      `grid.frameHeight phải là ${PETDEX_FRAME_HEIGHT}, nhận được ${g["frameHeight"]}`
    );
  }

  // Validate anims array
  const anims = obj["anims"];
  if (!Array.isArray(anims) || anims.length === 0) {
    throw new PetPackValidationError('"anims" phải là mảng không rỗng');
  }

  for (let i = 0; i < anims.length; i++) {
    const anim = anims[i] as Record<string, unknown>;
    if (typeof anim["name"] !== "string") {
      throw new PetPackValidationError(`anims[${i}].name phải là string`);
    }
    const row = anim["row"];
    if (typeof row !== "number" || row < 0 || row >= PETDEX_GRID_ROWS) {
      throw new PetPackValidationError(
        `anims[${i}].row phải trong [0, ${PETDEX_GRID_ROWS - 1}]`
      );
    }
    const frames = anim["frames"];
    if (typeof frames !== "number" || frames < 1 || frames > PETDEX_GRID_COLS) {
      throw new PetPackValidationError(
        `anims[${i}].frames phải trong [1, ${PETDEX_GRID_COLS}]`
      );
    }
    const fps = anim["fps"];
    if (typeof fps !== "number" || fps <= 0) {
      throw new PetPackValidationError(`anims[${i}].fps phải > 0`);
    }
  }

  return raw as PetPackSchema;
}

/** Load ảnh từ URL, trả Promise<HTMLImageElement> */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new PetPackValidationError(`Không load được spritesheet: "${src}"`));
    img.src = src;
  });
}

/** Build lookup map animName → AnimRow */
function buildAnimsMap(anims: AnimRow[]): Map<string, AnimRow> {
  const map = new Map<string, AnimRow>();
  for (const anim of anims) {
    map.set(anim.name, anim);
  }
  return map;
}

/**
 * Load một pet-pack từ đường dẫn tới thư mục pet.
 * @param baseUrl - URL gốc chứa pet.json và spritesheet, VD: "/assets/pets/blobby"
 * @returns Promise<PetPack> — resolved khi cả JSON lẫn image đã sẵn sàng
 * @throws PetPackValidationError nếu schema sai hoặc không load được asset
 */
export async function loadPetPack(baseUrl: string): Promise<PetPack> {
  const jsonUrl = `${baseUrl}/pet.json`;

  // Fetch và parse pet.json
  let raw: unknown;
  try {
    const res = await fetch(jsonUrl);
    if (!res.ok) {
      throw new PetPackValidationError(
        `Không fetch được pet.json (HTTP ${res.status}): ${jsonUrl}`
      );
    }
    raw = await res.json();
  } catch (err) {
    if (err instanceof PetPackValidationError) throw err;
    throw new PetPackValidationError(
      `Lỗi khi fetch/parse pet.json: ${String(err)}`
    );
  }

  // Validate schema
  const schema = validateSchema(raw);

  // Load spritesheet (đường dẫn relative với baseUrl)
  const sheetUrl = `${baseUrl}/${schema.spritesheet}`;
  const image = await loadImage(sheetUrl);

  const animsByName = buildAnimsMap(schema.anims);

  return { schema, image, animsByName };
}
