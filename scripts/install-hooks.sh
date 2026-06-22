#!/usr/bin/env bash
# install-hooks.sh — CLI fallback for installing Copet agent hooks.
#
# Usage:
#   bash scripts/install-hooks.sh [--agent claude|codex|gemini|all] [--uninstall]
#
# What it does:
#   1. Copies copet-hook binary → ~/.copet/bin/
#   2. Appends hook snippet to agent config file (backup .bak first, idempotent)
#   3. Prints PATH reminder if ~/.copet/bin is not in $PATH
#
# Uninstall (--uninstall):
#   Restores .bak backup of agent config (if present), removes ~/.copet/bin/copet-hook.
#
# Safe-by-design:
#   - Creates .bak before any config write.
#   - Idempotent: re-running does not duplicate entries.
#   - Never deletes user content — only appends / restores backup.

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
AGENT="all"
UNINSTALL=false
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$HOME/.copet/bin"
HOOK_BIN="$BIN_DIR/copet-hook"

# ── Arg parse ─────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)    AGENT="${2:-all}"; shift 2 ;;
    --uninstall) UNINSTALL=true; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,2\}//'
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────

backup() {
  local file="$1"
  [[ -f "$file" ]] && cp "$file" "${file}.bak" && echo "  Backed up: ${file}.bak"
}

restore() {
  local file="$1"
  if [[ -f "${file}.bak" ]]; then
    cp "${file}.bak" "$file"
    rm -f "${file}.bak"
    echo "  Restored: $file"
  else
    echo "  No backup found for $file — skipping restore."
  fi
}

contains() {
  local file="$1" pattern="$2"
  [[ -f "$file" ]] && grep -qF "$pattern" "$file"
}

# ── Install binary ────────────────────────────────────────────────────────────

install_binary() {
  # Find copet-hook in the Tauri build output or src-tauri/binaries.
  local triple
  triple="$(rustc -vV 2>/dev/null | grep '^host:' | awk '{print $2}' || echo "")"
  local candidates=(
    "$REPO_ROOT/src-tauri/binaries/copet-hook-${triple}"
    "$REPO_ROOT/target/${triple}/release/copet-hook"
    "$REPO_ROOT/target/release/copet-hook"
  )
  local src=""
  for c in "${candidates[@]}"; do
    [[ -f "$c" ]] && src="$c" && break
  done

  if [[ -z "$src" ]]; then
    echo "ERROR: copet-hook binary not found. Run 'bash scripts/build-sidecars.sh' first." >&2
    exit 1
  fi

  mkdir -p "$BIN_DIR"
  cp "$src" "$HOOK_BIN"
  chmod +x "$HOOK_BIN"
  echo "  Installed: $HOOK_BIN"

  # PATH reminder.
  if ! echo "$PATH" | grep -qF "$BIN_DIR"; then
    echo ""
    echo "  NOTE: Add ~/.copet/bin to PATH. Add this to ~/.zshrc or ~/.bashrc:"
    echo "    export PATH=\"\$HOME/.copet/bin:\$PATH\""
    echo ""
  fi
}

uninstall_binary() {
  if [[ -f "$HOOK_BIN" ]]; then
    rm -f "$HOOK_BIN"
    echo "  Removed: $HOOK_BIN"
  fi
}

# ── Claude Code (~/.claude/settings.json) ────────────────────────────────────

CLAUDE_CONFIG="$HOME/.claude/settings.json"
CLAUDE_CMD="$HOOK_BIN --agent claude"

