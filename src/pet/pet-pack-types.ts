/**
 * pet-pack-types.ts
 * TS types cho schema pet.json theo chuẩn Petdex pet-pack.
 * Grid cố định: 8 rows × 9 cols, mỗi frame 192×208 px.
 * Thêm field `copet_extensions` để map các Copet state bổ sung (eat/sleep/drag/working/celebrate).
 */

/** Tên các row animation theo chuẩn Petdex (8 rows) */
export type PetdexRowName =
  | "idle"
  | "wave"
  | "run"
  | "failed"
  | "review"
  | "jump"
  | "extra1"
  | "extra2";

/** Định nghĩa 1 animation row trong pet.json */
export interface AnimRow {
  /** Tên định danh của animation */
  name: PetdexRowName;
  /** Số thứ tự hàng trong spritesheet (0-indexed) */
  row: number;
  /** Số frame hợp lệ trong hàng này (1..9) */
  frames: number;
  /** Tốc độ phát, frame/giây */
  fps: number;
  /** Phát vòng lặp hay dừng ở frame cuối (default: true) */
  loop?: boolean;
}

/** Grid metadata theo chuẩn Petdex: 8×9 */
export interface PetGrid {
  /** Số hàng (phải = 8 với Petdex standard) */
  rows: number;
  /** Số cột (phải = 9 với Petdex standard) */
  cols: number;
  /** Chiều rộng mỗi frame (px) */
  frameWidth: number;
  /** Chiều cao mỗi frame (px) */
  frameHeight: number;
}

/**
 * Copet mở rộng: map các state Copet bổ sung về hàng animation.
 * Dùng khi state không có row Petdex riêng → tái dùng row sẵn có.
 */
export interface CopetStateBinding {
  /** Row trong spritesheet (0-indexed) */
  row: number;
  /** Số frame dùng (≤ frames của row đó) */
  frames: number;
  /** FPS cho binding này (có thể khác fps mặc định của row) */
  fps: number;
  /** Phát loop? */
  loop?: boolean;
}

/**
 * Mapping từ tên Copet-state → CopetStateBinding.
 * Các Copet states bổ sung: eat, sleep, drag, working, celebrate, evolve.
 */
export interface CopetExtensions {
  eat?: CopetStateBinding;
  sleep?: CopetStateBinding;
  drag?: CopetStateBinding;
  working?: CopetStateBinding;
  celebrate?: CopetStateBinding;
  evolve?: CopetStateBinding;
  /** Cho phép thêm state tùy biến trong tương lai */
  [key: string]: CopetStateBinding | undefined;
}

/** Schema đầy đủ của file pet.json */
export interface PetPackSchema {
  /** ID định danh duy nhất của pet, dùng để load asset */
  id: string;
  /** Tên hiển thị */
  name: string;
  /** Phiên bản schema, hiện tại "1.0" */
  version: string;
  /** Đường dẫn tới file spritesheet (relative với pet.json) */
  spritesheet: string;
  /** Metadata grid: phải là 8×9, frame 192×208 */
  grid: PetGrid;
  /** Danh sách animation rows (Petdex standard: 8 rows) */
  anims: AnimRow[];
  /** Copet-specific state bindings (bổ sung, không bắt buộc) */
  copet_extensions?: CopetExtensions;
}

/** Kết quả sau khi loader parse và validate thành công */
export interface PetPack {
  /** Schema gốc từ pet.json */
  schema: PetPackSchema;
  /** Image đã load sẵn (spritesheet) */
  image: HTMLImageElement;
  /** Lookup nhanh: animName → AnimRow */
  animsByName: Map<string, AnimRow>;
}

/** Hằng số Petdex chuẩn — kiểm tra grid khi validate */
export const PETDEX_GRID_ROWS = 8 as const;
export const PETDEX_GRID_COLS = 9 as const;
export const PETDEX_FRAME_WIDTH = 192 as const;
export const PETDEX_FRAME_HEIGHT = 208 as const;
