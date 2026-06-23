# Copet — System Architecture

## High-Level Overview

Copet is a **Tauri v2** desktop app: Rust backend (core logic, IPC daemon, tray, commands) + web frontend (SolidJS + Canvas 2D). Pet window acts as the **single writer** of persistent state; other windows (HUD, Settings, Shop) are read-only clients.

Agent state flows: Agent CLI (hook or wrapper) → Unix socket → Tauri daemon → emits event → pet window receives → updates animation/mood/tooltip. Stats tick every 60s in the pet window; offline decay caps at 2h.

## Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent CLI (external)                    │
│  Claude Code, Codex, Gemini, or `copet run -- <cmd>`       │
└────────────────────────────┬────────────────────────────────┘
                             │
                    hook JSON over stdin
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              copet-hook (sidecar binary)                    │
│  - map_claude.rs / map_codex.rs / map_gemini.rs            │
│  - Parse hook → AgentEvent (canonical type)                │
└────────────────────────────┬────────────────────────────────┘
                             │
                  AgentEvent (JSON line)
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│         Unix Domain Socket (or named pipe on Win)           │
│              /tmp/copet-{uid}.sock                          │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
    ┌────────────────────────────────────────────────┐
    │      Tauri v2 App (src-tauri/src/lib.rs)       │
    │                                                │
    │  ┌──────────────────────────────────────────┐  │
    │  │ init_ipc()                               │  │
    │  │ - socket_daemon.rs                       │  │
    │  │ - listens for AgentEvent on socket       │  │
    │  │ - emits tauri::Event::agent-state-changed│  │
    │  └──────────────────────────────────────────┘  │
    │                                                │
    │  ┌──────────────────────────────────────────┐  │
    │  │ init_plugins()                           │  │
    │  │ - store (tauri-plugin-store)            │  │
    │  │ - positioner, window-state, autostart   │  │
    │  └──────────────────────────────────────────┘  │
    │                                                │
    │  ┌──────────────────────────────────────────┐  │
    │  │ init_windows()                           │  │
    │  │ - pet window (transparent, clickthrough) │  │
    │  │ - HUD/Settings/Shop (hidden by default)  │  │
    │  └──────────────────────────────────────────┘  │
    │                                                │
    │  ┌──────────────────────────────────────────┐  │
    │  │ init_tray()                              │  │
    │  │ - system tray menu                       │  │
    │  │ - color updates per agent state          │  │
    │  └──────────────────────────────────────────┘  │
    └────────────────────────────────────────────────┘
                     │                    │
        agent-state-changed             IPC commands
        (tauri::Event)                   (tsc_*)
                     │                    │
                     ▼                    ▼
    ┌──────────────────────────────────────────────┐
    │        Pet Window (WebView, owner)           │
    │              src/main.ts                     │
    │                                              │
    │  ┌────────────────────────────────────────┐  │
    │  │ initTamagotchi() [role: "owner"]       │  │
    │  │ - Load copet-pet.json from store       │  │
    │  │ - Offline decay (cap 2h)               │  │
    │  │ - Tick stats every 60s                 │  │
    │  │ - WRITES state back to store           │  │
    │  └────────────────────────────────────────┘  │
    │                                              │
    │  ┌────────────────────────────────────────┐  │
    │  │ mountPet(canvas)                       │  │
    │  │ - Canvas 2D sprite player              │  │
    │  │ - RenderLoop + AnimationController     │  │
    │  │ - Click/drag handlers                  │  │
    │  │ - Pet hit-rect polling                 │  │
    │  └────────────────────────────────────────┘  │
    │                                              │
    │  ┌────────────────────────────────────────┐  │
    │  │ initAgentBridge()                      │  │
    │  │ - Listens to tauri::Event              │  │
    │  │ - Session aggregate (working>waiting>  │  │
    │  │   done>idle)                           │  │
    │  │ - Triggers pet reaction (anim+glow)    │  │
    │  └────────────────────────────────────────┘  │
    │                                              │
    └──────────────────────────────────────────────┘
                     │
        pet state → HUD/Settings/Shop (read)
        Canvas render output (visual)
