/**
 * gen-pet-spritesheet.mjs
 * Sinh spritesheet pixel-art cho pet "Blobby" bằng pngjs (thuần JS, không cần Canvas).
 *
 * Grid: 8 rows × 9 cols, mỗi frame 192×208 px → sheet tổng 1728×1664 px
 * Nền trong suốt (alpha=0).
 *
 * Rows:
 *   0: idle   — bob nhẹ + blink (6 frames)
 *   1: wave   — vẫy tay (9 frames)
 *   2: run    — chạy/dịch chân (9 frames)
 *   3: failed — xịu/buồn (9 frames)
 *   4: review — nhìn nghiêng (6 frames)
 *   5: jump   — nhảy lên (9 frames)
 *   6: extra1 — ăn (bob mạnh + particle) (9 frames)
 *   7: extra2 — ngủ (nhắm mắt, thở chậm) (9 frames)
 *
 * Chạy: node scripts/gen-pet-spritesheet.mjs
 * Output: src/assets/pets/blobby/spritesheet.png
 */

import { createWriteStream } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import { copyFileSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Hằng số grid (nhất quán với pet.json) ─────────────────────────────────
const GRID_COLS = 9;
const GRID_ROWS = 8;
const FRAME_W = 192;
const FRAME_H = 208;
const SHEET_W = FRAME_W * GRID_COLS; // 1728
const SHEET_H = FRAME_H * GRID_ROWS; // 1664

// ── Palette brand ──────────────────────────────────────────────────────────
const VIOLET  = [0x8b, 0x5c, 0xf6, 255]; // body #8B5CF6
const VIOLET_D= [0x6d, 0x28, 0xd9, 255]; // body shadow
const VIOLET_L= [0xa7, 0x8b, 0xfa, 255]; // body highlight
const WHITE   = [0xff, 0xff, 0xff, 255]; // eye white
const BLACK   = [0x1e, 0x1e, 0x2e, 255]; // pupil / outline
const PINK    = [0xfb, 0x7f, 0x85, 255]; // blush / tongue
const YELLOW  = [0xfb, 0xd3, 0x5a, 255]; // star particle
const TEAL    = [0x22, 0xd3, 0xee, 255]; // zzz particle
const TRANS   = [0, 0, 0, 0];            // trong suốt

// ── Utilities ──────────────────────────────────────────────────────────────

/** Đặt pixel tại (x,y) trong PNG data buffer */
function setPixel(data, w, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= w || y >= SHEET_H) return;
  const idx = (y * w + x) * 4;
  data[idx]     = r;
  data[idx + 1] = g;
  data[idx + 2] = b;
  data[idx + 3] = a;
}

/** Vẽ hình chữ nhật đặc */
function fillRect(data, w, x, y, rw, rh, color) {
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++)
      setPixel(data, w, x + dx, y + dy, color);
}

/** Vẽ đường tròn đặc (Bresenham circle fill) */
function fillCircle(data, w, cx, cy, r, color) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        setPixel(data, w, cx + dx, cy + dy, color);
      }
    }
  }
}

/** Vẽ đường tròn viền (không fill) */
function strokeCircle(data, w, cx, cy, r, color) {
  for (let angle = 0; angle < 360; angle++) {
    const rad = (angle * Math.PI) / 180;
    const px = Math.round(cx + r * Math.cos(rad));
    const py = Math.round(cy + r * Math.sin(rad));
    setPixel(data, w, px, py, color);
  }
}

/**
 * Vẽ thân Blobby: hình blob tròn với highlight và shadow.
 * @param frameX/frameY - góc trên-trái của frame trong sheet
 * @param bobOffset - pixel dịch dọc để tạo bob (0 = baseline)
 * @param squashY - pixel co nén chiều dọc (dương = squash, âm = stretch)
 */
