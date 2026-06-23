# Copet — Codebase Summary

Code-to-architecture reference: modules → files → key classes/functions. Repomix baseline 2026-06-22: 123 files, ~141k tokens, ~510k chars.

## Frontend Code Map (src/)

### Pet Rendering Engine (src/pet/)

| Module | Files | Purpose |
|--------|-------|---------|
| **index.ts** | 1 | Mount entry; orchestrates loader → player → render loop → dom |
| **pet-pack-loader.ts** | 1 | Load pet.json metadata + spritesheet PNG; validate 8×9 grid |
| **sprite-player.ts** | 1 | Parse spritesheet into frames; index by state (idle/walk/drag/etc) |
| **animation-controller.ts** | 1 | State → animation sequence (idle loop, transition, celebrate burst) |
| **pet-state-machine.ts** | 1 | Tracks current mood (idle/working/waiting/done/error), animation state, drag offset; @xstate/store |
| **render-loop.ts** | 1 | 60 FPS Canvas 2D render; RenderLoop class (start/stop, pause on hidden); position tracking |
| **pet-tooltip.ts** | 1 | Hover overlay showing agent + state + project; mounts separate div |

**Tests:** 3 files
- pet-state-machine.test.ts → state transitions, mood changes
- animation-controller.test.ts → animation frame sequences
- pet-pack-loader.test.ts → JSON parsing, spritesheet validation

**Key Exports:**
```ts
// index.ts
export async function mountPet(canvas: HTMLCanvasElement): Promise<{handle: PetHandle}>

// render-loop.ts
export class RenderLoop {
  start(): void
  stop(): void
  pause(): void
  resume(): void
  getPosition(): {x, y, w, h}
}

// animation-controller.ts
export class AnimationController {
  play(state: PetMood, duration?: number): Promise<void>
  setMood(mood: PetMood): void
}

// pet-state-machine.ts
export function createPetStateMachine(): Store<PetState>
```

### Tamagotchi Core (src/tamagotchi/)

| Module | Files | Purpose |
|--------|-------|---------|
| **types.ts** | 1 | PetStats, PetMood, Evolution enum, CareScore |
| **stats.ts** | 1 | Hunger, energy, happiness, hygiene: getDecayRate(mins), applyDecay(), feed() |
| **xp-level.ts** | 1 | XP += tool_calls; level = ceil(log_1.5(XP/100)); next_level_xp |
| **evolution.ts** | 1 | 5 stages gated by care_score ≥ threshold (7d avg); getEvolutionStage() |
| **offline-decay.ts** | 1 | Cap stat decay to 2h offline; compute lastOnlineAt, applyOfflineDecay() |
| **tick.ts** | 1 | Main loop: every 60s, decay → check evolution → save to store |
| **persistence.ts** | 1 | Load/save copet-pet.json via tauri-plugin-store; PetStore interface |
| **pet-store.ts** | 1 | In-memory state object; mutation methods (feedStat, earnXP, equipCosmetic) |
| **index.ts** | 1 | initTamagotchi({ role }) → spawn tick loop + offline handler |

**Tests:** 5 files
- stats.test.ts → decay rates, stat restoration
- xp-level.test.ts → XP formula, level progression
- evolution.test.ts → evolution gate logic
- offline-decay.test.ts → 2h cap, last online tracking
- migration.test.ts → schema version upgrades

**Key Exports:**
```ts
// index.ts
export async function initTamagotchi(opts: {role: 'owner' | 'client'}): Promise<void>

// pet-store.ts
export class PetStore {
  feedStat(stat: StatKey, amount: number): void
  earnXP(amount: number): void
  tick(deltaMs: number): void
  getState(): PetState
}

// evolution.ts
export function getEvolutionStage(careScore: number): EvolutionStage

// offline-decay.ts
export function applyOfflineDecay(state: PetState, now: number): PetState
```

### Economy (src/economy/)