```

## Key Components

### 1. Tauri Core (src-tauri/)

**lib.rs** → setup split into 4 init functions (no merge conflicts):

#### init_plugins()
- `tauri-plugin-store` — JSON persistence (copet-pet.json, copet-economy.json)
- `tauri-plugin-positioner` — remember pet position per monitor
- `tauri-plugin-window-state` — window size/pos recovery
- `tauri-plugin-global-shortcut` — toggle pet hotkey
- `tauri-plugin-autostart` — launch on boot
- `tauri-plugin-notification` — stat alerts (optional)

#### init_windows()
- Pet window: transparent, always-on-top, no title bar, click-through (macOS alpha=0, fallback Rust cursor-poll)
- HUD window: stats + level/XP + agent status, initially hidden
- Settings window: agent toggle, hotkey, autostart, pet select, position reset
- Shop window: grid of food/cosmetics, buy with tokens

#### init_ipc()
- **socket_daemon.rs:** Listens on Unix socket (macOS/Linux) or named pipe (Windows)
- Reads `AgentEvent` (JSON line) from copet-hook sidecar
- Emits `tauri::Event::agent-state-changed` to all windows
- Handles multi-session aggregation (session_id tracking)

#### init_tray()
- **tray.rs:** System tray icon + popover sessions window
- Left-click tray → toggle sessions popover (TrayBottomCenter, Rust-side positioner)
- Menu (right-click): Show/Hide pet, open HUD/Settings/Shop, quit
- Icon color changes per dominant agent state (working=blue, waiting=amber, done=green, error=red, idle=gray)

### 2. Commands (src-tauri/src/commands/)

| Command | Module | Purpose |
|---------|--------|---------|
| `set_pet_hit_rect(x, y, w, h)` | lib.rs | Frontend reports pet's interactive rect for click-through hit-test |
| `open_hud`, `open_settings`, `open_shop` | window_commands.rs | Show/focus specific windows |
| (sessions popover) | tray.rs | `toggle_sessions_popover` — tray left-click shows/hides the popover (no IPC command) |
| `toggle_pet` | window_commands.rs | Show/hide pet window |
| `reset_pet_position` | window_commands.rs | Revert to center-screen |
| `enable_autostart`, `is_autostart_enabled` | system_commands.rs | Manage boot launch |
| `set_global_shortcut`, `get_settings`, `select_pet` | system_commands.rs | Settings panel |
| `set_label_theme`, `get_settings` | system_commands.rs | Get/set label theme (kitchen/mood/garden) |
| `set_tray_state` | system_commands.rs | Update tray icon color per agent state |
| `install_hook`, `uninstall_hook`, `hook_status` | install_commands.rs | Hook setup in Settings (copy/uninstall scripts) |

### 3. Frontend (src/)

#### Pet Window (main.ts, owner role)

**initTamagotchi({ role: "owner" })**
- Load copet-pet.json from store
- Apply offline decay (cap 2h)
- Spawn tick loop (every 60s)
- Stats decay: hunger, energy, happiness, hygiene
- Compute XP from `tool_calls`, level from `100*1.5^n`
- Check evolution gate (care_score ≥ 7 days)
- **WRITES state** back to store every tick + on stat change

**mountPet(canvas)**
- pet/index.ts: Orchestrate pet-pack loader, sprite player, render loop
- pet-pack-loader.ts: Load pet.json + spritesheet PNG from public/assets/pets/
- animation-controller.ts: Idle/walk/drag/working/celebrate anim playback
- render-loop.ts: 60 FPS Canvas 2D; pause on visibility change
- Pet state machine: tracks animation, mood, drag offset
- Drag handler: click on pet → drag + update HUD position

**initAgentBridge(petHandle, tooltipHandle)**
- agent-bridge/session-tracker.ts: Track multi-session state per agent
- agent-bridge/agent-bridge.ts: Listen for tauri::Event → aggregate state
- Priority: `working > waiting > done > idle` (if multiple sessions)
- Trigger pet reaction: glow (accent color) + squash-stretch animation
- Update tooltip: agent name + state + project name (from event)

#### HUD Window (ui/hud/)
- **StatsHud.tsx:** Displays pet portrait, 4 stat bars (color: green→amber→red), level/XP ring, agent status row
- **AgentStatusRow.tsx:** Shows current agent(s) + state indicator (dot color)
- Read-only; queries pet state from store every 1s
- Right-click pet or click tray → opens HUD

#### Settings Window (ui/settings/)
- **Settings.tsx:** Toggle Claude/Codex/Gemini hooks, set hotkey, enable autostart
- **settings-entry.tsx:** Individual agent row with enable/disable + hook status
- Hook install: opens browser to scripts/install-hooks.sh (macOS/Linux) or .ps1 (Windows)

#### Shop Window (ui/shop/)
- **Shop.tsx:** Grid of items (food + cosmetics), item price in tokens
- **shop-entry.tsx:** Item card (icon, name, price, Buy button)
- On buy: deduct tokens from inventory → apply food (restore stat) or cosmetic (equip)

#### Economy (src/economy/)
- **economy.ts:** Compute token gen per session (1 token / tool_call in event)
- **inventory.ts:** Track owned cosmetics, equipped cosmetic, token balance
- **item-catalog.ts:** Define food (restores hunger/energy) + cosmetics (visual equip)

#### Tamagotchi Core (src/tamagotchi/)
- **stats.ts:** Hunger, energy, happiness, hygiene; decay rates per minute
- **xp-level.ts:** XP formula; level = ceil(log_1.5(XP / 100))
- **evolution.ts:** 5-stage evolution gated by care_score (weighted stat avg over 7d)
- **offline-decay.ts:** Clamp decay to 2h max (prevent overnight punishment)
- **persistence.ts:** Load/save copet-pet.json via tauri-plugin-store
- **pet-store.ts:** In-memory state object + store methods

### 4. Sidecars (crates/)

#### copet-protocol
- **lib.rs:** Canonical types (Agent enum, State enum, AgentEvent struct)
- Shared between copet-hook, copet-run, and TS types (src/types/agent-event.ts)
- Change here = change in 2 places (Rust + TS mirror)

#### copet-hook
- **main.rs:** Entry point; reads hook JSON line from stdin
- **map_claude.rs:** Parse Claude Code hook → AgentEvent
- **map_codex.rs:** Parse Codex CLI hook → AgentEvent
- **map_gemini.rs:** Parse Gemini CLI hook → AgentEvent
- Writes AgentEvent (JSON) to socket at `/tmp/copet-{uid}.sock`
- tests/mapping_tests.rs: Unit tests for each mapping

#### copet-run
- **main.rs:** Universal wrapper; `copet run -- <cmd>` forks and monitors process
- On start: emit AgentEvent(state=Working)
- On exit: emit AgentEvent(state=Done or Error per exit code)
- Minimal overhead; logs to stderr

## Data Flow: Agent Event → Pet Reaction & Sessions Broadcast

```
Agent CLI generates hook JSON
        ↓