function drawBody(data, w, frameX, frameY, bobOffset = 0, squashY = 0) {
  const cx = frameX + FRAME_W / 2;
  const cy = frameY + FRAME_H / 2 + 20 + bobOffset; // +20 dịch xuống chút
  const rx = 52; // bán kính ngang
  const ry = 52 + squashY; // bán kính dọc (squash/stretch)

  // Ellipse xấp xỉ bằng vòng lặp
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const dist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (dist > 1) continue;

      // Highlight ở góc trên-trái, shadow ở dưới-phải
      const norm = Math.sqrt(dist);
      let color;
      if (dx < -20 && dy < -20 && norm < 0.6) {
        color = VIOLET_L; // highlight
      } else if (dx > 20 && dy > 20) {
        color = VIOLET_D; // shadow
      } else {
        color = VIOLET;   // body
      }
      setPixel(data, w, cx + dx, cy + dy, color);
    }
  }

  // Outline đậm
  strokeCircle(data, w, cx, cy, rx, BLACK);
}

/**
 * Vẽ mắt Blobby.
 * @param blink true = nhắm mắt (chỉ vẽ line ngang)
 * @param lookDir -1=trái, 0=thẳng, 1=phải (dịch pupil)
 */
function drawEyes(data, w, frameX, frameY, bobOffset = 0, blink = false, lookDir = 0) {
  const cy = frameY + FRAME_H / 2 + bobOffset - 5;
  const lx = frameX + FRAME_W / 2 - 18;
  const rx = frameX + FRAME_W / 2 + 18;

  if (blink) {
    // Nhắm mắt: đường ngang
    fillRect(data, w, lx - 8, cy, 16, 3, BLACK);
    fillRect(data, w, rx - 8, cy, 16, 3, BLACK);
    return;
  }

  // Mắt trắng (whites)
  fillCircle(data, w, lx, cy, 9, WHITE);
  fillCircle(data, w, rx, cy, 9, WHITE);

  // Pupil (đen) — dịch theo lookDir
  const pd = lookDir * 3; // pixel dịch pupil
  fillCircle(data, w, lx + pd, cy + 1, 4, BLACK);
  fillCircle(data, w, rx + pd, cy + 1, 4, BLACK);

  // Highlight pupil nhỏ
  setPixel(data, w, lx + pd - 2, cy - 1, WHITE);
  setPixel(data, w, rx + pd - 2, cy - 1, WHITE);
}

/** Vẽ má hồng (blush) */
function drawBlush(data, w, frameX, frameY, bobOffset = 0) {
  const cy = frameY + FRAME_H / 2 + bobOffset + 10;
  const lx = frameX + FRAME_W / 2 - 28;
  const rx = frameX + FRAME_W / 2 + 28;
  fillCircle(data, w, lx, cy, 6, [...PINK.slice(0, 3), 120]);
  fillCircle(data, w, rx, cy, 6, [...PINK.slice(0, 3), 120]);
}

/** Vẽ tay (cánh tay nhỏ) ở vị trí (side=-1 trái, 1 phải), offset Y */
function drawArm(data, w, frameX, frameY, bobOffset, side, armY) {
  const cx = frameX + FRAME_W / 2 + side * 55;
  const cy = frameY + FRAME_H / 2 + bobOffset + armY;
  fillCircle(data, w, cx, cy, 10, VIOLET);
  strokeCircle(data, w, cx, cy, 10, BLACK);
}

/** Vẽ chân (2 chân nhỏ dưới body) với offset ngang để mô phỏng bước */
function drawLegs(data, w, frameX, frameY, bobOffset, stepOffset = 0) {
  const cy = frameY + FRAME_H / 2 + bobOffset + 55;
  const lx = frameX + FRAME_W / 2 - 22 + stepOffset;
  const rx = frameX + FRAME_W / 2 + 22 - stepOffset;
  fillCircle(data, w, lx, cy, 10, VIOLET_D);
  strokeCircle(data, w, lx, cy, 10, BLACK);
  fillCircle(data, w, rx, cy, 10, VIOLET_D);
  strokeCircle(data, w, rx, cy, 10, BLACK);
}

/** Vẽ particle ngôi sao tại (px, py) kích thước size */
function drawStar(data, w, px, py, size, color) {
  setPixel(data, w, px, py, color);
  for (let i = 1; i <= size; i++) {
    setPixel(data, w, px + i, py, color);
    setPixel(data, w, px - i, py, color);
    setPixel(data, w, px, py + i, color);
    setPixel(data, w, px, py - i, color);
  }
}

