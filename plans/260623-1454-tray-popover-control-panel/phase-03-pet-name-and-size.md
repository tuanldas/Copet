---
phase: 3
title: "Pet name + size slider"
status: pending
priority: P3
dependencies: [1]
effort: "~0.5d"
---

# Phase 3: Pet name + size slider

## Overview

Cho đặt TÊN pet tùy chỉnh ("Valorant Omen Kitty") và thanh trượt chỉnh KÍCH THƯỚC pet.

## Related Code Files

- Pet name: thêm `petName` (settings store `copet-settings.json` hoặc PetData). Hiển thị ở CompanionCard; ô sửa tên (inline edit hoặc trong Settings). Lệnh `set_pet_name` + get_settings.
- Pet size: `set_pet_size(scale)` (Rust) → `pet.set_size(inner_size * scale)` cho cửa sổ "pet"; lưu vào store; slider trong popover gọi xuống. Frontend pet render scale theo kích thước cửa sổ.
- Modify: `CompanionCard.tsx` (tên), `sessions-entry.tsx` (slider), `system_commands.rs`/`window_commands.rs` (lệnh), `tauri-commands.ts`.

## Success Criteria

- [ ] Đặt tên → hiện ở companion card, lưu qua restart.
- [ ] Kéo slider → pet to/nhỏ realtime, lưu qua restart.
- [ ] tsc + cargo clippy/test sạch.

## Risk

Resize cửa sổ pet phải giữ click-through hit rect đúng tỉ lệ (đụng `set_pet_hit_rect` + scale). Test kỹ overlay.
