/**
 * sprite-player.ts
 * Vẽ 1 frame từ spritesheet lên canvas 2D context.
 * Luôn tắt imageSmoothingEnabled để giữ chất lượng pixel-art.
 */

import type { PetPack } from "./pet-pack-types.js";

export interface DrawFrameOptions {
  /** Hàng animation trong spritesheet (0-indexed) */
  row: number;
  /** Cột / frame index trong hàng đó (0-indexed) */
  col: number;
  /** Tọa độ X vẽ trên canvas (logical px) */
  destX: number;
  /** Tọa độ Y vẽ trên canvas (logical px) */
  destY: number;
  /** Chiều rộng hiển thị (logical px) — khác frameWidth để hỗ trợ scale */
  destWidth: number;
  /** Chiều cao hiển thị (logical px) */
  destHeight: number;
}

/**
 * SpritePlayer: nhận PetPack + CanvasRenderingContext2D,
 * cung cấp method `draw()` để render 1 frame bất kỳ.
 */
export class SpritePlayer {
  private readonly pack: PetPack;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(pack: PetPack, ctx: CanvasRenderingContext2D) {
    this.pack = pack;
    this.ctx = ctx;
  }

  /**
   * Vẽ 1 frame lên canvas.
   * Tắt imageSmoothingEnabled trước mỗi lần vẽ để đảm bảo pixel-art sắc nét,
   * kể cả khi ctx bị reset ở chỗ khác.
   */
  draw(options: DrawFrameOptions): void {
    const { row, col, destX, destY, destWidth, destHeight } = options;
    const { frameWidth, frameHeight } = this.pack.schema.grid;

    // Tọa độ nguồn trong spritesheet
    const srcX = col * frameWidth;
    const srcY = row * frameHeight;

    // Tắt smoothing: giữ cạnh sắc của pixel-art
    this.ctx.imageSmoothingEnabled = false;

    this.ctx.drawImage(
      this.pack.image,
      srcX,
      srcY,
      frameWidth,
      frameHeight,
      destX,
      destY,
      destWidth,
      destHeight
    );
  }

  /** Xóa vùng canvas tại vị trí pet (trước mỗi frame để tránh ghost) */
  clear(x: number, y: number, width: number, height: number): void {
    this.ctx.clearRect(x, y, width, height);
  }

  /** Xóa toàn bộ canvas */
  clearAll(): void {
    const canvas = this.ctx.canvas;
    this.ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
  }
}
