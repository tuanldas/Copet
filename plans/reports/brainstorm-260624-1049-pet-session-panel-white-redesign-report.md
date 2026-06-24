# Brainstorm — Redesign pet session panel (nền trắng, 400px)

- **Ngày:** 2026-06-24 10:49 · **Branch:** `fix/session-list-lifecycle`
- **Loại:** brainstorm UI · **Flags:** none (no `--html`/`--wiki`)
- **Trạng thái:** Design chốt — chỉ viết doc, CHƯA implement, CHƯA plan
- **Mockup tham chiếu:** `./brainstorm-260624-1049-pet-session-panel-white-redesign-mockup.png` · HTML: `…-mockup.html`

## 1. Vấn đề & yêu cầu

Yêu cầu gốc (từ ảnh CleanShot): *"kéo dài chiều ngang phần này ra gấp đôi, đổi màu nền thành trắng, rồi design lại"*. "Phần này" = **session panel nổi trên con pet** (`#pet-tooltip`).

Yêu cầu cụ thể đã chốt qua hỏi-đáp:

| # | Hạng mục | Quyết định |
|---|---|---|
| 1 | Chiều rộng | **400px ép cứng** (gấp đôi `max-width:200px` hiện tại; luôn rộng, không co giãn) |
| 2 | Nền | **Trắng thuần `#FFFFFF`** (mặc định A; B `#F8FAFC` / C `#FAFAF9` đã loại tạm) |
| 3 | Phạm vi | **Redesign + thêm thông tin** (không chỉ reskin) |
| 4 | Triển khai | **Dùng `design-tokens.css`** (font/màu/spacing/radius hệ thống) |
| 5 | Khối lệnh | **Tách xuống dòng riêng, KHÔNG nền/khung** (chữ trần mono) |
| 6 | Thời gian | **Chỉ 1 con số = thời gian chạy prompt** (`dur` = now − `since`); BỎ "30s trước" |
| 7 | cwd | **BỎ** dòng đường dẫn dự án |
| 8 | Caret | **Giữ** — tam giác đáy panel trỏ xuống pet |

## 2. Scout — kiến trúc liên quan (touchpoints)

Panel trong ảnh KHÔNG phải tray popover (`CompanionCard`/`sessions.css`) mà là **tooltip gắn pet**:

- `src/pet/pet-tooltip.ts` — mount + định vị + **base styles inline** (`maxWidth:200px`, `background:rgba(15,23,42,0.92)`, chữ `#f1f5f9`). Panel `position:fixed`, `pointer-events:none`, clamp trong cửa sổ, refresh `paint()` mỗi 1s.
- `src/pet/tooltip-render.ts` — **builder HTML thuần** từng row; phân cấp chữ dựa trên `opacity` trên nền tối. Có `escHtml()` (XSS).
- `src/pet/__tests__/tooltip-render.test.ts` — assert markup hiện tại → **phải cập nhật**.
- `src/ui/shared/design-tokens.css` — nguồn font (Pixelify/Nunito/JetBrains Mono), màu state, spacing, radius.
- `src/types/session-snapshot.ts` + `src/agent-bridge/session-tracker.ts` — `SessionSnapshot`. **`since` = "how long this turn has run"** (reset mỗi prompt mới; giữ qua working↔waiting) → chính là "thời gian chạy prompt". `ts` = last activity (bỏ).

## 3. Hướng đã cân nhắc

| Hướng | Mô tả | Kết luận |
|---|---|---|
| Reskin tối giản | Chỉ đổi màu+width, giữ layout | Loại — user muốn redesign |
| **Redesign + thêm thông tin** | Bố cục lại + lộ model/tokens + dot/divider/caret | **Chọn** |
| Redesign + cwd/prompt/summary | Lộ thêm nhiều field hover | Một phần — user BỎ cwd, gọn lại |

**Brutal honesty đã nêu:** panel nền trắng là "đốm sáng" lạc trên dark theme của app + nổi trên desktop → chói hơn bản tối. User chấp nhận đánh đổi.

## 4. Design chốt (spec cho implementer)

Mỗi session = **4 dòng** trong panel trắng 400px:

```
┌──────────────────────────────────────────────┐
│ ● C  baitapthuctaposo                    4m   │  header: dot + badge + tên(mono) + timer(prompt runtime, phải)
│ 🍳 Cooking                                    │  state label (màu theo state)
│ Bash · cd ~/Desktop/Codes/tuanldas/Copet      │  lệnh: tool(accent) + toolInput — trần, mono, xuống dòng
│ opus-4.8   ↑12.3k ↓3.4k                       │  meta: pill model + tokens(↑xanh ↓lam)
├──────────────────────────────────────────────┤  divider giữa các session
│ ● Cx copet-docs                         12m   │
│ ⏳ Chờ duyệt                                   │
│ Cho phép chạy **git push origin main**?       │  waiting → message, lệnh in đậm amber
│ gpt-5      ↑8.1k ↓1.9k                        │
└───────────────────┬──────────────────────────┘
                    ▼ caret trỏ xuống pet
```

