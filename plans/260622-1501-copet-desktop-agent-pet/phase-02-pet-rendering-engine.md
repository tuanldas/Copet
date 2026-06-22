# Phase 02 — Pet Rendering Engine

> Canvas 2D sprite player + Petdex pet-pack loader + @xstate/store state machine + base animations. Vanilla TS (KHÔNG framework cho canvas layer).

## Context / Links
- Research: `plans/reports/researcher-260622-1511-pet-animation-tamagotchi-report.md` §2 (Canvas 2D), §3 (state machine), §5.2 (pet-pack format)
- Design: `docs/design-guidelines.md` §Art style, §Motion (idle bob ~0.5Hz, squash-stretch, reduced-motion)

## Requirements
1. Pet-pack loader: parse `pet.json` (Petdex 8×9 grid, 192×208 px/frame) + load spritesheet (.png/.webp). Hỗ trợ field `copet_extensions` cho state thêm (eat/sleep/drag/working/celebrate).
2. Sprite player: render frame theo (row, frameIndex) vào `<canvas>`, `image-rendering: pixelated`, `requestAnimationFrame` loop với fps cố định per-animation.
3. Pause loop khi `visibilitychange` (hidden) → CPU idle thấp.
4. State machine `@xstate/store`: states `idle|walk|drag|sleep|eat|working|celebrate|error|evolve`; events `TICK|FEED|PET|DRAG_START|DRAG_END|AGENT_EVENT|SLEEP|WAKE`. Priority: `drag > sleep_forced > agent_state > mood overlay`.
4b. State→animation mapping: mỗi state map tới 1 row anim của pack (+ frame range). Map qua 1 bảng cấu hình, không hardcode rải rác.
5. Base animations chạy được: idle (bob/blink), walk (random wander trong window bounds), drag (theo cursor).
6. Bundle 1 MVP pet-pack thật (CC0/tự vẽ) vào `frontend/assets/pets/<id>/`.

## Data flow
```
pet.json + spritesheet → PetPackLoader.parse() → PetPack {frames, anims, extensions}
@xstate/store (state) ──┐
                        ├─► AnimationController.resolve(state) → (row, frameRange, fps)
rAF tick ───────────────┘   → SpritePlayer.draw(ctx, frame)
visibilitychange(hidden) → loop.pause()  | (visible) → loop.resume()
```
**Input boundary:** state machine nhận `AGENT_EVENT` payload (typed) — actual emit nối ở Phase 07. Phase này chỉ stub bằng dev keyboard shortcut/devtools để test transitions.

## Files to create
- `frontend/pet/pet-pack-loader.ts` — parse + validate pet.json, load image, expose `PetPack`
- `frontend/pet/pet-pack-types.ts` — TS types cho pet.json schema + `copet_extensions`
- `frontend/pet/sprite-player.ts` — draw frame(row,col) vào canvas ctx, pixelated
- `frontend/pet/animation-controller.ts` — state → (row, frameRange, fps); reduced-motion handling
- `frontend/pet/pet-state-machine.ts` — `@xstate/store` setup (states/events/priority)
- `frontend/pet/render-loop.ts` — rAF loop + visibilitychange pause/resume
- `frontend/pet/index.ts` — wire loader+player+machine; export `mountPet(canvas)`
- `frontend/assets/pets/<id>/pet.json` — MVP pet metadata
- `frontend/assets/pets/<id>/spritesheet.png` — MVP sprite (8×9)
- `frontend/assets/pets/<id>/LICENSE.txt` — license manifest (CC0 nguồn hoặc tự vẽ)
- `frontend/pet/__tests__/pet-pack-loader.test.ts` — unit test parse + validation
- `frontend/pet/__tests__/animation-controller.test.ts` — state→anim mapping + priority

## Files to modify
- `src/main.ts` (từ P01) — thay PoC shape bằng `mountPet(canvas)`
- `package.json` — add `@xstate/store`, `vitest` (dev), test script
- `vite.config.ts` — đảm bảo assets/pets được serve/bundle đúng

## Implementation steps
1. Định nghĩa `pet-pack-types.ts` theo Petdex spec (rows: idle/wave/run/failed/review/jump/extra1/extra2 + `copet_extensions` map state→{row,frames,fps}).
2. `pet-pack-loader.ts`: fetch pet.json, validate grid (8×9, frame size), `new Image()` load spritesheet, reject nếu schema sai.
3. `sprite-player.ts`: `drawImage(sheet, col*fw, row*fh, fw, fh, dx,dy, dw,dh)`; set `ctx.imageSmoothingEnabled=false`.
4. `pet-state-machine.ts`: `@xstate/store` với context `{current, prev}`; transitions theo priority table; `import` CHỈ `@xstate/store` (không `xstate`).
5. `animation-controller.ts`: bảng map state→anim; nếu reduced-motion → giảm/disable bob & particle.
6. `render-loop.ts`: rAF; on hidden → `cancelAnimationFrame`; on visible → resume; clamp pet trong window bounds cho walk.
7. Tạo/chuẩn hóa MVP pet-pack (Kenney CC0 → cắt về grid, hoặc AI-gen post-process). Ghi LICENSE.
8. Dev harness: keyboard `1..9` đổi state để test (gỡ/giữ sau dưới flag dev).

## Tests / Validation
- `pnpm vitest run` — loader parse pet.json hợp lệ + reject schema sai; animation-controller trả đúng (row,fps) cho mỗi state + tôn trọng priority (drag override).
- `pnpm tsc --noEmit` sạch.
- Manual: `pnpm tauri dev` → pet idle bob mượt; bấm dev keys đổi state thấy animation đổi; kéo pet theo cursor; minimize/đổi tab → CPU drop (Activity Monitor / `top`).
- CPU idle target < 2% (manual measure macOS).

## Risks & Rollback
| Risk | Mức | Mitigation |
|---|---|---|
| Canvas CPU cao khi webview throttle | Med | visibilitychange pause; cap fps; đo thật |
| Asset license mơ hồ | Med (High nếu sai nguồn) | CHỈ CC0 (Kenney) hoặc tự vẽ; LICENSE.txt bắt buộc |
| Nhầm import `xstate` full (~40KB) | Low | Lint/review import; chỉ `@xstate/store` |
| Pet-pack spec lệch Petdex → mất tương thích | Med | Bám 8×9 spec; extensions tách field riêng |

**Rollback:** thuần frontend (`frontend/pet/*`, assets) — revert không ảnh hưởng Rust/backend. `src/main.ts` đổi lại về PoC nếu cần.

## File ownership (song song)
Wave A cùng P03 (`src-tauri/*`) + P04 (`frontend/tamagotchi/*`). Phase này SỞ HỮU `frontend/pet/*` + `frontend/assets/pets/*`. Điểm chạm chung: chỉ consume event-payload types do P03 định nghĩa (`frontend/types/agent-event.ts`) — không sửa file đó.

## Open questions
1. Evolution art: mỗi stage 1 spritesheet riêng hay palette-swap + overlay? (ảnh hưởng asset budget + loader) — **cần user.**
2. MVP pet: dùng asset CC0 có sẵn hay đặt vẽ riêng?
