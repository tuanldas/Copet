# Redesigned pet session panel from dark 200px tooltip to white 400px card with semantic HTML/CSS

**Date**: 2026-06-24 14:00
**Severity**: Medium (UX redesign + architecture fix)
**Component**: pet (tooltip-render, pet-tooltip, CSS architecture)
**Status**: Resolved (committed @ 8d0f695 impl + 6e447ca plan; staged, not pushed; Phase 3 visual QA pending)

## What Happened

Pet session panel redesigned from a small dark tooltip (≈200px, minimal state) to a white fixed-400px card displaying rich session metadata: state dot (color-coded) + agent badge (full word) + session name + status line (prompt-runtime timer / theme label) + command (tool·input or waiting message) + model + token counts (↑in ↓out), each row semantically marked with `cpt-*` CSS classes. Removed cwd line and "X trước" (last-activity) line entirely.

## The Brutal Truth

This redesign exposed a hard architectural decision: **do NOT import `design-tokens.css` globally into the pet window**. Why it matters: `design-tokens.css` sets `body { background: dark }` + a universal reset rule (`* {}`), which would have shattered the transparent overlay the pet window requires. The moment you import that file, the overlay becomes opaque dark gray. We discovered this was the top risk (R1) in planning and burned the first 2 hours spinning on "why is the overlay opaque?" before realizing: don't import it.

**The fix:** inject ONE scoped `<style>` tag directly into `pet-tooltip.ts` (via `el.innerHTML += '<style>...'`) with rules constrained to `#pet-tooltip` and `.cpt-*` children only. The sheet includes design-token values (colors, fonts, spacing) inlined or re-declared, plus three Google font `@import` rules (`Pixelify`, `Nunito`, `JetBrains Mono`). Inline styles remain in the shell (`<div id="pet-tooltip" style="position:fixed;width:400px;...">`) so `positionPanel` reads a stable width at layout time and happy-dom tests can assert via `el.style.*` without reading a stylesheet.

This is a **permanent gotcha** in this codebase: the pet window is a transparent overlay. Never glob-import reset/foundation CSS into it. Scope everything to the components you own.

## Technical Details

**Row builder refactor (`tooltip-render.ts`):**
- Now emits semantic `cpt-session-row`, `cpt-state-dot`, `cpt-agent-badge`, `cpt-command`, `cpt-tokens` classes instead of opaque `<div>` soup.
- Pure function, zero DOM side-effects — testable via string assertion in vitest.
- Predicate `hasActiveSessions` encapsulated; visibility logic is stateless.

**Panel shell (`pet-tooltip.ts`):**
- Inline styles for container + flex layout (position, width, max-height, padding, border-radius, box-shadow).
- ONE injected `<style>` tag containing:
  - `#pet-tooltip { /* flex container */ }`
  - `.cpt-session-row { /* row layout + fonts + spacing */ }`
  - `.cpt-state-dot { /* size + border-radius */ }`
  - `.cpt-agent-badge { /* color-keyed backgrounds */ }`
  - Color variables (risk-green, warning-yellow, error-red for state dots).
  - All three Google fonts via `@import url(...)`.
- Caret (`::after`, white triangle pointing down at anchor).
- CSS contains a test assertion: `no body|html|* rules` (checked via regex in test).

**Test suite:**
- Updated `tooltip-render.test.ts`: row HTML now checks for `cpt-*` classes + token counts in correct order.
- Added `pet-tooltip.test.ts` (happy-dom): mounts panel, asserts inline style width/height, verifies injected sheet has no global rules, fires visibility toggle.

**Outcome:**
- 308/308 vitest pass (7 new tests in `pet-tooltip.test.ts`).
- `tsc --noEmit` clean, no TS errors.
- Code review: DONE (0 blockers, 1 small nit on font-loading order — accepted as-is).

## User Choice Recorded

**Loaded all three design-system fonts** (`Pixelify`, `Nunito`, `JetBrains Mono`) despite the always-on-overlay fetch cost. CSP is `null` so fetch works; trade-off accepted: minor network latency on app start vs. visual fidelity. Fonts are cached after first fetch.

## Follow-up: Phase 3 Visual QA

Commits **8d0f695** (impl) + **6e447ca** (plan/brainstorm) staged, not pushed. Visual QA pending (`pnpm tauri dev`):
- Transparent overlay intact (not opaque).
- Font rendering crisp (especially `Pixelify` for badges).
- Caret alignment at anchor.
- Panel width/height on various screen DPI.
- Click-through behavior unchanged (overlay still passthrough outside panel bounds).

## Artifacts

- Plan: `plans/260624-1112-pet-session-panel-white-redesign/plan.md`
- Phase 1 (row builder): `plans/260624-1112-pet-session-panel-white-redesign/phase-01-tooltip-render-refactor.md`
- Phase 2 (panel shell + CSS): `plans/260624-1112-pet-session-panel-white-redesign/phase-02-pet-tooltip-inject-scoped-styles.md`
- Code review (independent): `plans/260624-1112-pet-session-panel-white-redesign/reports/code-review-260624-1135-session-panel-white-design-review-report.md`
