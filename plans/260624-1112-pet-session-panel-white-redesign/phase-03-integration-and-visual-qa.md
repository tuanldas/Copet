---
phase: 3
title: "Integration and visual QA"
status: pending
effort: "S"
---

# Phase 3: Integration and visual QA

## Overview

Chạy quality gates + QA trực quan trong app thật (`pnpm tauri dev`). Trọng tâm: xác nhận **overlay trong suốt còn nguyên** (R1) và panel khớp design — những thứ unit test (happy-dom) không phủ được.

## Requirements

- Functional: panel render đúng design trên session working + waiting + nhiều session.
- Non-functional: overlay trong suốt, click-through, font load, không console error.

## Architecture

Không code mới. Gate tự động (test/tsc) + checklist thủ công trong app. Rust/window không đổi → không cần `cargo` (chạy `cargo check` xác nhận no-op nếu muốn).

## Related Code Files

- Verify: `src/pet/tooltip-render.ts`, `src/pet/pet-tooltip.ts`, 2 file test.
- Không sửa code trừ khi gate đỏ (fix rồi chạy lại).

## Implementation Steps

1. Gate tự động:
   - `pnpm test` (toàn bộ; nhất là `tooltip-render` + `pet-tooltip`) → xanh.
   - `pnpm exec tsc --noEmit` → xanh.
   - (tuỳ chọn) `cargo check --workspace` → no-op (frontend-only).
2. `pnpm tauri dev` — checklist QA:
   - [ ] Panel nền **trắng**, rộng ~**400px**, hiện khi có session working.
   - [ ] Header: dot (xanh working / cam waiting) · badge **"Claude"** (từ đầy đủ) · name · **timer đếm tăng**.
   - [ ] State label theo theme (kitchen: "Cooking"/"Hungry"); command **trần, xuống dòng riêng, đủ**.
   - [ ] model + `↑in ↓out` hiển thị khi có enrichment.
   - [ ] **KHÔNG** dòng cwd; **KHÔNG** "X trước".
   - [ ] **Caret** trỏ xuống pet.
   - [ ] **Overlay trong suốt còn nguyên** — desktop xuyên qua, body KHÔNG bị tô nền tối (verify R1).
   - [ ] Font load (mono name/command, Pixelify timer); fallback đọc được nếu chậm.
   - [ ] Waiting: theme label + **permission message** hiển thị.
   - [ ] Nhiều session: divider giữa rows; ≥6 → "+N more".
   - [ ] Click-through còn (pointer-events:none); không console error.
3. Escape spot-check: session name `<script>` → escaped trong DOM (không tạo node script).

## Success Criteria

- [ ] Tất cả gate tự động xanh.
- [ ] Checklist QA pass, đặc biệt overlay trong suốt + caret + nền trắng + bỏ cwd/"trước".
- [ ] Không regression click-through / console error.

## Risk Assessment

R1 verify ở đây là chốt chặn cuối. Nếu overlay bị tô tối → revert global import, đảm bảo chỉ scoped inject. R2 (FOUT) chỉ là thẩm mỹ thoáng qua, fallback chấp nhận.