copet-hook (sidecar) reads stdin
        ↓
map_claude/codex/gemini converts → AgentEvent
        ↓
Write to socket /tmp/copet-{uid}.sock
        ↓
Tauri socket_daemon reads AgentEvent
        ↓
Emit tauri::Event::agent-state-changed
        ↓
Pet window (initAgentBridge) receives event
        ↓
session-tracker updates: builds SessionSnapshot[] + emits sessions-snapshot event
        ↓
session-tracker also aggregates state (working > waiting > error > done > idle)
        ↓
Pet animates: squash-stretch + glow (accent color)
        ↓
───────────────────────────────────────────────────────────────
│ Parallel: Multi-Surface Rendering                             │
├──────────────────────┬──────────────────────┬─────────────────┤
│ HUD (stats)          │ Tray Popover         │ Tooltip          │
│ - subscribe to       │ - subscribe to       │ - read tracker   │
│   sessions-snapshot  │   sessions-snapshot  │   directly       │
│ - render SessionList │ - render SessionList │ - show dominant  │
│ - update every 1s    │ - update every 1s    │   agent + state  │
└──────────────────────┴──────────────────────┴─────────────────┘
        ↓
Tray icon color updated
```

**Latency:** Event → Animation <300ms (async Tauri event loop + Canvas frame).  
**Broadcast:** Pet emits `sessions-snapshot` after update/expire; each surface ticks independently for duration columns (~1s).

## Persistence & State Management

| File | Content | Owner | R/W Pattern |
|------|---------|-------|------------|
| copet-pet.json | Pet stats, XP, evolution stage, cosmetics | Pet window | Write every 60s + on change |
| copet-economy.json | Token balance, owned items, equipped cosmetic | Pet window | Write on purchase/stat restore |
| window-state.json | HUD/Settings/Shop position/size (plugin managed) | Tauri plugin-store | Auto-persist per window |

**Single Writer:** Pet window is the exclusive writer. HUD/Settings/Shop read copet-pet.json, copet-economy.json every poll (1s) without writing.

## Click-Through & Hit-Testing

**Problem:** Transparent window steals mouse events from underlying apps.

**Solution (macOS):** Native transparent window auto pass-through (alpha=0).

**Solution (Win/Linux):** Rust cursor-poll fallback:
- Pet window polls cursor position every 16ms
- If cursor outside pet hit-rect → emit passthrough event (Tauri doesn't support yet, so fallback is app-dependent)
- Frontend reports hit-rect via `set_pet_hit_rect()` command as pet moves

**Note:** This is a known Tauri limitation (#13070). MVP ships with macOS-first transparency; Windows/Linux have best-effort behavior.

## Multi-Session Aggregation & Broadcast

When multiple agents send events (e.g., Claude Code + Cursor simultaneously):

1. **session-tracker.ts** maintains a Map<session_id, SessionSnapshot>
   - Per-session: `sessionId`, `agent`, `project`, `state`, `since` (streak start), `ts` (event time)
   - `since` resets when session moves from done/error → working (new lQuantity)
2. **Aggregation policy:** Pick dominant state in order: working > waiting > error > done > idle
3. **Broadcast:** Pet window emits tauri::Event `sessions-snapshot` (SessionSnapshot[]) after each update/expire
4. **Per-surface rendering:** HUD/tray popover/tooltip subscribe to `sessions-snapshot` and render the full list
   - Sessions expire after 5 min inactivity
   - done/idle rows render dimmed (opacity ~0.5)
5. **Visual:** Sort by priority state then ts (newest first); glow color = dominant state

Example: 3 agents running (Claude working, Codex waiting, Gemini done) → all 3 listed in sessions popover; pet glows blue (working dominant).

## Windows (Tauri Config)

```json
{
  "windows": [
    {
      "label": "pet",
      "title": "Copet Pet",
      "transparent": true,
      "alwaysOnTop": true,
      "skipTaskbar": true,
      "focusable": false,
      "macOSPrivateApi": true
    },
    {
      "label": "hud",
      "title": "Stats HUD",
      "visible": false,
      "width": 320,
      "height": 480
    },
    {
      "label": "settings",
      "title": "Copet Settings",
      "visible": false
    },
    {
      "label": "shop",
      "title": "Copet Shop",
      "visible": false
    },
    {
      "label": "sessions",
      "title": "Running Sessions",
      "visible": false,
      "width": 300,
      "height": 360
    }
  ]
}
```

**macOS Private API:** `acceptFirstMouse` + `ActivationPolicy::Accessory` hide dock icon.  
**Tray Popover:** `sessions` window uses `tauri-plugin-positioner` Position::TrayBottomCenter for Rust-side positioning.

## Sequence Diagram: Start → First Agent Event

```
App launch
  ↓
