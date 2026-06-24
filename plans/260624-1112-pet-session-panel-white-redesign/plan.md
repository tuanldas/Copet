---
title: Pet session panel white redesign (400px + info)
description: >-
  Redesign #pet-tooltip → nền trắng 400px, layout 4-dòng/session
  (dot+badge+name+timer / state / command / model+tokens), caret trỏ pet.
  Frontend-only, scoped stylesheet (KHÔNG import design-tokens.css global vì sẽ
  phá overlay trong suốt).
status: pending
priority: P2
branch: fix/session-list-lifecycle
tags: []
blockedBy: []
blocks: []
created: '2026-06-24T04:16:32.681Z'
createdBy: 'ck:plan'
source: skill
---

# Pet session panel white redesign (400px + info)

## Overview

Design lại session panel nổi trên pet (`#pet-tooltip`): nền **trắng `#FFFFFF`**, width **400px ép cứng**, mỗi session **4 dòng** (header `dot + badge + name + timer` / state label / command trần xuống dòng / model+tokens), **caret** trỏ xuống pet. Dùng giá trị **design-tokens** (màu state, font Pixelify/Nunito/JetBrains Mono) qua **stylesheet scoped inject**, KHÔNG import `design-tokens.css` global. Frontend-only, 2 file + tests. TDD.

Input: brainstorm report `../reports/brainstorm-260624-1049-pet-session-panel-white-redesign-report.md` · mockup `…-mockup.png`/`.html`.
Tiền nhiệm (đã xong): `../260624-0755-pet-fixed-session-panel/` (tạo panel này; redesign build tiếp lên).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Row content redesign](./phase-01-row-content-redesign.md) | Completed |
| 2 | [Panel shell and scoped styles](./phase-02-panel-shell-and-scoped-styles.md) | Completed |
| 3 | [Integration and visual QA](./phase-03-integration-and-visual-qa.md) | Pending |

## Markup ⇄ style contract (chia structure / style)

`tooltip-render.ts` chỉ emit class `cpt-*` (thuần, test được); `pet-tooltip.ts` set **shell `#pet-tooltip` bằng inline style** (bg trắng/width 400/radius/shadow/font — để happy-dom assert qua `el.style.*`) và inject 1 `<style id="cpt-tooltip-style">` cho **`@import` font + `#pet-tooltip::after` (caret) + `.cpt-*`** bằng **giá trị token**.

```
<div class="cpt-row cpt-row--{state}">
  <div class="cpt-head">
    <span class="cpt-dot cpt-dot--{state}"></span>
    <span class="cpt-badge">{agentBadge}</span>        // bỏ nếu rỗng
    <span class="cpt-name" title="{hover}">{displayName}</span>
    <span class="cpt-timer">{formatDuration(now-since)}</span>
  </div>
  <div class="cpt-state cpt-state--{state}">{emoji} {label}</div>
  // working+tool:   <div class="cpt-cmd"><span class="cpt-tool">{tool}</span> · {toolInput}</div>
  // waiting+message:<div class="cpt-cmd cpt-cmd--ask">{message}</div>
  // model/tokens:   <div class="cpt-meta"><span class="cpt-model">{shortModel}</span> <span class="cpt-tok-in">↑{in}</span> <span class="cpt-tok-out">↓{out}</span></div>
</div>
// >5: <div class="cpt-more">+N more</div>   // empty: <div class="cpt-empty">Chưa có session nào</div>
```

Token values (inline vào stylesheet, KHÔNG import file): state working `#3B82F6` · waiting `#F59E0B` · done `#22C55E` · error `#EF4444` · idle `#94A3B8`; ink `#1E1E2E`/muted `#64748B`/faint `#94A3B8`; line `rgba(15,23,42,.08)`; radius `12px`; shadow `0 8px 30px rgba(0,0,0,.45)`. Fonts (3, đã chốt): `@import` Pixelify Sans + Nunito + JetBrains Mono (`display=swap`).

## Acceptance Criteria

- [ ] Panel nền **trắng `#FFFFFF`**, **width 400px** cố định; chỉ hiện khi working/waiting (`hasActiveSessions` giữ nguyên).
- [ ] Mỗi row: `dot(màu state)` + `badge(từ đầy đủ: Claude/Codex/Gemini/run)` + `name` + `timer(now−since)` / `state label(theme)` / `command trần xuống dòng riêng, đủ` / `model + ↑in ↓out`.
- [ ] **BỎ** dòng cwd hiển thị, **BỎ** "X trước" (last-activity). Hover `title` enrichment giữ nguyên.
- [ ] Caret tam giác trỏ xuống pet.
- [ ] `escHtml()` giữ cho name/tool/toolInput/message/model (XSS); `<script>` bị escape.
- [ ] **Overlay trong suốt còn nguyên** — KHÔNG import design-tokens.css global; stylesheet inject KHÔNG chứa rule `html/body/*`.
- [ ] `pnpm test` + `pnpm exec tsc --noEmit` xanh; test `tooltip-render` + `pet-tooltip` pass.

## Risks

| # | Mức | Rủi ro | Giảm thiểu |
|---|-----|--------|-----------|
| R1 | **CAO** | Import `design-tokens.css` global → `body{background:dark}` + reset `*{}` phá overlay trong suốt | CHỈ inject scoped `#pet-tooltip`/`.cpt-*`; cấm rule `html/body/*` trong stylesheet; Phase 3 QA verify desktop xuyên qua được |
| R2 | TB | 3 webfont FOUT/fetch trên overlay luôn bật (user đã chấp nhận) | `font-display:swap`; fallback `system-ui`/`monospace` đọc được. CSP hiện `null` → fetch OK; thêm CSP sau phải cho `fonts.googleapis.com`+`gstatic.com` |
| R3 | TB | Đổi markup phá test cũ (matcher inline-style/contiguous) | TDD: cập nhật assertion có chủ đích; preserve-list liệt kê rõ ở Phase 1 |
| R4 | Thấp | Caret lệch khi panel bị clamp sát mép màn hình | Pet rest window-center, hiếm khi clamp ngang; chấp nhận + note; tương lai: caret-x động |
| R5 | Thấp | happy-dom không layout → `offsetWidth=0` | Test assert style-prop + cấu trúc, KHÔNG assert geometry; `positionPanel` fallback `||400` |
| R6 | Thấp | `@import` không nằm đầu stylesheet → font bị bỏ qua | Đặt `@import` ở đầu chuỗi CSS inject |

## Dependencies

- Cross-plan: tiền nhiệm `260624-0755-pet-fixed-session-panel` đã `completed` → không block. Cùng chạm `pet-tooltip.ts`/`tooltip-render.ts` nhưng tuần tự, không song song.
- Ngoài: không có. Thuần frontend 2 file + tests; Rust/window không đổi.

## Open Questions

1. Caret giữ cố định giữa panel (chốt mặc định) hay tính x động theo pet khi clamp — Phase 2 làm cố định, để ngỏ nâng cấp.
2. `cpt-cmd--ask` (waiting message) hiện plain text; KHÔNG bold substring lệnh (message là chuỗi tự do, không tách được an toàn) — khác mockup (mockup bold "git push" trên chuỗi cố định). Chấp nhận.
3. Command (`toolInput`) hiển thị **nguyên văn + wrap** (`overflow-wrap:anywhere`); KHÔNG rút gọn path (`~` + ellipsis-giữa) round này — mockup rút gọn chỉ để minh hoạ. Để ngỏ nâng cấp nếu path dài gây rối.