/** Vẽ chữ Z nhỏ (zzz sleeping) tại vị trí */
function drawZ(data, w, px, py, scale = 1) {
  const s = scale;
  // Nét trên Z
  fillRect(data, w, px, py, 5 * s, s, TEAL);
  // Nét chéo
  for (let i = 0; i < 5 * s; i++) fillRect(data, w, px + 4 * s - i, py + i, s, s, TEAL);
  // Nét dưới Z
  fillRect(data, w, px, py + 4 * s, 5 * s, s, TEAL);
}

// ── Vẽ từng row ────────────────────────────────────────────────────────────

/**
 * Row 0: idle — bob nhẹ + blink ở frame 3
 * 6 frames: f0..f5, blink tại f2 và f5
 */
function drawRowIdle(data, w, rowY) {
  const NUM = 6;
  const bobs = [0, -2, -3, -2, 0, 1]; // pixel bob lên xuống
  const blinks = [false, false, true, false, false, true];

  for (let f = 0; f < NUM; f++) {
    const fx = f * FRAME_W;
    drawBody(data, w, fx, rowY, bobs[f]);
    drawEyes(data, w, fx, rowY, bobs[f], blinks[f]);
    drawBlush(data, w, fx, rowY, bobs[f]);
    drawLegs(data, w, fx, rowY, bobs[f]);
  }
  // Frame 6..8: copy frame 0 (blank/idle padding)
  for (let f = NUM; f < GRID_COLS; f++) {
    const fx = f * FRAME_W;
    drawBody(data, w, fx, rowY, 0);
    drawEyes(data, w, fx, rowY, 0, false);
    drawBlush(data, w, fx, rowY, 0);
    drawLegs(data, w, fx, rowY, 0);
  }
}

/**
 * Row 1: wave — vẫy tay phải lên xuống
 * 9 frames
 */
function drawRowWave(data, w, rowY) {
  for (let f = 0; f < GRID_COLS; f++) {
    const fx = f * FRAME_W;
    const phase = (f / (GRID_COLS - 1)) * Math.PI * 2;
    const bob = Math.round(Math.sin(phase) * 3);
    const armY = Math.round(Math.sin(phase) * 20) - 15; // tay vẫy
    drawBody(data, w, fx, rowY, bob);
    drawEyes(data, w, fx, rowY, bob, false, 1); // nhìn phải khi vẫy
    drawBlush(data, w, fx, rowY, bob);
    drawArm(data, w, fx, rowY, bob, 1, armY);  // tay phải vẫy
    drawArm(data, w, fx, rowY, bob, -1, 15);   // tay trái thả
    drawLegs(data, w, fx, rowY, bob);
  }
}

/**
 * Row 2: run — dịch chân luân phiên, bob nảy
 * 9 frames
 */
function drawRowRun(data, w, rowY) {
  for (let f = 0; f < GRID_COLS; f++) {
    const fx = f * FRAME_W;
    const phase = (f / GRID_COLS) * Math.PI * 2;
    const bob = f % 2 === 0 ? -4 : 0; // nảy mỗi 2 frame
    const step = Math.round(Math.sin(phase) * 8);
    drawBody(data, w, fx, rowY, bob);
    drawEyes(data, w, fx, rowY, bob, false, 1); // nhìn phải (hướng chạy)
    drawBlush(data, w, fx, rowY, bob);
    drawArm(data, w, fx, rowY, bob, 1, -step / 2);
    drawArm(data, w, fx, rowY, bob, -1, step / 2);
    drawLegs(data, w, fx, rowY, bob, step);
  }
}

/**
 * Row 3: failed/error — xịu, mắt × , drop dần
 * 9 frames
 */