init_plugins (store, positioner, etc.)
  ↓
init_windows (create pet + HUD/Settings/Shop)
  ↓
init_ipc (spawn socket daemon listener)
  ↓
init_tray (create tray icon + menu)
  ↓
Frontend mounts (pet canvas + tamagotchi loop)
  ↓
Agent CLI starts (e.g., Claude Code)
  ↓
Hook emits JSON to copet-hook stdin
  ↓
copet-hook writes AgentEvent to socket
  ↓
socket_daemon reads → emits tauri::Event
  ↓
Pet window (initAgentBridge) receives event
  ↓
Pet animates (glow + squash-stretch)
  ↓
Tamagotchi tick accumulates XP
  ↓
Token generated (1/tool_call)
  ↓
Stats persist to store
```

## Performance Considerations

- **Render loop:** 60 FPS Canvas 2D; pause on `visibilitychange`
- **CPU idle:** <2% (macOS M1)
- **Memory:** ~40MB RSS + OS overhead
- **Socket daemon:** Async tokio; handles concurrent agent events
- **Store writes:** Debounced (not per-frame); every 60s + on mutation
- **Tick loop:** Every 60s; 4 stats decay linear per minute

## Error Handling

| Error | Recovery |
|-------|----------|
| Socket not found | silently log; user hasn't installed hook yet |
| Malformed AgentEvent JSON | log + skip (socket_daemon doesn't crash) |
| copet-pet.json corrupted | use defaults; re-write next tick |
| Hook process fails | copet-hook logs to stderr; event doesn't emit |
| Pet window closed | HUD/Settings/Shop become orphaned (can reopen via tray) |

## Testing Strategy

- **Unit tests:** Tamagotchi math (stats, XP, evolution, decay) — no mocks
- **Integration tests:** Session aggregation, pet reaction triggering
- **Rust tests:** Event mapping (Claude/Codex/Gemini hooks)
- **E2E (manual):** Run real agents, verify pet reacts <300ms

---

**Last Updated:** 2026-06-23  
**Maintainer:** docs-manager
