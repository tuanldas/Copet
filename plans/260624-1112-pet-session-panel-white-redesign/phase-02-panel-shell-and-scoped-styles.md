---
phase: 2
title: Panel shell and scoped styles
status: completed
effort: M
---

# Phase 2: Panel shell and scoped styles

## Overview

Đổi `src/pet/pet-tooltip.ts`: panel nền trắng + width 400px + caret; inject **1** stylesheet scoped `#pet-tooltip` (token values + 3 font) định nghĩa toàn bộ `.cpt-*` của Phase 1. TDD bằng happy-dom. **Guard sống còn:** KHÔNG import `design-tokens.css` global (phá overlay trong suốt).

## Requirements

- Functional: `mountTooltip` inject `<style id="cpt-tooltip-style">` đúng 1 lần (kể cả mount lại); panel `width:400px`, `background:#FFFFFF`, `pointer-events:none`, `position:fixed`; caret `::after`; `update`/`applyVisibility`/`destroy`/refresh-1s/resize giữ nguyên hành vi.
- Non-functional: stylesheet KHÔNG chứa rule `html`/`body`/`*`; `@import` font ở đầu; `font-display:swap`.

## Architecture

Panel **shell = inline** (`applyBaseStyles`): `position:fixed`, `zIndex`, `pointerEvents:none`, `width:400px`, `background:#FFFFFF`, `color:#1E1E2E`, `borderRadius:12px`, `boxShadow`, `border`, `fontFamily` (Nunito stack), `fontSize`. Để inline vì (a) `positionPanel` đọc width tin cậy, (b) test happy-dom assert qua `el.style.*` — computed-style từ injected sheet KHÔNG tin cậy trong happy-dom. **Stylesheet inject = chỉ thứ inline không làm được:** `@import` 3 font + `#pet-tooltip::after` (caret) + mọi `.cpt-*` (màu theo state, font theo element). Inject 1 lần ở `document.head`, scoped `#pet-tooltip`.

## Related Code Files

- Modify: `src/pet/pet-tooltip.ts` (`applyBaseStyles`, thêm `injectStyleOnce`, `positionPanel` fallback `||200`→`||400`).
- Create: `src/pet/__tests__/pet-tooltip.test.ts` (happy-dom).
- Reference: giá trị token + contract trong `plan.md`; `src/ui/shared/design-tokens.css` (chỉ copy VALUE, không import).

## Implementation Steps

### A. Tests first (red) — `pet-tooltip.test.ts` (happy-dom)

1. `mountTooltip(canvas, ()=>({x:0,y:0}))` → `document.getElementById("pet-tooltip")` tồn tại, là con của `canvas.parentElement`.
2. Mount 2 lần → chỉ 1 `<style id="cpt-tooltip-style">` trong `document.head` (dedupe).
3. Panel: `el.style.width === "400px"`, background trắng, `pointerEvents === "none"`, `position === "fixed"`.
4. Stylesheet text chứa `#pet-tooltip::after` (caret) và KHÔNG chứa `body{`/`html{`/`*{` (guard overlay) và có `@import` ở đầu.
5. `update({sessions:[working], theme:"kitchen"})` → `display==="block"` + innerHTML chứa `cpt-row`; `update({sessions:[], …})` → `display==="none"`.
6. `destroy()` → element bị gỡ, `clearInterval` + `removeEventListener("resize")` (không throw); stylesheet có thể giữ (shared) — assert không nhân đôi khi mount lại sau destroy.

> happy-dom không layout: KHÔNG assert geometry (offsetWidth/left px). Chỉ assert style-prop + cấu trúc + không-throw.

### B. Implementation (green) — `pet-tooltip.ts`

1. `injectStyleOnce()`: nếu `document.getElementById("cpt-tooltip-style")` có → return; else tạo `<style id="cpt-tooltip-style">` với CSS text (thứ tự: `@import url(fonts 3 family display=swap)` ĐẦU TIÊN → `#pet-tooltip::after{…caret, nền trắng, border line…}` → mọi `.cpt-*` theo bảng token trong `plan.md`). KHÔNG đặt rule shell `#pet-tooltip{}` ở đây (shell đã inline) → tránh lệ thuộc computed-style. `document.head.appendChild`; gọi trong `mountTooltip` trước khi append `el`.
2. `applyBaseStyles` (inline shell): bỏ dark bg + `maxWidth:200px`; set `position:fixed`, `zIndex:9999`, `pointerEvents:none`, `width:400px`, `background:#FFFFFF`, `color:#1E1E2E`, `borderRadius:12px`, `boxShadow:0 8px 30px rgba(0,0,0,.45)`, `border:1px solid rgba(15,23,42,.08)`, `fontFamily:"'Nunito',system-ui,sans-serif"`, `fontSize:12px`.
3. `positionPanel`: fallback `const w = el.offsetWidth || 400` (thay 200); clamp `left/top` giữ nguyên. Comment caveat caret-center khi clamp (R4).
4. Giữ nguyên `paint`/`applyVisibility`/`onResize`/interval-1s/`destroy`.
5. Caret: `#pet-tooltip::after` trong stylesheet (KHÔNG cần element con).
6. **Guard:** tuyệt đối không `import "...design-tokens.css"`; CSS inject chỉ scoped `#pet-tooltip`/`.cpt-*`.

## Success Criteria

- [ ] `pnpm test src/pet/__tests__/pet-tooltip.test.ts` xanh.
- [ ] Stylesheet inject 1 lần; có caret; KHÔNG có `html/body/*`; `@import` đầu.
- [ ] Panel width 400 + nền trắng + pointer-events none (inline structural + `#pet-tooltip` visual).
- [ ] `pnpm exec tsc --noEmit` xanh.

## Risk Assessment

R1 (CAO): overlay vỡ nếu lỡ import token global → test bước A.4 chặn (`not contain body{/html{/*{`) + Phase 3 QA visual. R5: happy-dom no-layout → tránh assert geometry. R6: `@import` phải đầu chuỗi. R4: caret center có thể lệch khi clamp → note, không xử lý round này. CSP: `tauri.conf.json` hiện `csp:null` → fetch Google Fonts OK (HUD/Settings đã dùng `@import` tương tự); nếu sau thêm CSP phải cho `fonts.googleapis.com` + `fonts.gstatic.com` (font-src/style-src) kẻo font im lặng fail.