| Module | Files | Purpose |
|--------|-------|---------|
| **item-catalog.ts** | 1 | Define food items (restores hunger/energy) + cosmetics (hat, glasses, bow) |
| **inventory.ts** | 1 | Owned items, equipped cosmetic, balance tracking |
| **economy.ts** | 1 | Token generation (1/tool_call per agent event); purchase validation |

**Tests:** 2 files
- economy.test.ts → token gen, purchase deduction
- inventory.test.ts → item equip/unequip

**Key Exports:**
```ts
// item-catalog.ts
export interface Item {
  id: string
  name: string
  type: 'food' | 'cosmetic'
  cost: number
  effect?: StatKey
  restoreAmount?: number
}

// inventory.ts
export class Inventory {
  addItem(itemId: string, count: number): void
  equipCosmetic(itemId: string): void
  getEquipped(): string | null
  canAfford(cost: number): boolean
}

// economy.ts
export function computeTokenReward(toolCalls: number): number
```

### Agent Bridge (src/agent-bridge/)

| Module | Files | Purpose |
|--------|-------|---------|
| **session-tracker.ts** | 1 | Track per-session SessionSnapshot; aggregate state (working > waiting > error > done > idle); emit sessions-snapshot event |
| **agent-bridge.ts** | 1 | Listen to tauri::Event → trigger pet reaction (glow + animation); relay sessions-snapshot broadcast |
| **reaction-map.ts** | 1 | Map AgentEvent state → pet animation sequence (quick squash-stretch + color flash) |
| **state-labels.ts** | 1 | Label theme definitions (kitchen/mood/garden); getStateLabel(theme, state) → string |

**Tests:** 2 files
- session-tracker.test.ts → multi-session aggregation, state priority, since tracking
- accounting.test.ts → token gen tracking across sessions

**Key Exports:**
```ts
// session-tracker.ts
export class SessionTracker {
  update(event: AgentEvent): void
  list(): SessionSnapshot[]
  getAggregatedState(): AgentState
  getActiveSessions(): number
}
export const PRIORITY = { working: 4, waiting: 3, error: 2, done: 1, idle: 0 }
export function compareByPriorityThenTs(a: SessionSnapshot, b: SessionSnapshot): number

// state-labels.ts
export type LabelTheme = "kitchen" | "mood" | "garden"
export function getStateLabel(theme: LabelTheme | undefined, state: AgentState): string

// agent-bridge.ts
export async function initAgentBridge(petHandle, tooltipHandle): Promise<void>

// reaction-map.ts
export function mapStateToReaction(state: AgentState): {glow: string, duration: number}
```

### UI Panels (src/ui/)

#### HUD (src/ui/hud/)

| File | Purpose |
|------|---------|
| StatsHud.tsx | Root SolidJS component; shows pet portrait, stat bars, level/XP ring, SessionList |
| StatBar.tsx | Single stat bar (color: green→amber→red per value) |
| hud-entry.tsx | Entry point for HUD window; mounts StatsHud |
| hud.css | Styling (card, grid, fonts) |

#### Settings (src/ui/settings/)

| File | Purpose |
|------|---------|
| Settings.tsx | Root; toggles for Claude/Codex/Gemini; hotkey input; autostart checkbox |
| settings-entry.tsx | Per-agent row (enable/disable + install hook button) |
| settings.css | Styling |

#### Shop (src/ui/shop/)

| File | Purpose |
|------|---------|
| Shop.tsx | Root; grid of items (food + cosmetics); balance display |
| shop-entry.tsx | Item card (icon, name, cost, Buy/Equip button); disable if can't afford |
| shop.css | Grid, card styling |

#### Sessions Popover (src/ui/sessions/)

| File | Purpose |
|------|---------|
| sessions-entry.tsx | Entry point for sessions popover window; mounts SessionList |
| sessions.css | Popover styling (card, overflow, session-row) |

#### Shared (src/ui/shared/)