**Mapping dữ liệu → UI:**
- **timer** `4m`/`12m` = `formatDuration(now − since)` (đã có sẵn là `dur`); đếm tăng nhờ refresh 1s sẵn có.
- **status dot + nhãn + badge** tô màu theo `state` qua token: working `#3B82F6` · waiting `#F59E0B` · done `#22C55E` · error `#EF4444` · idle `#94A3B8`.
- **badge** = `agentBadge(agent)` (pill màu state). **nhãn** = `getStateLabel(theme, state)` (emoji+text).
- **lệnh**: working → `tool` (accent) + ` · ` + `toolInput`; waiting → `message` (nhấn phần lệnh). Đường dẫn rút gọn (`~` + ellipsis-giữa nếu quá dài) — KHÔNG cắt giữa từ.
- **meta** = `shortModel(model)` pill + `↑formatTokens(tokensIn) ↓formatTokens(tokensOut)` (ẩn cả cụm nếu thiếu).
- **Bỏ:** `cwdFull`/`project` (dòng cwd), `now − ts` ("X trước").
- **Bố cục panel:** `width:400px`, `background:#FFFFFF`, ink `#1E1E2E`/`#64748B`/`#94A3B8` (thay opacity), border `rgba(15,23,42,0.08)`, radius `12px`, shadow `0 8px 30px rgba(0,0,0,.45)`.

## 5. Cân nhắc triển khai & rủi ro

- **Inline → stylesheet:** caret (`::after`) + class theo row + dùng token KHÔNG làm được bằng `Object.assign(el.style,…)` thuần. Implementer cần **inject 1 `<style>` scoped `#pet-tooltip`** một lần (hoặc constructed stylesheet), thay cho `applyBaseStyles` inline. Caret có thể là `::after` hoặc 1 `<div>` con.
- **Token/font trong pet window:** đảm bảo `design-tokens.css` (vars + `@import` Google Fonts) được nạp vào window chứa pet (`main.ts`/index pet). Nếu không, inline trực tiếp giá trị token cần dùng.
- **Định vị:** cập nhật fallback `w = el.offsetWidth || 200` → `400`. Panel rộng 400px gần mép phải → `positionPanel` clamp `left ≤ vw−w` (đã có) sẽ đẩy panel lệch khỏi tâm pet → **caret có thể lệch không trỏ đúng đỉnh pet**. Chấp nhận, hoặc chỉnh caret-x động (ngoài scope round này).
- **XSS:** GIỮ `escHtml()` cho `name`/`tool`/`toolInput`/`message`/`model`.
- **Tests:** `tooltip-render.test.ts` assert markup cũ → viết lại theo markup mới (dot/badge/timer/command/meta; không cwd, không "trước").
- **Nền trắng:** chữ + state-color đều đọc tốt trên trắng; chỉ cần thay mọi `opacity-trên-nền-tối` → màu ink cụ thể.

## 6. Tiêu chí nghiệm thu

1. Panel render **trắng `#FFFFFF`, rộng 400px**, chỉ hiện khi có session working/waiting (giữ `hasActiveSessions`).
2. Hiển thị đúng 4 dòng/session: dot+badge+tên+**timer chạy prompt**, nhãn trạng thái, **khối lệnh trần đầy đủ (không cụt giữa từ)**, model+tokens.
3. **KHÔNG** còn dòng cwd, **KHÔNG** còn "X trước".
4. Caret tam giác trỏ xuống pet.
5. `escHtml` còn nguyên; `pnpm exec tsc --noEmit`, `pnpm test` (sau khi sửa test), `cargo` không đổi → xanh.

## 7. Bước tiếp theo & phụ thuộc

- Bước kế (khi sẵn sàng): `/ck:plan` với report này làm input → tách phase (1: tooltip-render markup + test; 2: pet-tooltip styles/caret/định vị; 3: nạp token vào pet window).
- Phụ thuộc: không có dependency ngoài; thuần frontend 2 file + 1 test.

## 8. Câu hỏi chưa chốt

1. **Sắc nền:** mặc định A `#FFFFFF`; chưa xác nhận tường minh có muốn B/C không.
2. **Rút gọn đường dẫn lệnh:** quy tắc `~` + ellipsis-giữa là đề xuất — chốt cụ thể khi implement.
3. **Caret alignment** khi panel bị clamp lệch khỏi tâm pet: giữ caret cố định giữa panel hay tính x động theo vị trí pet?
