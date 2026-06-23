---
phase: 4
title: "Menu bar count/chat/bubble + Updates"
status: pending
priority: P3
dependencies: [1]
effort: "~1.5d"
---

# Phase 4: Menu bar count/chat/bubble + Updates

## Overview

Các toggle nâng cao trên menu bar (count / chat / bubble) + nút Updates. Nặng nhất, nhiều việc mới.

## Related Code Files

- **Count on menu bar**: đặt TITLE cho tray icon = số agents running. `tray.rs` → `tray.set_title(Some(n))`. Toggle bật/tắt + lưu.
- **Chat on menu bar**: hiện text tin nhắn cuối (last_message từ enrichment, opt-in) cạnh icon. Cập nhật title theo agent active. Cắt ngắn.
- **Bubble on menu bar**: hiện biểu tượng/bong bóng trạng thái cạnh icon (emoji theo state). Có thể đổi icon tray theo state (đã có set_tray_state tooltip; mở rộng sang title/icon).
- **Updates**: `tauri-plugin-updater` — nút "Check for updates" → kiểm tra + tải. Cần cấu hình endpoint + signing.
- Toggles lưu ở `copet-settings.json`; popover render switches; `system_commands.rs` getters/setters.

## Success Criteria

- [ ] Mỗi toggle bật/tắt đúng, lưu qua restart, phản ánh trên menu bar.
- [ ] Updates kiểm tra được bản mới (hoặc báo "đã mới nhất").
- [ ] Không chặn/agent, không vỡ tray hiện có.

## Risk

- macOS tray title dài → tốn chỗ menu bar; cần cắt ngắn + cho tắt.
- Updater cần hạ tầng phát hành (endpoint, pubkey) — có thể tách task riêng nếu chưa sẵn sàng.
- chat/bubble đụng privacy (last_message) → chỉ khi opt-in transcript (Phase 2 enrichment).