| File | Purpose |
|------|---------|
| session-duration.ts | Format elapsed time from since (session streak start) |
| label-theme-store.ts | SolidJS signal for current label theme; subscribe to label-theme-changed event |
| session-list-model.ts | Compute session rows: sort by priority, apply theme labels, format for render |
| use-sessions.ts | SolidJS hook: subscribe to sessions-snapshot event; expose sessions reactively |
| SessionList.tsx | Shared component; render session list (3+ surfaces: HUD, popover, tooltip) |
| session-list.css | Session row styling (state dot, theme label, duration, project, dimmed done/idle) |
| tauri-commands.ts | Wrappers for all tauri::invoke commands (type-safe) |
| design-tokens.css | Color palette, spacing, typography vars |

### Types (src/types/)

| File | Purpose |
|------|---------|
| agent-event.ts | TS mirror of copet-protocol/lib.rs; Agent, State, AgentEvent (keep in sync) |
| session-snapshot.ts | SessionSnapshot (sessionId, agent, project, state, since, ts), LabelTheme enum |

### Pet Tooltip (src/pet/)

| File | Purpose |
|------|---------|
| tooltip-render.ts | Build HTML for tooltip: dominant session info + sorted session list (max 5 rows, +N more); uses theme labels |

### Entry Point

| File | Purpose |
|------|---------|
| main.ts | App entry; init tamagotchi → mount pet → init agent bridge; set up sessions-snapshot listener for surfaces |
| styles.css | Global styles (fonts, root colors) |
| sessions.html | Vite multipage entry for sessions popover (root document) |

---

## Backend Code Map (src-tauri/)

### Core Setup (src-tauri/src/)

| File | Purpose |
|------|---------|
| **lib.rs** | Entry point; split into init_plugins / init_windows / init_ipc / init_tray |
| **main.rs** | Tauri context; calls run() from lib.rs |

**lib.rs Functions:**
```rust
pub fn run()  // Builder setup + setup() split into 4 init functions
fn init_plugins(app: &mut App) -> Result<()>  // store, positioner, window-state, etc.
fn init_windows(app: &mut App) -> Result<()>  // pet, HUD, Settings, Shop windows
fn init_ipc(app: &mut App) -> Result<()>      // socket daemon
fn init_tray(app: &mut App) -> Result<()>     // system tray

#[tauri::command]
fn set_pet_hit_rect(state: State<Arc<PetHit>>, x: f64, y: f64, w: f64, h: f64)
```

### IPC Daemon (src-tauri/src/ipc/)

| Module | Purpose |
|--------|---------|
| **socket_daemon.rs** | Listen on Unix socket (macOS/Linux) or named pipe (Win); read AgentEvent; emit tauri::Event |
| **mod.rs** | Module exports |

**Key Fn:**
```rust
pub async fn spawn_daemon(app: AppHandle) -> Result<JoinHandle<()>>
// Spawns tokio task reading from socket, emits agent-state-changed event
```

### Commands (src-tauri/src/commands/)

| Module | Purpose |
|--------|---------|
| **window_commands.rs** | open_hud, open_settings, open_shop, toggle_pet, reset_pet_position |
| **system_commands.rs** | enable_autostart, set_global_shortcut, get_settings, select_pet, set_label_theme, set_tray_state |
| **install_commands.rs** | install_hook, uninstall_hook, hook_status (copy/uninstall hook scripts) |
| **mod.rs** | Module exports |

**Key Fns (window_commands):**
```rust
#[tauri::command]
pub fn open_hud(window: WebviewWindow) -> Result<()>
// sessions popover: toggled by tray left-click via tray::toggle_sessions_popover (not an IPC command)
pub fn toggle_pet(window: WebviewWindow) -> Result<()>
pub fn reset_pet_position(window: WebviewWindow) -> Result<()>
```

