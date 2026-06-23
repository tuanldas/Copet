---
phase: 2
title: "Daily token + feed tracking"
status: pending
priority: P3
dependencies: [1]
effort: "~0.5d"
---

# Phase 2: Daily token + feed tracking

## Overview

Hiện "Hôm nay X token · Y bữa" trong companion card. Hiện chỉ có TỔNG token, chưa có theo ngày, chưa đếm "bữa" (số lần cho ăn).

## Related Code Files

- Modify: `src/tamagotchi/types.ts` (+ migration, bump SCHEMA_VERSION) — thêm `dailyTokens: number`, `dailyFeeds: number`, `dailyDay: string` (YYYY-MM-DD) để reset theo ngày. Hoặc tách struct `daily`.
- Modify: `src/tamagotchi/pet-store.ts` / accounting — tăng `dailyTokens` khi cộng token; reset khi `dailyDay` đổi (reuse cơ chế `lastCareDay`).
- Modify: economy/feed flow (nơi cho ăn) — tăng `dailyFeeds`.
- Modify: `CompanionCard.tsx` — render "Hôm nay {formatTokens(dailyTokens)} token · {dailyFeeds} bữa".

## Success Criteria

- [ ] Token/bữa đếm đúng theo ngày, reset qua ngày mới.
- [ ] Migration không vỡ pet data cũ.
- [ ] tsc + vitest sạch.

## Risk

Migration schema (đụng PetData) → cẩn thận migration.ts + test. Reset ngày dùng local date (timezone máy).
