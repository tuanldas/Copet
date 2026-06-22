/**
 * animation-controller.ts
 * Map từ PetState → (row, frameRange, fps) dựa trên PetPack schema.
 * Hỗ trợ reduced-motion: giảm/tắt bob và particle khi user bật prefers-reduced-motion.
 * Bảng map là data-driven (không hardcode rải rác) — thay đổi 1 chỗ, áp dụng toàn bộ.
 */

import type { PetPack, AnimRow, CopetStateBinding } from "./pet-pack-types.js";
import type { PetState } from "./pet-state-machine.js";

/** Kết quả resolve: thông tin cần thiết để SpritePlayer vẽ đúng frame */
export interface AnimResolution {
  /** Row trong spritesheet */
  row: number;
  /** Số frame hợp lệ trong row này */
  frames: number;
  /** FPS phát animation */
  fps: number;
  /** Phát loop hay dừng ở frame cuối */
  loop: boolean;
}

/**
 * Map từ PetdexRowName → PetState (các state Petdex base rows).
 * Thứ tự khớp với row index trong spritesheet (row 0 = idle, v.v.).
 */
const PETDEX_ROW_TO_STATE: Record<string, PetState> = {
  idle: "idle",
  wave: "celebrate", // wave dùng cho celebrate nếu không có copet_extension
  run: "walk",
  failed: "error",
  review: "working", // review/look = working anim nếu không có copet_extension
  jump: "celebrate",
  extra1: "eat",
  extra2: "sleep",
};

/** Fallback defaults khi không tìm thấy mapping */
const FALLBACK_ROW = 0; // idle row
const FALLBACK_FPS = 8;
const FALLBACK_FRAMES = 1;

/** Kiểm tra prefers-reduced-motion của OS */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * AnimationController: nhận PetPack, resolve PetState → AnimResolution.
 * Được tạo 1 lần khi mount, dùng lại trong suốt vòng đời pet.
 */
export class AnimationController {
  private readonly pack: PetPack;

  /** Cache map state → AnimResolution đã tính (tránh lookup lặp) */
  private readonly resolveCache = new Map<PetState, AnimResolution>();

  constructor(pack: PetPack) {
    this.pack = pack;
    this.buildCache();
  }

  /**
   * Build cache lần đầu khi khởi tạo.
   * Ưu tiên copet_extensions, sau đó PETDEX_ROW_TO_STATE, sau đó fallback.
   */
  private buildCache(): void {
    const states: PetState[] = [
      "idle", "walk", "drag", "sleep", "eat",
      "working", "celebrate", "error", "evolve",
    ];

    for (const state of states) {
      this.resolveCache.set(state, this.resolveForState(state));
    }
  }

  /** Resolve 1 state → AnimResolution (không cache) */
  private resolveForState(state: PetState): AnimResolution {
    const ext = this.pack.schema.copet_extensions;

    // 1. Thử copet_extensions trước (ưu tiên cao nhất)
    if (ext) {
      const binding: CopetStateBinding | undefined = ext[state];
      if (binding) {
        return {
          row: binding.row,
          frames: binding.frames,
          fps: binding.fps,
          loop: binding.loop ?? true,
        };
      }
    }

    // 2. Thử map Petdex row name → state
    for (const [rowName, mappedState] of Object.entries(PETDEX_ROW_TO_STATE)) {
      if (mappedState === state) {
        const animRow: AnimRow | undefined = this.pack.animsByName.get(rowName);
        if (animRow) {
          return {
            row: animRow.row,
            frames: animRow.frames,
            fps: animRow.fps,
            loop: animRow.loop ?? true,
          };
        }
      }
    }

    // 3. Fallback: dùng idle (row 0)
    const idleRow: AnimRow | undefined = this.pack.animsByName.get("idle");
    return {
      row: idleRow?.row ?? FALLBACK_ROW,
      frames: idleRow?.frames ?? FALLBACK_FRAMES,
      fps: idleRow?.fps ?? FALLBACK_FPS,
      loop: true,
    };
  }

  /**
   * Resolve PetState → AnimResolution.
   * Áp dụng reduced-motion: nếu user bật thì giảm fps xuống 4 (dừng bob nhanh).
   */
  resolve(state: PetState): AnimResolution {
    const base = this.resolveCache.get(state) ?? this.resolveForState(state);

    if (prefersReducedMotion()) {
      // Reduced-motion: giảm fps, giữ frame đầu (ít chuyển động hơn)
      return { ...base, fps: Math.min(base.fps, 4), frames: 1 };
    }

    return base;
  }

  /** Kiểm tra OS reduced-motion preference */
  get isReducedMotion(): boolean {
    return prefersReducedMotion();
  }
}
