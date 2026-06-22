# PoC Results — Transparent Overlay Click-Through (Phase 01)
Date: 2026-06-22 | Risk #1 gate (Tauri #13070) | OS: macOS (Apple Silicon)

## Verdict: ✅ PASS (fallback implemented)

Giả định ban đầu (macOS tự cho click xuyên qua pixel alpha=0) **SAI** — window trong suốt nuốt mọi mouse event trong vùng của nó, chặn app phía dưới. Đã implement fallback theo research §3; tất cả tiêu chí PASS trên macOS (user verify thủ công).

## Tiêu chí (macOS — user verify)
| # | Tiêu chí | Kết quả |
|---|---|---|
| 1 | Pet hiển thị (trong suốt, always-on-top, không viền) | ✅ |
| 2 | Kéo pet ngay lần giữ chuột đầu (không cần pre-click) | ✅ (sau fix acceptFirstMouse) |
| 3 | Click vùng trong suốt → xuyên xuống app dưới | ✅ (sau fix cursor-poll) |
| 4 | Ẩn khỏi Dock + Cmd+Tab | ✅ (ActivationPolicy::Accessory) |
| 5 | Không steal focus | ✅ |

## Vấn đề → cách fix
1. **Click-through**: window mặc định bắt mọi click. → Mặc định `set_ignore_cursor_events(true)` (cả window xuyên qua) + std::thread poll OS cursor ~60fps, mỗi tick `run_on_main_thread` toggle capture ON chỉ khi chuột trong vùng tròn quanh tâm pet (bán kính frontend gửi qua `set_pet_hit_radius`). Debounce bằng `AtomicBool`. → `lib.rs`: `start_click_through_poll`, `cursor_over_pet`.
2. **Cú click đầu bị nuốt để activate** (macOS inactive window): phải pre-click mới kéo. → `"acceptFirstMouse": true` trên window pet.
3. **Build fail**: bật `macOSPrivateApi` cần feature `macos-private-api` trên dep `tauri` (Cargo.toml).

## Validation
- `pnpm exec tsc --noEmit`: sạch
- `cargo clippy --all-targets`: sạch (0 warning)
- `pnpm tauri dev`: chạy; tiêu chí trên PASS (manual)

## Code review fixes (đã áp)
- **H1**: chỉ commit trạng thái ignore sau khi `set_ignore_cursor_events` thành công (retry nếu fail).
- **M1**: skip poll khi pet ẩn; hạ poll 60→30fps (giảm CPU idle).
- **M2**: tick poll đầu force-apply (tránh desync init).
- **M3**: bỏ permission `core:window:allow-set-ignore-cursor-events` thừa (chỉ gọi từ Rust).
- **L2**: thoát poll thread khi event loop đóng (shutdown sạch).
- **H2** (focus-steal): non-issue by design (`Accessory` + `acceptFirstMouse`) — user nên sanity-check nhanh.

## Carry-forward (cho phase sau)
- Hit region hiện là hình tròn quanh tâm (PoC). Phase 02: truyền opaque bounds/shape thật của sprite vào hit API (thay vì chỉ bán kính) để khớp pet không tròn.
- Poll thread chưa có cờ shutdown (daemon; vô hại khi thoát). Thêm graceful stop nếu cần.
- Win/Linux click-through CHƯA verify (macOS-first). `set_ignore_cursor_events` cross-platform nhưng `acceptFirstMouse` (macOS-only) + hành vi poll cần kiểm ở Phase 08.
- macOS fullscreen overlay (NSWindowLevel override) chưa verify — Phase 06.

## Open questions
- Không có vấn đề block. Verify Win/Linux hoãn tới Phase 08.
