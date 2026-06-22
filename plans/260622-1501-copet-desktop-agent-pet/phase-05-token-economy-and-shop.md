# Phase 05 — Token Economy + Shop

> Token sinh từ agent activity; Shop UI (food + cosmetics) bằng SolidJS; buy/equip. Depends P04 (pet-store/tokens) + P02 (cosmetic ảnh hưởng render).

## Context / Links
- Research: `plans/reports/researcher-260622-1511-pet-animation-tamagotchi-report.md` §4.2 (token = tool_call), §8.3 (token dùng gì — cần định nghĩa)
- Design: `docs/design-guidelines.md` §UI components (Shop grid, coin violet `#8B5CF6`, Buy button), §Color/Typography

## Requirements
1. Token earning: mỗi `tool_call` từ agent event = +1 token (nguồn từ P03 event qua P07 wiring; P05 expose `addTokens()` API, KHÔNG listen trực tiếp).
2. Item catalog (data-driven JSON): 2 loại — `food` (mua → hồi stat, consumable) + `cosmetic` (mua → equip, đổi visual, permanent).
3. Shop UI (SolidJS, window/modal riêng): grid item, giá token, nút Buy; trạng thái owned/equipped cho cosmetic.
4. Buy: trừ token (validate đủ token), thêm vào inventory; food → áp hiệu ứng stat ngay (gọi P04 `feed`), cosmetic → vào inventory.
5. Equip/unequip cosmetic: 1 slot/loại (vd hat, accessory); equipped state persist; render layer áp lên pet (P02 hook nhận `equippedCosmetics`).
6. Persist inventory + equipped trong cùng store (P04 schema mở rộng có version bump).

## Data flow
```
agent tool_call (P03→P07) → economy.addTokens(n) → pet-store.tokens
Shop UI buy(item) → validate tokens ≥ price → tokens -= price
   ├─ food → P04.feed(effect) (consumable, không lưu inventory)
   └─ cosmetic → inventory.add(item)
equip(cosmetic) → equipped[slot]=id → persist → emit('cosmetics-changed') → P02 render overlay
```

## Files to create
- `frontend/economy/economy.ts` — `addTokens()`, `spendTokens()` (validate), balance getter (đọc/ghi pet-store)
- `frontend/economy/item-catalog.ts` — load `items.json`; types `FoodItem`/`CosmeticItem`
- `frontend/economy/inventory.ts` — owned items + equipped slots; equip/unequip; persist via P04 store
- `frontend/assets/shop/items.json` — catalog (food: name, price, stat effect; cosmetic: name, price, slot, sprite-overlay ref)
- `frontend/assets/shop/cosmetics/*` — cosmetic overlay sprites (CC0/tự vẽ + LICENSE)
- `frontend/ui/shop/Shop.tsx` — SolidJS shop window (grid, tabs food/cosmetic, Buy)
- `frontend/ui/shop/ShopItemCard.tsx` — item card (icon, price coin, Buy/Equip btn)
- `frontend/ui/shop/shop.css` — styles theo design tokens
- `shop.html` — entry cho shop window
- Tests: `frontend/economy/__tests__/economy.test.ts` (spend validate, không âm), `inventory.test.ts` (equip/unequip, 1 slot/loại)

## Files to modify
- `frontend/tamagotchi/types.ts` (P04) — extend schema: `inventory`, `equipped`, bump `SCHEMA_VERSION` → **coordinate với P04 owner** (sequential sau P04, không song song)
- `frontend/tamagotchi/index.ts` (P04) — expose `feed(effect)` nếu chưa
- `frontend/pet/index.ts` (P02) — nhận `equippedCosmetics`, render overlay layer trên sprite → **coordinate với P02**
- `src-tauri/src/lib.rs` — tạo shop window (hoặc lazy create khi mở) + capability cho shop.html
- `src-tauri/tauri.conf.json` — thêm shop window (hidden default) hoặc tạo runtime
- `package.json` — add `solid-js`, `vite-plugin-solid` (nếu chưa từ P06); `vite.config.ts` thêm solid plugin + multi-page input

## Implementation steps
1. `economy.ts`: `spendTokens(n)` trả bool (false nếu thiếu), không cho âm; `addTokens(n)`.
2. `item-catalog.ts` + `items.json`: schema food{statEffect:{stat,amount}}, cosmetic{slot,overlaySprite}.
3. `inventory.ts`: owned Set + equipped map{slot:id}; equip thay slot; persist qua P04 store (cùng key).
4. Shop SolidJS: signal cho tokens/inventory; tabs; ShopItemCard hiển thị giá + state; Buy gọi economy+inventory/feed.
5. Cosmetic render: `frontend/pet/index.ts` thêm bước draw overlay sprite sau sprite pet theo `equipped` (cùng frame index).
6. Window: thêm shop window (decorations tùy, KHÔNG transparent — panel đặc theo design §Color note); mở qua tray/HUD (P06 nối nút).
7. Persist: extend schema + version bump + migration (giữ pet cũ không inventory → default rỗng).

## Tests / Validation
- `pnpm vitest run` — spend khi đủ/thiếu token (không âm); equip thay đúng slot; food consumable không vào inventory; cosmetic vào inventory + persist.
- `pnpm tsc --noEmit` sạch.
- Manual: tích lũy token (dev: gọi addTokens), mở Shop, mua food → stat tăng + token giảm; mua + equip cosmetic → pet hiện overlay; restart → cosmetic giữ.

## Risks & Rollback
| Risk | Mức | Mitigation |
|---|---|---|
| Token định nghĩa "dùng gì" chưa chốt | Med | MVP: food (stat) + cosmetic (visual) — đủ loop; thêm sau |
| Schema bump vỡ save cũ | Med | Migration default rỗng inventory; test với save P04 cũ |
| Cosmetic overlay lệch frame so với pet | Med | Overlay dùng cùng (row,frameIndex); align trong pet pack spec |
| Token farming (spam tool_call) | Low | MVP chấp nhận; daily cap để sau nếu cần |

**Rollback:** Shop window + economy module độc lập; nếu lỗi, ẩn shop window + bỏ equip render → core pet/tamagotchi vẫn chạy. Schema migration là điểm rủi ro nhất → test kỹ trước.

## File ownership (song song)
Wave B (cùng P06). SỞ HỮU `frontend/economy/*`, `frontend/ui/shop/*`, `frontend/assets/shop/*`, `shop.html`. **Sequential sau P04** (sửa schema P04) + **coordinate P02** (overlay render). Với P06: khác file UI (`ui/shop` vs `ui/hud`,`ui/settings`) → OK song song; nhưng cả 2 đụng `lib.rs`/`tauri.conf.json` window list → tách init fn (xem P03 note) hoặc làm tuần tự phần Rust.

## Open questions
1. Token dùng để mua GÌ ngoài food + cosmetic? (research §8.3) — MVP chốt 2 loại; **xác nhận user.**
2. Giá item + tỉ giá token (bao nhiêu tool_call/1 food)? — đề xuất bảng giá nháp, user duyệt.
3. Cosmetic slots nào (hat/glasses/background)? — ảnh hưởng asset + render layers.
