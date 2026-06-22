# Pet Animation + Tamagotchi Research — Copet
Date: 2026-06-22 | Scope: Tauri v2 desktop pet, full Tamagotchi gamification

---

## 1. Tóm tắt

Stack khuyến nghị: **Vanilla TS + Canvas 2D** (không framework, không PixiJS) cho pet render; **XState v5 @xstate/store** cho state machine; **tauri-plugin-store** (JSON) cho persistence. Petdex pet-pack format (pet.json + spritesheet 8×9) nên được áp dụng làm chuẩn nội bộ — có sẵn ecosystem + tooling. Live2D và Rive bị loại vì overhead không xứng với use-case 1 nhân vật nhỏ.

---

## 2. Khuyến nghị Animation (ranked)

### #1: Vanilla TS + Canvas 2D + spritesheet — RECOMMENDED
- Bundle: ~0KB overhead, chỉ game logic
- CPU khi idle: <1% nếu dùng `requestAnimationFrame` + pause khi window ẩn (`visibilitychange`)
- Phù hợp 1 pet, 8-10 trạng thái, sprite 192×208px
- Giảm FPS khi background: `document.addEventListener('visibilitychange', pauseLoop)`
- Tauri transparent window: `alwaysOnTop:true, transparent:true, decorations:false` — đã có tutorial thực tế (CrabNebula)

### #2: PixiJS AnimatedSprite — nếu cần nhiều hiệu ứng particle/glow
- Bundle: ~120KB gzip; WebGL → GPU render → CPU giải phóng khi render
- Nhưng: PixiJS app ăn CPU kể cả idle (known issue html5gamedevs forum 2018, chưa fix hoàn toàn)
- Chỉ chọn nếu sau này cần hiệu ứng phức tạp (particles, shaders); overkill cho pet đơn giản

### #3: CSS Sprite Animation — KHÔNG dùng
- Không kiểm soát được frame timing chính xác; khó đồng bộ state machine
- Chỉ phù hợp prototype nhanh

### Loại bỏ hoàn toàn
- **Live2D**: CPU spike 100% khi hardware acceleration off; licensing phức tạp; overkill
- **Lottie**: SVG renderer ăn CPU 5-20%+; web version không phù hợp background app
- **Rive**: WASM runtime 200KB; GPU render tốt nhưng overhead khởi động; file format độc quyền

### Frontend framework cho phần pet
Không dùng React/Svelte cho canvas layer. **Vanilla TS** render vào `<canvas>`. Nếu cần UI panel (stats, shop) → SolidJS (nhẹ hơn React 30×, không VDOM). Pattern: SolidJS UI overlay + vanilla canvas pet layer, tách biệt DOM trees.

---

## 3. State Machine

### Dùng @xstate/store (<1KB) — không phải XState full
XState full bundle ~40KB là quá mức. `@xstate/store` đủ cho event-driven state với typed transitions.

```ts
// States: idle | walk | drag | sleep | happy | eat | working | celebrate | error | evolve
// Input events: TICK | FEED | PET | DRAG_START | DRAG_END | AGENT_EVENT | SLEEP | WAKE
```

### Map: agent state + stats → pet mood
```
agent.idle + hunger>70 + happiness>60  → idle/walk (random)
agent.working                           → working (typing animation)
agent.done + lastTask=success           → celebrate
agent.done + lastTask=error             → error
hunger<20                               → unhappy_idle (droopy)
energy<15                               → sleep (forced)
happiness>90 + fed_recently             → happy (hearts)
dragging                                → drag (override mọi state khác)
```

Ưu tiên: drag > sleep_forced > agent_state > hunger/mood overlay

---

## 4. Tamagotchi Mechanics + Công thức + Lưu trữ

### 4.1 Stats & Decay

4 chỉ số cơ bản: `hunger` (0-100), `energy` (0-100), `happiness` (0-100), `hygiene` (0-100)

Decay theo thời gian thực (tính mỗi TICK = 1 phút):
```
hunger    -= 0.5/min  (đói sau ~3.3h nếu không ăn)
energy    -= 0.3/min  (cạn sau ~5.5h)
happiness -= 0.4/min  (decay nhanh hơn nếu hunger<30: ×1.5)
hygiene   -= 0.2/min  (ít quan trọng, ảnh hưởng happiness)
```

Overweight penalty (nếu bổ sung stat `weight`): decay happiness thêm 20% nếu weight>120.

