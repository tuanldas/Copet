# Copet — Installation Guide

This guide covers: installing the Copet app, connecting it to your AI coding agents, and troubleshooting.

---

## 1. Install the App (macOS)

### 1a. Download

Download the latest `Copet_x.x.x_aarch64.dmg` (Apple Silicon) or `Copet_x.x.x_x64.dmg` (Intel) from the [Releases page](https://github.com/tuanldas/Copet/releases) or build locally (see §4).

### 1b. Open the DMG

Double-click the `.dmg` file and drag **Copet.app** into your **Applications** folder.

### 1c. Bypass Gatekeeper (unsigned build)

The MVP build is **unsigned** — macOS will block the first launch with:
> "Copet" cannot be opened because the developer cannot be verified.

**Bypass (one-time):**
1. Right-click (or Control-click) `Copet.app` in Applications.
2. Choose **Open** from the context menu.
3. Click **Open** in the dialog that appears.

After this first launch, double-click works normally.

Alternatively, from Terminal:
```bash
xattr -dr com.apple.quarantine /Applications/Copet.app
```

### 1d. First launch

- The pet appears as a small overlay in the bottom-right corner.
- No Dock icon (by design — Copet is an accessory overlay).
- Access settings via the **menu bar icon** (top-right of your menu bar).

---

## 2. Install Agent Hooks

Hooks let the pet react to your coding agent's activity in real time.

### Option A — Settings UI (recommended)

1. Click the Copet menu bar icon → **Settings**.
2. Scroll to the **Agent Hooks** section.
3. Click **Install** next to your agent (Claude, Codex, or Gemini).
4. A confirmation message appears when done.

The button toggles to **Uninstall** — click it to remove the hook.

### Option B — CLI script

```bash
# Install for all agents:
bash scripts/install-hooks.sh

# Install for one agent only:
bash scripts/install-hooks.sh --agent claude

# Uninstall:
bash scripts/install-hooks.sh --uninstall
```

Windows (PowerShell):
```powershell
.\scripts\install-hooks.ps1 -Agent all
.\scripts\install-hooks.ps1 -Agent claude -Uninstall
```

### What the hook installer does

For each agent it:
1. Copies `copet-hook` binary to `~/.copet/bin/`.
2. Appends hook entries to the agent's config file (backup saved as `.bak`).
3. Is **idempotent** — running twice does not duplicate entries.

Config files patched:

| Agent | Config path |
|---|---|
| Claude Code | `~/.claude/settings.json` |
| Codex | `~/.codex/hooks.json` (+ `[features] hooks=true` in `~/.codex/config.toml`) |
| Gemini CLI | `~/.gemini/settings.yaml` |

---

## 3. Verify the Integration

With Copet running and hooks installed:

1. Start your agent (e.g. `claude "read a file"`).
2. The pet should animate while the agent is working.
3. Pet returns to idle when the session ends.

**Quick test via socket** (while Copet is running):
```bash
# Get your user ID:
echo "uid=$(id -u)"

# Send a test event:
echo '{"agent":"claude","session_id":"test","state":"working","ts":0}' \
  | nc -U /tmp/copet-$(id -u).sock
```

---

## 4. Build Locally (macOS dmg)

Requirements: Node ≥ 20, pnpm ≥ 9, Rust stable.

```bash
# Install dependencies:
pnpm install

# Build sidecar binaries first:
bash scripts/build-sidecars.sh

# Build the app:
pnpm build:mac
# → output: src-tauri/target/release/bundle/dmg/Copet_*.dmg
```

---

## 5. Troubleshooting

### Pet does not appear

- Check the menu bar for the Copet icon. Click it → **Show Pet**.
- Shortcut `CmdOrCtrl+Shift+P` toggles visibility.
- On macOS, check System Settings → Privacy & Security → Screen Recording if the overlay does not appear above other apps.

### Hook not triggering / pet stays idle

1. **Check `copet-hook` is in PATH:**
   ```bash
   which copet-hook
   # Should print: /Users/<you>/.copet/bin/copet-hook
   ```
   If not found, add to shell config:
   ```bash
   echo 'export PATH="$HOME/.copet/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

2. **Check Copet is running** — the socket only exists while the app is open:
   ```bash
   ls /tmp/copet-$(id -u).sock
   ```

3. **Check agent config was patched:**
   ```bash
   grep -A3 "copet-hook" ~/.claude/settings.json
   ```

4. **Test hook manually:**
   ```bash
   echo '{"hook_event_name":"PreToolUse","tool_name":"Read"}' \
     | ~/.copet/bin/copet-hook --agent claude
   echo "Exit code: $?"   # should be 0
   ```

### Socket path reference

| Platform | Path |
|---|---|
| macOS / Linux | `/tmp/copet-{uid}.sock` (where `uid` = `id -u`) |
| Windows | `\\.\pipe\copet-0` |

`copet-hook` silently skips writing if Copet is not running — your agent workflow is never blocked.

### Permission errors on ~/.copet/bin

```bash
chmod +x ~/.copet/bin/copet-hook
```

### macOS "damaged app" error

```bash
xattr -dr com.apple.quarantine /Applications/Copet.app
```