**Key Fns (system_commands):**
```rust
#[tauri::command]
pub fn set_label_theme(handle: AppHandle, theme: String) -> Result<()>  // emit label-theme-changed event
pub fn get_settings(handle: AppHandle) -> Result<Settings>  // includes label_theme field
pub fn set_tray_state(handle: AppHandle, state: String) -> Result<()>  // update tray icon color
pub fn set_global_shortcut(handle: AppHandle, hotkey: String) -> Result<()>
```

**Key Fns (install_commands):**
```rust
#[tauri::command]
pub async fn install_hook(hook: String, path: Option<String>) -> Result<String>  // copy hook script
pub async fn hook_status(hook: String) -> Result<HookStatus>
```

### Tray (src-tauri/src/tray/)

| Module | Purpose |
|--------|---------|
| **tray.rs** | Build TrayMenu (Show/Hide pet, open HUD/Settings/Shop, Quit); handle left-click popover toggle + tray positioning |
| **mod.rs** | Module exports |

**Key Fn:**
```rust
pub fn build_tray_menu() -> TrayMenu
pub fn handle_tray_event(event: &str, app: &AppHandle)  // on_tray_event for left-click toggle; uses positioner
pub fn update_tray_icon(handle: AppHandle, state: AgentState)  // color per state
```

### Build Script (src-tauri/build.rs)

- Copy sidecar binaries (copet-hook, copet-run) to Tauri bundle
- Invoked during `cargo build`

---

## Sidecars (crates/)

### copet-protocol (shared event types)

| File | Purpose |
|------|---------|
| **lib.rs** | Agent enum, State enum, AgentEvent struct, copet_socket_path() fn |

**Key Types:**
```rust
pub enum Agent { ClaudeCode, Codex, Gemini, Wrapper }
pub enum State { Working, Waiting, Done, Idle, Error }
pub struct AgentEvent {
    pub agent: Agent,
    pub session_id: String,
    pub state: State,
    pub tool: Option<String>,
    pub project: Option<String>,
    pub ts: u64,
}
pub fn copet_socket_path() -> String  // /tmp/copet-{uid}.sock or pipe on Win
```

### copet-hook (agent hook mapper)

| File | Purpose |
|------|---------|
| **main.rs** | Read hook JSON from stdin; route to mapper; write AgentEvent to socket |
| **map_claude.rs** | Parse Claude Code hook JSON → AgentEvent |
| **map_codex.rs** | Parse Codex CLI hook JSON → AgentEvent |
| **map_gemini.rs** | Parse Gemini CLI hook JSON → AgentEvent |

**Tests:**
- mapping_tests.rs → test each mapper with sample JSON

**Key Pattern (each mapper):**
```rust
pub fn map_claude_hook(json: &str) -> Result<AgentEvent> {
    // Parse hook JSON
    // Extract state (working/waiting/done/error)
    // Extract session_id, tool (optional), project (optional)
    // Return AgentEvent
}
```

**main.rs:**
```rust
fn main() {
    let hook_json = read_stdin()?;
    let event = route_mapper(&hook_json)?;
    let socket = socket_path()?;
    write_socket(&socket, &event)?;
}
```

### copet-run (universal wrapper)

| File | Purpose |
|------|---------|
| **main.rs** | Fork child process; emit Working event; monitor exit; emit Done/Error |

**Key Pattern:**
```rust
fn main() {
    let cmd = env::args().skip(1);
    emit_event(State::Working)?;
    let status = spawn(cmd).wait()?;
    emit_event(if status.success() { Done } else { Error })?;
}
```

---

## Build & Scripts

### Build Scripts (scripts/)

| Script | Purpose |
|--------|---------|
| **build-sidecars.sh** | Compile copet-hook + copet-run for host triple; copy to src-tauri/binaries |
| **gen-pet-spritesheet.mjs** | Node.js: tile pet frames into 8×9 PNG spritesheet from input frames dir |
| **install-hooks.sh** | Bash: install copet-hook to ~/.cargo/bin or system PATH (macOS/Linux) |
| **install-hooks.ps1** | PowerShell: install copet-hook (Windows) |

