# Agent Hook Setup

How to wire your AI coding agent CLI to Copet so the desktop pet reacts to
your coding sessions in real time.

Copet listens on a local Unix socket (`/tmp/copet-{uid}.sock`) while the app
is running. Two sidecar binaries bridge agent hook events to that socket:

| Binary | Purpose |
|---|---|
| `copet-hook` | Called by agent hook systems (PreToolUse, etc.) — reads JSON from stdin, maps to canonical state, writes one line to socket, exits 0 |
| `copet-run` | Universal wrapper — `copet-run -- <cmd>` wraps any command and emits working / done / error |

> **Note (Phase 08):** `copet-hook` and `copet-run` are built as standalone
> Cargo binaries. Until the P08 packaging phase installs them via
> `bundle.externalBin`, build them manually with
> `cargo build -p copet-hook -p copet-run --release` and symlink / copy the
> binaries somewhere on your `$PATH` (e.g. `~/.local/bin/`).

---

## Claude Code

Add the following to `~/.claude/settings.json` (create the file if absent).
This registers `copet-hook` for all hook types handled by the mapper.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "copet-hook --agent claude" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "copet-hook --agent claude" }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "copet-hook --agent claude" }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "copet-hook --agent claude" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "copet-hook --agent claude" }
        ]
      }
    ]
  }
}
```

Claude Code passes a JSON payload on stdin for every hook invocation.
`copet-hook` maps:

| Claude Code hook | → Copet state |
|---|---|
| `PreToolUse` / `UserPromptSubmit` / `SubagentStart` | `working` |
| `Notification` where `notification_type` is `idle_prompt` or `permission_prompt` | `waiting` |
| `Stop` | `done` (turn finished; session stays alive) |
| `SessionEnd` | `done` **+ `ended` flag** — the pet window removes the session from the tracker instead of leaving a stale "done" entry. Without this, a `/clear` (which starts a new `session_id`) would show the cleared session alongside the new one until the 5-min expiry. |

All other hook events are silently ignored (hook always exits 0).

### Session info enrichment

Beyond the state, `copet-hook` surfaces extra per-session info shown in the HUD,
tray popover and pet tooltip:

- **From the hook payload (always on, no file reads):** the condensed tool input
  (`Bash: pnpm test`, `Edit: main.ts`), full `cwd`, notification text while
  `waiting`, and the latest user prompt. Codex / Gemini provide a subset; the
  universal wrapper provides none.
- **From the transcript (Claude only, opt-in — OFF by default):** model
  (`claude-opus-4-8`), task summary (Claude's `ai-title`), last assistant message
  and token usage. Enable it in **Settings → "Model & tóm tắt task"**.

> **Privacy:** the transcript option makes `copet-hook` read the conversation
> JSONL at `transcript_path`. It is disabled unless you turn it on. When enabled,
> the hook reads only a bounded tail of the file, caps the length of extracted
> text, and never logs or persists raw conversation. The opt-in flag is stored in
> `~/.copet/hook-config.json` (`{"read_transcript": true}`) — the channel the app
> uses to tell the separately-spawned hook process about the setting. Delete that
> file or toggle the setting off to disable.

---

## OpenAI Codex

Codex supports a `notify` hooks configuration. Add to your Codex config
(path varies by version — typically `~/.codex/config.toml` or
`~/.config/codex/config.yaml`):

```yaml
# ~/.config/codex/config.yaml  (adjust path for your Codex version)
hooks:
  preToolUse:
    - command: "copet-hook --agent codex"
  notifications:
    - command: "copet-hook --agent codex"
```

Mapping:

| Codex event | → Copet state |
|---|---|
| `preToolUse` | `working` |
| `tui.notifications` → `approval-requested` | `waiting` |
| `tui.notifications` → `agent-turn-complete` | `done` |

---

## Gemini CLI

Add hooks to your Gemini CLI config (typically `~/.gemini/settings.yaml`
or `GEMINI_CONFIG`):

```yaml
# ~/.gemini/settings.yaml
hooks:
  BeforeAgent:
    - command: "copet-hook --agent gemini"
  BeforeTool:
    - command: "copet-hook --agent gemini"
  AfterModel:
    - command: "copet-hook --agent gemini"
  AfterAgent:
    - command: "copet-hook --agent gemini"
```

Mapping:

| Gemini hook | → Copet state |
|---|---|
| `BeforeAgent` / `BeforeTool` | `working` |
| `AfterModel` | `waiting` |
| `AfterAgent` | `done` |

---

## Universal wrapper (`copet-run`)

For agents that don't support hooks (e.g. Cursor, Aider, raw scripts), wrap
any command with `copet-run`:

```bash
# Instead of:  claude "fix the bug"
copet-run -- claude "fix the bug"

# Instead of:  aider --model gpt-4o
copet-run -- aider --model gpt-4o
```

`copet-run` emits:
- `working` immediately when the child process starts
- `done` when the child exits with code 0
- `error` when the child exits with a non-zero code

Stdio is inherited so output appears normally in your terminal.
The exit code of the child is forwarded exactly, so shell scripts that check
`$?` behave correctly.

---

## Verifying the integration

While Copet is running, open the Tauri devtools (right-click the pet →
"Inspect", or set `COPET_DEVTOOLS=1`) and run:

```js
// Paste in the devtools console:
const { listen } = window.__TAURI__.event;
listen("agent-status-changed", (ev) => console.log(ev.payload));
```

Then trigger a tool call in your agent (e.g. ask Claude Code to read a file).
You should see a JSON object like:

```json
{
  "agent": "claude-code",
  "session_id": "sess-abc123",
  "state": "working",
  "tool": "read_file",
  "project": "my-project",
  "ts": 1750000000
}
```

followed shortly by `"state": "done"` when the turn ends.

---

## Socket path reference

| Platform | Path |
|---|---|
| macOS / Linux | `/tmp/copet-{uid}.sock` where `{uid}` is your numeric user ID (`id -u`) |
| Windows | `\\.\pipe\copet-0` |

The socket is created by the Tauri app on launch and removed on next launch
(best-effort on exit — cleanup is guaranteed at startup via `remove_file`).
If Copet is not running, `copet-hook` and `copet-run` silently skip the
socket write and exit 0 — your agent workflow is never blocked.