### 4.2 XP & Level

```
xp_per_level(n) = 100 * (1.5 ^ n)   // exponential curve
```
XP nguồn:
- Agent task hoàn thành: +10-50 XP (tùy độ phức tạp)
- Feeding đúng lúc: +2 XP
- Petting/interaction: +1 XP
- Penalty: -5 XP nếu pet chết/ngất

Token sinh từ agent activity: mỗi tool_call = 1 token, dùng mua food/items.

### 4.3 Evolution (4 giai đoạn gợi ý)
```
Stage 0: Egg       (level 0-4)    — chưa hatch
Stage 1: Hatchling (level 5-19)   — basic idle/walk
Stage 2: Juvenile  (level 20-49)  — thêm celebrate/work anim
Stage 3: Adult     (level 50-99)  — full animation set
Stage 4: Legend    (level 100+)   — special aura/effect
```
Evolution trigger: đạt level + care_score >= threshold (tránh evolve khi stats thấp liên tục).

`care_score` = trung bình rolling 7-ngày của (hunger+energy+happiness)/3. Evolve cần care_score ≥ 60.

### 4.4 Offline Time Handling

```
offline_minutes = (now - last_saved_timestamp) / 60000
max_offline_decay = 120  // tối đa 2h decay (không phạt quá nặng)
actual_decay_time = min(offline_minutes, max_offline_decay)
hunger -= 0.5 * actual_decay_time
energy -= 0.3 * actual_decay_time
// clamp all stats to [0, 100]
```

Khi mở app: hiện toast "Pet đã đợi X phút, hunger=Y" — tạo cảm giác guilt nhẹ (core Tamagotchi loop).

### 4.5 Lưu trữ: tauri-plugin-store (JSON) — RECOMMENDED

So sánh:
| | tauri-plugin-store | SQLite (tauri-plugin-sql) |
|---|---|---|
| Dữ liệu | Key-value JSON | Relational, query |
| Khi nào dùng | Đơn giản, settings, stats | History log, nhiều bảng |
| Bundle overhead | Nhỏ (Rust, native) | Lớn hơn |
| Phù hợp Copet | ✅ stats + evolution state | Cần nếu thêm achievement/history |

Dùng **tauri-plugin-store** cho core pet state. Nếu sau này thêm achievement history/item log → thêm SQLite. Không cần ngay.

Schema JSON đề xuất:
```json
{
  "pet": { "id": "cat-01", "stage": 2, "level": 35, "xp": 420 },
  "stats": { "hunger": 72, "energy": 55, "happiness": 80, "hygiene": 90 },
  "meta": { "last_saved": 1719000000000, "tokens": 150, "care_score_7d": 73.5 }
}
```

Auto-save mỗi 60s + khi app close (`tauri::AppExit` event).

---

## 5. Nguồn Asset + Pet-Pack Format

### 5.1 Asset nguồn (free, license rõ)