function drawRowFailed(data, w, rowY) {
  for (let f = 0; f < GRID_COLS; f++) {
    const fx = f * FRAME_W;
    const droop = Math.min(f * 3, 16); // sụp dần
    const squash = Math.min(f, 6);     // bẹp dần

    drawBody(data, w, fx, rowY, droop, -squash);
    // Mắt × = vẽ 2 đường chéo thay mắt thường
    const eyeCy = rowY + FRAME_H / 2 + droop - 5;
    const lx = fx + FRAME_W / 2 - 18;
    const rx = fx + FRAME_W / 2 + 18;
    // X mắt trái
    for (let i = -6; i <= 6; i++) {
      setPixel(data, w, lx + i, eyeCy + i, BLACK);
      setPixel(data, w, lx - i, eyeCy + i, BLACK);
    }
    // X mắt phải
    for (let i = -6; i <= 6; i++) {
      setPixel(data, w, rx + i, eyeCy + i, BLACK);
      setPixel(data, w, rx - i, eyeCy + i, BLACK);
    }
    drawBlush(data, w, fx, rowY, droop);
    drawLegs(data, w, fx, rowY, droop, 0);
  }
}

/**
 * Row 4: review/look — nhìn trái-phải, nghiêng đầu
 * 6 frames (f6..f8 padding)
 */
function drawRowReview(data, w, rowY) {
  const NUM = 6;
  // Cycle: 0=thẳng, 1=nhìn phải, 2=nhìn phải hơn, 3=thẳng, 4=nhìn trái, 5=nhìn trái hơn
  const looks = [0, 1, 1, 0, -1, -1];
  const bobs  = [0, 0, -1, 0, 0, -1];

  for (let f = 0; f < NUM; f++) {
    const fx = f * FRAME_W;
    drawBody(data, w, fx, rowY, bobs[f]);
    drawEyes(data, w, fx, rowY, bobs[f], false, looks[f]);
    drawBlush(data, w, fx, rowY, bobs[f]);
    drawLegs(data, w, fx, rowY, bobs[f]);
  }
  for (let f = NUM; f < GRID_COLS; f++) {
    const fx = f * FRAME_W;
    drawBody(data, w, fx, rowY, 0);
    drawEyes(data, w, fx, rowY, 0, false, 0);
    drawBlush(data, w, fx, rowY, 0);
    drawLegs(data, w, fx, rowY, 0);
  }
}

/**
 * Row 5: jump — nhảy lên rồi đáp xuống, squash khi đáp
 * 9 frames
 */
function drawRowJump(data, w, rowY) {
  // Arc: lên (f0-f3) → đỉnh (f4) → xuống (f5-f7) → đáp squash (f8)
  const bobArr   = [0, -10, -20, -30, -35, -28, -15, -5, 4];
  const squashArr= [0,   0,   0,   0,   0,   0,   0,  0, 8];

  for (let f = 0; f < GRID_COLS; f++) {
    const fx = f * FRAME_W;
    drawBody(data, w, fx, rowY, bobArr[f], squashArr[f]);
    const blink = f === 8; // nhắm mắt khi đáp
    drawEyes(data, w, fx, rowY, bobArr[f], blink);
    drawBlush(data, w, fx, rowY, bobArr[f]);
    drawLegs(data, w, fx, rowY, bobArr[f], f < 4 ? -5 : 5);
    // Star particles ở đỉnh jump
    if (f === 4) {
      drawStar(data, w, fx + FRAME_W / 2 - 50, rowY + FRAME_H / 2 - 50, 4, YELLOW);
      drawStar(data, w, fx + FRAME_W / 2 + 50, rowY + FRAME_H / 2 - 50, 4, YELLOW);
    }
  }
}

/**
 * Row 6: extra1 (eat) — nhai, bob mạnh, particle ở miệng
 * 9 frames
 */
function drawRowExtra1(data, w, rowY) {
  for (let f = 0; f < GRID_COLS; f++) {
    const fx = f * FRAME_W;
    const phase = (f / GRID_COLS) * Math.PI * 2;
    const bob = Math.round(Math.sin(phase) * 5);
    drawBody(data, w, fx, rowY, bob);
    drawEyes(data, w, fx, rowY, bob, f % 3 === 2); // blink mỗi 3 frame
    drawBlush(data, w, fx, rowY, bob);
    drawLegs(data, w, fx, rowY, bob);
    // Vẽ "miệng nhai" — hình chữ U nhỏ
    const mx = fx + FRAME_W / 2;
    const my = rowY + FRAME_H / 2 + bob + 18;
    fillRect(data, w, mx - 8, my, 16, 4, PINK);
    // Particle thức ăn nhỏ (ngẫu nhiên nhưng deterministic theo f)
    if (f % 2 === 0) {
      drawStar(data, w, mx + 20, my - 15, 2, YELLOW);
    }
  }
}

