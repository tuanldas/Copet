# Copet — Design Guidelines (Light)

> Visual identity cho desktop pet + UI panels (HUD / Settings / Shop).
> Status: **Draft** 2026-06-22 — có thể chỉnh trong quá trình implement.

## Personality
Bạn đồng hành code dễ thương, ấm áp, cổ vũ. Phản ứng theo agent như một người bạn nhỏ. Vui nhộn nhưng **không gây xao nhãng**. Đọc rõ ở kích thước nhỏ trên mọi hình nền.

## Art style — Pixel art
- Sprite pixel-art, **Petdex pet-pack** (grid 8×9, 192×208 px/frame)
- Palette giới hạn mỗi pet (8–16 màu), cạnh sắc, CSS `image-rendering: pixelated`
- Silhouette dễ nhận ở 96–128px on-screen
- Các evolution stage khác biệt rõ (kích thước/chi tiết/aura), không chỉ đổi palette

## Color palette
**Agent-state accent** (điều khiển glow của pet + status dot HUD):
| State | Hex | Ý nghĩa |
|---|---|---|
| working | `#3B82F6` blue | đang tập trung/gõ |
| waiting | `#F59E0B` amber | cần bạn |
| done | `#22C55E` green | thành công |
| error | `#EF4444` red | task lỗi |
| idle | `#94A3B8` slate | nghỉ |

**UI (panels):**
- bg surface: `#1E1E2E` (dark) / `#FAFAFC` (light)
- surface raised: `#2A2A3C` / `#FFFFFF`
- text primary: `#ECECF4` / `#1E1E2E` · text muted: `#A0A0B8` / `#6B7280`
- accent/brand (button, currency): `#8B5CF6` violet
- border: `rgba(255,255,255,.08)` / `rgba(0,0,0,.08)`

> ⚠️ Window pet trong suốt → CSS `blur/backdrop-filter` bị vô hiệu. Panel dùng card bo góc đặc + shadow mềm.

## Typography (Google Fonts)
- **Display/headers + số:** `Pixelify Sans` (chất pixel, hợp sprite)
- **Body/UI:** `Nunito` (bo tròn, thân thiện, dễ đọc)
- **Mono (tên agent/tool, log):** `JetBrains Mono`

## Stat icons & bars
hunger 🍗 · energy ⚡ · happiness ❤ · hygiene ✨ — icon pixel/line đơn giản, grid 16px. Stat bar bo góc, đổi màu green→amber→red khi giảm.

## UI components
- **Stats HUD** (right-click pet): card bo góc gọn ~280px — portrait pet + 4 stat bar + vòng level/XP + hàng agent status.
- **Shop:** grid item (food / cosmetics), giá bằng token (coin violet), nút Buy. Modal/window.
- **Settings:** toggle tích hợp agent, hotkey, autostart, chọn pet, vị trí.
- **Buttons:** radius 8px, accent fill cho primary, ghost cho secondary. Hit target ≥32px.
- Radius scale: 6 / 8 / 12 / 16. Spacing (px): 4 / 8 / 12 / 16 / 24 / 32.

## Motion
- **Idle:** bob/breathe nhẹ (~0.5Hz), thỉnh thoảng blink/ngó nghiêng.
- **State change:** squash-stretch nhanh + flash accent (150–250ms ease-out).
- **Celebrate (done):** nhảy + particle hearts/sparkle.
- **Feed:** animation nhai + tween fill stat bar.
- Tôn trọng **reduced-motion** (toggle trong Settings).

## Accessibility / UX
- Trạng thái thể hiện bằng **icon + text**, không chỉ màu.
- Pet kéo-thả được; nhớ vị trí theo từng monitor.
- **Không bao giờ steal focus**; click-through ở vùng trong suốt.
- Tooltip hover: agent hiện tại + state + tên project.

## Asset sourcing
- Pet MVP: sprite pixel CC0 (Kenney / OpenGameArt) chỉnh về grid pet-pack, hoặc AI-gen (Gemini) post-process thành spritesheet.
- Mỗi pet-pack kèm license manifest.