| Nguồn | License | Ghi chú |
|---|---|---|
| [Kenney.nl](https://kenney.itch.io/kenney-game-assets) | CC0 | 60K+ assets, pixel art packs |
| [OpenGameArt.org](https://opengameart.org/) | CC0/CC-BY/GPL | Filter theo license |
| [itch.io free sprites](https://itch.io/game-assets/free/tag-pixel-art) | varies | Filter "Free" + check license từng pack |
| [Petdex gallery](https://petdex.dev/) | varies per pet | Community-submitted pets, có thể dùng làm inspiration |
| [Codex Pets org](https://codexpets.org/) | open-source | Browse, preview Codex pets |

AI-gen sprites: Gemini/Imagen có thể gen pixel art nhưng cần post-process thành spritesheet đúng grid. Dùng để thêm variants/stages, không nên dùng làm primary asset vì khó nhất quán giữa các states.

### 5.2 Petdex Pet-Pack Format — NÊN DÙNG

Format: `pet.json` + `spritesheet.webp` (hoặc .png)

Spritesheet: **8 hàng × 9 cột = 72 frames**, mỗi frame 192×208px → tổng 1536×1872px

Animation rows (Petdex):
```
Row 0: idle (6f)   Row 1: wave (9f)    Row 2: run (9f)
Row 3: failed (9f) Row 4: review (6f)  Row 5: jump (9f)
Row 6: extra1 (9f) Row 7: extra2 (9f)
```

Copet cần map thêm states (eat, sleep, drag, working, celebrate) → dùng extra1/extra2 + mở rộng format nếu cần. Đề xuất: **giữ tương thích Petdex cho base states**, thêm `copet_extensions` field trong pet.json cho states bổ sung.

Lợi ích chuẩn hoá pet-pack:
- Community có thể đóng góp pet (cần 1 spritesheet + JSON)
- Tool có sẵn: [Petdex submit](https://petdex.dev/), TexturePacker để tạo spritesheet
- 21+ projects đã dùng format này → tái sử dụng asset từ Petdex gallery

---

## 6. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Click-through transparent window Tauri | Cao | Bug/feature request open (#13070); workaround: Rust ignores cursor events toàn window → mất interaction | 
| Canvas CPU khi Tauri webview bị throttle | Trung | Dùng `visibilitychange` + `Page Visibility API` để pause loop |
| Offline decay quá khắt khe → user quit | Trung | Cap decay 2h; hiện thông báo thân thiện, không penalty XP |
| Pet-pack asset license mơ hồ trên itch.io | Cao | Chỉ dùng CC0 hoặc viết tay license check; Kenney là an toàn nhất |
| XState full bundle nếu nhầm import | Thấp | Chỉ import `@xstate/store`, không import `xstate` |
| Evolution trigger ngay khi level up nhưng stats thấp | Thấp | Gate bằng care_score 7-ngày rolling average |

---

## 7. Link nguồn

- [CrabNebula: Building Desktop Pet with Tauri](https://crabnebula.dev/blog/building-a-desktop-pet-with-tauri/)
- [Petdex — Animated companions for Codex](https://petdex.dev/docs)
- [Petdex GitHub (crafter-station)](https://github.com/crafter-station/petdex)
- [AgentPet GitHub (ntd4996)](https://github.com/ntd4996/agentpet)
- [OpenPets GitHub (alvinunreal)](https://github.com/alvinunreal/openpets)
- [Tauri v2 Window Customization](https://v2.tauri.app/learn/window-customization/)
- [tauri-plugin-store official docs](https://v2.tauri.app/plugin/store/)
- [XState GitHub](https://github.com/statelyai/xstate) + [@xstate/store <1KB]
- [PixiJS Performance Tips](https://pixijs.com/8.x/guides/concepts/performance-tips)
- [Rive vs Lottie comparison](https://rive.app/blog/rive-as-a-lottie-alternative)
- [Kenney CC0 assets](https://kenney.itch.io/kenney-game-assets)
- [OpenGameArt](https://opengameart.org/)
- [Tamagotchi Care Wiki](https://tamagotchi.fandom.com/wiki/Care)
- [Tauri transparent click-through issue #13070](https://github.com/tauri-apps/tauri/issues/13070)
- [PixiJS CPU background issue](https://www.html5gamedevs.com/topic/33950-reducing-cpu-utilization-when-pixi-app-is-in-background/)

---

## 8. Câu hỏi mở

1. **Click-through**: Copet có cần user click xuyên qua pet để interact với app bên dưới không? Nếu có, cần giải pháp Tauri-level (issue chưa close).
2. **Evolution art**: Mỗi stage cần 1 spritesheet riêng hay dùng palette-swap + overlay? Ảnh hưởng lớn đến asset budget.
3. **Token economy**: "token/burn từ agent activity" — token dùng để mua gì? Shop item? Cosmetics? Cần định nghĩa trước khi build economy loop.
4. **Multi-pet**: 1 pet cố định hay user có thể chuyển đổi giữa các pet? Ảnh hưởng đến schema lưu trữ.
5. **Petdex compatibility**: Có muốn Copet submit pets lên Petdex gallery không? Nếu có, cần giữ 8×9 row spec đúng chuẩn.

---

Status: DONE_WITH_CONCERNS
Summary: Vanilla TS + Canvas 2D + @xstate/store + tauri-plugin-store là stack tối ưu cho desktop pet nhẹ; Petdex pet-pack format nên được áp dụng làm chuẩn. Concern chính: Tauri click-through transparent window chưa được hỗ trợ native (issue open), cần workaround hoặc accept giới hạn interaction.
Concerns/Blockers: Tauri click-through trên transparent window là technical risk cao nhất — nếu Copet cần user interact qua pet layer thì cần PoC sớm trước khi commit architecture.