/**
 * Row 7: extra2 (sleep) — nhắm mắt, thở chậm, zzz
 * 9 frames
 */
function drawRowExtra2(data, w, rowY) {
  for (let f = 0; f < GRID_COLS; f++) {
    const fx = f * FRAME_W;
    const phase = (f / (GRID_COLS - 1)) * Math.PI;
    const bob = Math.round(Math.sin(phase) * 4); // thở chậm
    drawBody(data, w, fx, rowY, bob, -2); // hơi bẹp (nằm)
    drawEyes(data, w, fx, rowY, bob, true); // luôn nhắm
    drawBlush(data, w, fx, rowY, bob);
    drawLegs(data, w, fx, rowY, bob);
    // Z particles: xuất hiện theo frame
    if (f >= 2) drawZ(data, w, fx + FRAME_W / 2 + 35, rowY + FRAME_H / 2 - 40 - (f - 2) * 6, 2);
    if (f >= 5) drawZ(data, w, fx + FRAME_W / 2 + 48, rowY + FRAME_H / 2 - 60 - (f - 5) * 5, 1);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const png = new PNG({ width: SHEET_W, height: SHEET_H, filterType: -1 });
  const { data } = png;

  // Khởi tạo tất cả pixel trong suốt
  data.fill(0);

  // Vẽ từng row
  drawRowIdle  (data, SHEET_W, 0 * FRAME_H);
  drawRowWave  (data, SHEET_W, 1 * FRAME_H);
  drawRowRun   (data, SHEET_W, 2 * FRAME_H);
  drawRowFailed(data, SHEET_W, 3 * FRAME_H);
  drawRowReview(data, SHEET_W, 4 * FRAME_H);
  drawRowJump  (data, SHEET_W, 5 * FRAME_H);
  drawRowExtra1(data, SHEET_W, 6 * FRAME_H);
  drawRowExtra2(data, SHEET_W, 7 * FRAME_H);

  // Đảm bảo public/ dir tồn tại
  mkdirSync(resolve(__dirname, "../public/assets/pets/blobby"), { recursive: true });

  // Sync pet.json sang public/ để Vite có thể serve tại runtime
  copyFileSync(
    resolve(__dirname, "../src/assets/pets/blobby/pet.json"),
    resolve(__dirname, "../public/assets/pets/blobby/pet.json")
  );
  console.log("✓ pet.json synced to public/assets/pets/blobby/");

  // Ghi PNG vào cả 2 nơi:
  // - public/assets/pets/blobby/ → Vite serve tại runtime (fetch URL /assets/pets/blobby/spritesheet.png)
  // - src/assets/pets/blobby/    → source-of-truth trong repo
  const outPaths = [
    resolve(__dirname, "../public/assets/pets/blobby/spritesheet.png"),
    resolve(__dirname, "../src/assets/pets/blobby/spritesheet.png"),
  ];

  for (const outPath of outPaths) {
    // pngjs PNG.pack() có thể đọc data nhiều lần nên cần tạo PNG mới mỗi lần
    const pngCopy = new PNG({ width: SHEET_W, height: SHEET_H, filterType: -1 });
    pngCopy.data = Buffer.from(png.data);
    await new Promise((res, rej) => {
      pngCopy
        .pack()
        .pipe(createWriteStream(outPath))
        .on("finish", res)
        .on("error", rej);
    });
    console.log(`✓ Spritesheet written: ${outPath}`);
  }

  const sizeKb = Math.round((SHEET_W * SHEET_H * 4) / 1024);
  console.log(`  Grid: ${GRID_COLS}×${GRID_ROWS} frames, ${FRAME_W}×${FRAME_H}px each`);
  console.log(`  Sheet: ${SHEET_W}×${SHEET_H}px (~${sizeKb}KB uncompressed)`);
}

main().catch((err) => {
  console.error("gen-pet-spritesheet failed:", err);
  process.exit(1);
});
