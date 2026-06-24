---
phase: 1
title: Row content redesign
status: completed
effort: S
---

# Phase 1: Row content redesign

## Overview

Viết lại builder row trong `src/pet/tooltip-render.ts`: layout 4-dòng emit class `cpt-*` (thuần, không inline-style màu), bỏ "X trước", giữ `escHtml` + hover `title`. TDD: cập nhật `tooltip-render.test.ts` trước (red) rồi implement (green).

## Requirements

- Functional: mỗi session → `cpt-row` gồm header (`cpt-dot--{state}` + `cpt-badge` + `cpt-name` + `cpt-timer`), `cpt-state--{state}`, command (`cpt-cmd` working / `cpt-cmd--ask` waiting), `cpt-meta` (model+tokens). Bỏ dòng "· {act} trước".
- Non-functional: module thuần (no DOM/Tauri), `escHtml` mọi chuỗi agent, giữ `TOOLTIP_MAX_ROWS=5` + "+N more", giữ hover `title` (cwd/prompt/summary/lastMessage).

## Architecture

Structure/style tách rời: render chỉ emit class `cpt-*`; màu/ font do stylesheet Phase 2 cấp. Test assert **class + text**, KHÔNG assert chuỗi inline-style. Map dữ liệu giữ nguyên helper: `displayName`, `agentBadge`, `getStateLabel`, `formatDuration(now−since)`, `shortModel`, `formatTokens`, `sortSessions`.

## Related Code Files

- Modify: `src/pet/tooltip-render.ts` (hàm `renderTooltipHtml`, phần `rows.map` + empty + "+N more").
- Modify (tests-first): `src/pet/__tests__/tooltip-render.test.ts`.
- Read-only: `src/agent-bridge/state-labels.ts`, `src/ui/shared/{agent-badge,session-format,session-duration,session-list-model}.ts`.

## Implementation Steps

### A. Tests first (red) — `tooltip-render.test.ts`

PRESERVE (giữ xanh, đổi matcher sang class/text nếu cần): empty "Chưa có session"; project pa/pb/pc; "+2 more" & not proj6; escape `<script>`→`&lt;script&gt;`; theme Cooking/Growing; duration "19m" (timer); badge "Claude"; tool chỉ khi working; message chỉ khi waiting; model "opus-4-8" + "248k"/"1.2k" (claude- stripped); hover title cwd/prompt/summary/lastMessage + escape; escape tool input.

UPDATE:
- Tool-input: bỏ assert contiguous `"Bash: pnpm test"` → đổi sang `toContain("pnpm test")` + row chứa `cpt-tool` (tên tool tách span). Format mới `{tool} · {toolInput}`.
- "Omits meta khi no model/tokens": đổi signature `opacity:0.5;font-size` → `not.toContain("cpt-meta")` (giữ `not.toContain("↑")`).

ADD (regression cho redesign):
- Working row chứa `cpt-dot--working`; waiting row chứa `cpt-dot--waiting`.
- Working row chứa `cpt-cmd`; waiting+message chứa `cpt-cmd--ask`.
- `not.toContain("trước")` (đã bỏ last-activity).
- Row chứa `cpt-timer` và `cpt-badge`.

### B. Implementation (green) — `tooltip-render.ts`

1. Đổi nhánh empty → `<div class="cpt-empty">Chưa có session nào</div>`.
2. `rows.map`: build theo contract trong `plan.md` (header/state/command/meta). Tên tool bọc `<span class="cpt-tool">`; command working = `tool` + ` · ` + `toolInput` (hoặc chỉ `tool`); waiting = `cpt-cmd--ask` chứa `escHtml(message)`.
3. Bỏ hẳn `act` + `· {act} trước`. Giữ `dur` → `<span class="cpt-timer">`.
4. Giữ `title` (hover) trên `cpt-name` như cũ (cwd/prompt/summary/lastMessage, đã escape).
5. Meta: chỉ render `cpt-meta` khi có model hoặc tokens; `cpt-model` = `shortModel`, `cpt-tok-in`/`cpt-tok-out` = `↑/↓ formatTokens`.
6. "+N more" → `<div class="cpt-more">+N more</div>`.
7. `escHtml` mọi chuỗi agent (name/tool/toolInput/message/model); emoji/label từ `getStateLabel` cũng escape như cũ.

## Success Criteria

- [ ] `pnpm test src/pet/__tests__/tooltip-render.test.ts` xanh (assertion mới + preserve-list).
- [ ] Markup emit đúng contract; KHÔNG còn "trước"; KHÔNG inline màu.
- [ ] `escHtml` còn nguyên; `<script>` escaped.
- [ ] `pnpm exec tsc --noEmit` xanh.

## Risk Assessment

R3 (đổi test): liệt kê preserve/update/add rõ ràng → tránh xóa nhầm coverage. Không đụng style/DOM nên không ảnh hưởng overlay (Phase 2). Command tách span làm vỡ matcher contiguous cũ → đã xử lý ở bước UPDATE.