### Cargo Configuration

| File | Purpose |
|------|---------|
| **Cargo.toml** (root) | Workspace: copet-protocol, copet-hook, copet-run |
| **Cargo.toml** (each crate) | Dependencies (tokio, serde, tauri, etc) |
| **Cargo.lock** | Lock file (dependencies pinned) |

### Tauri Config

| File | Purpose |
|------|---------|
| **tauri.conf.json** | Bundle config (DMG/MSI/NSIS); window list (pet, HUD, settings, shop); capabilities |

---

## Test Suite Overview

### Frontend Tests (16 vitest files)

```
src/
├── pet/__tests__/
│   ├── animation-controller.test.ts
│   ├── pet-pack-loader.test.ts
│   └── pet-state-machine.test.ts
├── tamagotchi/__tests__/
│   ├── evolution.test.ts
│   ├── migration.test.ts
│   ├── offline-decay.test.ts
│   ├── stats.test.ts
│   └── xp-level.test.ts
├── economy/__tests__/
│   ├── economy.test.ts
│   └── inventory.test.ts
└── agent-bridge/__tests__/
    ├── accounting.test.ts
    └── session-tracker.test.ts
```

**Run:**
```bash
pnpm test              # vitest run (all tests)
pnpm test:watch        # vitest watch
```

### Backend Tests (1 Rust suite)

```
crates/copet-hook/
└── tests/
    └── mapping_tests.rs  (Claude, Codex, Gemini mapping unit tests)
```

**Run:**
```bash
cargo test --release  # Rust test suite
```

---

## Key Development Commands

```bash
# Setup
pnpm install
bash scripts/build-sidecars.sh

# Dev
pnpm tauri dev                    # hot-reload; pet overlay + all windows

# Build
pnpm build:mac                    # → dmg
pnpm exec tauri build --bundles dmg,msi,appimage

# Test
pnpm test                         # vitest
pnpm test:watch
cargo test --workspace --release

# Lint & type
pnpm exec tsc --noEmit
cargo check --workspace
cargo clippy --workspace
```

---

## Codebase Stats

| Metric | Count |
|--------|-------|
| Total files | 135+ (post-sessions feature) |
| TypeScript/TSX | ~6200 LOC |
| Rust (core + sidecars) | ~3000 LOC |
| Test cases | ~261 across vitest + Rust |
| Build time (cold) | ~90s |
| Build time (incremental) | ~10s |
| DMG size (uncompressed) | ~10–12MB |
| Runtime memory | ~40MB RSS |
| Runtime CPU (idle) | <2% |

---

## Important Notes for Maintainers

1. **Type Synchronization:** copet-protocol/lib.rs ↔ src/types/agent-event.ts must stay in sync. Check on any Event type change.

2. **Hook Mapping:** Each agent (Claude/Codex/Gemini) has its own mapper. Test with real hook output before shipping.

3. **Single-Writer Pattern:** Only pet window writes state to store. Other windows read. Prevents race conditions.

4. **Offline Decay Cap:** Always apply 2h cap before ticking. Tests validate this.

5. **Evolution Formula:** care_score = avg(stat values over 7d). Gates at 5 thresholds. See evolution.test.ts for thresholds.

6. **Pet-pack Format:** Petdex-compatible; loader validates 8×9 grid. Optional `copet_extensions` field for future stages.

7. **Socket Path:** `/tmp/copet-{uid}.sock` (Unix) or `\\.\pipe\copet-{uid}` (Win). Must match in all 3 places: copet-protocol, socket_daemon.rs, copet-hook.

8. **Error Handling:** Socket_daemon never crashes on malformed event JSON; logs + skips. Hook process failures are silent (stderr).

---

**Last Updated:** 2026-06-23  
**Maintainer:** docs-manager  
**Repomix Baseline:** 135+ files (post-sessions feature); ~155k tokens