install_claude() {
  echo "Installing Claude Code hook..."
  mkdir -p "$HOME/.claude"

  # Create empty JSON if file doesn't exist.
  [[ ! -f "$CLAUDE_CONFIG" ]] && echo '{}' > "$CLAUDE_CONFIG"

  if contains "$CLAUDE_CONFIG" "$CLAUDE_CMD"; then
    echo "  Already installed — skipping."
    return
  fi

  backup "$CLAUDE_CONFIG"

  # Use Python3 (available on macOS) to safely merge JSON.
  python3 - "$CLAUDE_CONFIG" "$CLAUDE_CMD" <<'PYEOF'
import sys, json, copy

config_path = sys.argv[1]
cmd = sys.argv[2]

with open(config_path) as f:
    root = json.load(f)

hooks = root.setdefault("hooks", {})
entry = {"matcher": "", "hooks": [{"type": "command", "command": cmd}]}

for hook_type in ["PreToolUse", "UserPromptSubmit", "Notification", "Stop", "SessionEnd"]:
    arr = hooks.setdefault(hook_type, [])
    # Idempotency: check if our command is already present.
    already = any(
        h.get("command") == cmd
        for outer in arr
        for h in (outer.get("hooks", []) if isinstance(outer, dict) else [outer])
    )
    if not already:
        arr.append(copy.deepcopy(entry))

with open(config_path, "w") as f:
    json.dump(root, f, indent=2)
    f.write("\n")

print("  Updated:", config_path)
PYEOF
}

uninstall_claude() {
  echo "Uninstalling Claude Code hook..."
  restore "$CLAUDE_CONFIG"
}

# ── Codex (~/.config/codex/config.yaml or ~/.codex/config.toml) ──────────────

codex_config_path() {
  local xdg="$HOME/.config/codex/config.yaml"
  [[ -d "$HOME/.config/codex" || -f "$xdg" ]] && echo "$xdg" || echo "$HOME/.codex/config.toml"
}

CODEX_CMD="$HOOK_BIN --agent codex"

install_codex() {
  echo "Installing Codex hook..."
  local cfg
  cfg="$(codex_config_path)"
  mkdir -p "$(dirname "$cfg")"
  touch "$cfg"

  if contains "$cfg" "$CODEX_CMD"; then
    echo "  Already installed — skipping."
    return
  fi

  backup "$cfg"

  cat >> "$cfg" <<SNIPPET

# Copet hook (added by install-hooks.sh — do not edit this block)
hooks:
  preToolUse:
    - command: "$CODEX_CMD"
  notifications:
    - command: "$CODEX_CMD"
SNIPPET
  echo "  Updated: $cfg"
}

uninstall_codex() {
  echo "Uninstalling Codex hook..."
  local cfg
  cfg="$(codex_config_path)"
  restore "$cfg"
}

# ── Gemini CLI (~/.gemini/settings.yaml) ─────────────────────────────────────

GEMINI_CONFIG="$HOME/.gemini/settings.yaml"
GEMINI_CMD="$HOOK_BIN --agent gemini"

install_gemini() {
  echo "Installing Gemini CLI hook..."
  mkdir -p "$HOME/.gemini"
  touch "$GEMINI_CONFIG"

  if contains "$GEMINI_CONFIG" "$GEMINI_CMD"; then
    echo "  Already installed — skipping."
    return
  fi

  backup "$GEMINI_CONFIG"

  cat >> "$GEMINI_CONFIG" <<SNIPPET

# Copet hook (added by install-hooks.sh — do not edit this block)
hooks:
  BeforeAgent:
    - command: "$GEMINI_CMD"
  BeforeTool:
    - command: "$GEMINI_CMD"
  AfterAgent:
    - command: "$GEMINI_CMD"
SNIPPET
  echo "  Updated: $GEMINI_CONFIG"
}

uninstall_gemini() {
  echo "Uninstalling Gemini CLI hook..."
  restore "$GEMINI_CONFIG"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

if [[ "$UNINSTALL" == true ]]; then
  uninstall_binary
  [[ "$AGENT" == "all" || "$AGENT" == "claude" ]]  && uninstall_claude
  [[ "$AGENT" == "all" || "$AGENT" == "codex" ]]   && uninstall_codex
  [[ "$AGENT" == "all" || "$AGENT" == "gemini" ]]  && uninstall_gemini
  echo "Done. Restart your agent CLI to pick up the changes."
else
  install_binary
  [[ "$AGENT" == "all" || "$AGENT" == "claude" ]]  && install_claude
  [[ "$AGENT" == "all" || "$AGENT" == "codex" ]]   && install_codex
  [[ "$AGENT" == "all" || "$AGENT" == "gemini" ]]  && install_gemini
  echo "Done. Start Copet, then run your agent — the pet will react!"
fi
