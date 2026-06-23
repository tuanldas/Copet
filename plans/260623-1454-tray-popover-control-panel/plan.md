---
title: "Tray popover control panel (AgentPet-style)"
description: "Redesign sessions popover thành control panel: companion card (pet level/XP/status/token) + agents list + toggles + slider + footer. Giống ảnh tham chiếu AgentPet."
status: in-progress
priority: P2
branch: "feat/running-sessions-multi-surface"
tags: [tauri, solidjs, ui, popover, tamagotchi]
blockedBy: []
blocks: []
created: "2026-06-23T07:54:00.000Z"
createdBy: "ck:cook"
source: user-reference-image
---

# Tray popover control panel (AgentPet-style)

## Overview

Người dùng muốn sessions popover (bấm tray icon) giàu như app tham chiếu "AgentPet": header đếm agents, companion card (avatar/tên/level/status/XP/token), agents list (đã có enrichment), toggles, pet-size slider, footer (Settings/Updates/Quit).

Quyết định người dùng: **build ngay chỉ phần dùng dữ liệu HIỆN CÓ** (Phase 1); các phần cần tracking/feature mới đưa vào Phase 2-4, phát triển sau.

## Phases

| Phase | Name | Status | Build now? |
|-------|------|--------|-----------|
| 1 | [Popover layout + existing data](./phase-01-popover-layout-existing-data.md) | Pending | ✅ Có |
| 2 | [Daily token + feed tracking](./phase-02-daily-token-and-feed-tracking.md) | Pending | ⏳ Sau |
| 3 | [Pet name + size slider](./phase-03-pet-name-and-size.md) | Pending | ⏳ Sau |
| 4 | [Menu bar count/chat/bubble + Updates](./phase-04-menu-bar-and-updates.md) | Pending | ⏳ Sau |

## Dependencies

Xây trên: `260623-0913-running-sessions-multi-surface` (SessionList, use-sessions, sessions popover) + `260623-1033-session-info-enrichment` (agent enrichment). Tamagotchi `pet-store` + `xp-level` + economy `tokens` đã có.

## Mapping ảnh tham chiếu → Copet

| Ảnh | Nguồn | Phase |
|-----|-------|-------|
| "N agents · M running" | `createSessionsSignal` (len + filter working) | 1 |
| Companion: avatar/Lv/XP/status/token | `getPetData` (level/xp/stats/tokens) + `xpWithinLevel/xpForCurrentLevel` | 1 |
| Agents list + trạng thái + duration | `SessionList` (đã có) | 1 |
| Show pet toggle | `togglePet` | 1 |
| Settings / Quit | `openSettings` + lệnh `quit_app` (mới, nhỏ) | 1 |
| "Hôm nay X token · Y bữa" | đếm token/bữa theo ngày (mới) | 2 |
| Tên pet tùy chỉnh | field mới (PetData/settings) | 3 |
| Pet size slider | resize cửa sổ pet + lưu | 3 |
| Show count on menu bar | tray title (mới) | 4 |
| Show chat/bubble on menu bar | feature mới | 4 |
| Updates | tauri updater | 4 |

## Out of Scope (toàn plan)

- Render sprite pet thật trong popover (dùng emoji avatar; sprite canvas để sau nếu cần).
- Đa ngôn ngữ (UI tiếng Việt như hiện tại).

## Key Decisions

- **Phase 1 chỉ dùng dữ liệu có sẵn**: token hiển thị là TỔNG (chưa "hôm nay"); tên = tên pack ("Blobby"); chưa có size slider / menu-bar nâng cao / updates → KHÔNG render UI chưa chạy được (tránh nút chết).
- **Tái dùng** SessionList + accessors của HUD (getPetData/xp-level) → không reimplement.
- **Modular**: tách `CompanionCard.tsx` + `pet-status.ts` (helper status từ stats) thay vì nhồi hết vào sessions-entry.

## Open Questions

- Avatar companion: emoji theo pet pack (Phase 1) hay render sprite thật (sau)? → tạm emoji.
- "Show pet" toggle phản ánh đúng trạng thái ẩn/hiện pet khi bật qua shortcut? → Phase 1 dùng state cục bộ (default on); đồng bộ thật để sau nếu cần.
