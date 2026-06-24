// install_commands.rs — Phase 08: hook install/uninstall for Copet sidecar.
//
// Commands:
//   install_hook(agent)   — copy copet-hook sidecar → ~/.copet/bin, patch agent config
//   uninstall_hook(agent) — restore backup, remove injected entry
//   hook_status(agent)    — check if hook entry already present in agent config
//
// Safety contract:
//   1. Backup config to {path}.bak BEFORE any write.
//   2. Parse+validate JSON (or YAML) before writing.
//   3. Idempotent: if hook entry already present, skip (no duplicate).
//   4. Uninstall (claude/gemini) restores .bak; codex does surgical entry-level
//      removal on the SHARED ~/.codex/hooks.json (never .bak-restores — so foreign
//      hooks added after install are preserved — then clears its own .bak).
//
// Risk: HIGH — we are patching user-owned config files.

use std::{
    fs,
    io,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use serde_json::Value as Json;

// ── Public API ────────────────────────────────────────────────────────────────

/// Install copet-hook for the given agent ("claude", "codex", or "gemini").
///
/// Steps:
///   1. Resolve sidecar path from the Tauri resource resolver.
///   2. Create ~/.copet/bin, copy binary there (idempotent).
///   3. Patch agent config file with hook snippet (backup + append-only).
#[tauri::command]
pub fn install_hook(app: AppHandle, agent: String) -> Result<String, String> {
    let bin_dir = copet_bin_dir()?;
    let hook_path = ensure_hook_binary(&app, &bin_dir)?;
    let hook_cmd = hook_path
        .to_str()
        .ok_or("copet-hook path contains non-UTF-8 chars")?
        .to_owned();

    match agent.as_str() {
        "claude" => patch_claude_config(&hook_cmd),
        "codex"  => patch_codex_config(&hook_cmd),
        "gemini" => patch_gemini_config(&hook_cmd),
        other    => Err(format!("Unknown agent '{}'. Valid: claude, codex, gemini", other)),
    }
    .map(|_| format!("Hook installed for {} ({})", agent, hook_cmd))
}

/// Uninstall copet-hook for the given agent.
/// Restores .bak backup if present; otherwise removes injected JSON block.
#[tauri::command]
pub fn uninstall_hook(app: AppHandle, agent: String) -> Result<String, String> {
    // We don't need the app handle for uninstall, but keep signature consistent.
    let _ = &app;
    match agent.as_str() {
        "claude" => restore_config(claude_settings_path()?, "claude"),
        "codex"  => uninstall_codex(),
        "gemini" => restore_config(gemini_config_path()?, "gemini"),
        other    => Err(format!("Unknown agent '{}'. Valid: claude, codex, gemini", other)),
    }
    .map(|_| format!("Hook uninstalled for {}", agent))
}

/// Return whether the copet-hook entry is present in the agent's config.
/// "installed" means the hook command line appears in the config file.
#[tauri::command]
pub fn hook_status(app: AppHandle, agent: String) -> Result<bool, String> {
    let _ = &app;
    let result = match agent.as_str() {
        "claude" => check_hook_present_json(&claude_settings_path()?, "copet-hook --agent claude"),
        "codex"  => check_hook_present_text(&codex_hooks_path()?,  "copet-hook --agent codex"),
        "gemini" => check_hook_present_text(&gemini_config_path()?, "copet-hook --agent gemini"),
        other    => return Err(format!("Unknown agent '{}'. Valid: claude, codex, gemini", other)),
    };
    // If the config file doesn't exist yet, treat as not installed.
    Ok(result.unwrap_or(false))
}

// ── Binary copy ────────────────────────────────────────────────────────────────

/// Ensure ~/.copet/bin exists, copy copet-hook sidecar there, set +x.
/// Returns the path to the installed binary.
fn ensure_hook_binary(app: &AppHandle, bin_dir: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(bin_dir).map_err(|e| format!("Cannot create {}: {}", bin_dir.display(), e))?;

    // Tauri resolves externalBin sidecar at the correct target-triple path.
    let sidecar = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir error: {}", e))?;

    // The resolved sidecar binary (Tauri places it beside the app bundle on macOS,
    // or in the resource dir on other platforms). We try the bundle sibling first,
    // then fall back to a direct path so dev builds work too.
    let dest = bin_dir.join("copet-hook");

    // Find the sidecar binary — Tauri 2 bundles externalBin next to the app executable.
    let sidecar_candidates = resolve_sidecar_candidates(app, "copet-hook");
    let src = sidecar_candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| {
            format!(
                "copet-hook sidecar not found. Candidates checked near: {}. \
                 Run 'bash scripts/build-sidecars.sh' then rebuild the app.",
                sidecar.display()
            )
        })?;

    // Copy only if different (idempotent; avoids re-copying if already installed).
    let should_copy = if dest.exists() {
        // Compare file sizes as a quick idempotency check.
        let src_meta = fs::metadata(&src).map_err(|e| e.to_string())?;
        let dst_meta = fs::metadata(&dest).map_err(|e| e.to_string())?;
        src_meta.len() != dst_meta.len()
    } else {
        true
    };

    if should_copy {
        fs::copy(&src, &dest)
            .map_err(|e| format!("Cannot copy copet-hook to {}: {}", dest.display(), e))?;
    }

    // Set executable bit (Unix).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dest, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("Cannot chmod +x {}: {}", dest.display(), e))?;
    }

    Ok(dest)
}

/// Build candidate paths where Tauri might have placed the sidecar binary.
fn resolve_sidecar_candidates(app: &AppHandle, name: &str) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Next to the app executable (most common in production builds).
    if let Ok(exe) = app.path().resource_dir() {
        // On macOS: Copet.app/Contents/MacOS/
        candidates.push(exe.join(name));
        // Tauri may append the target triple to the sidecar binary name.
        let triple = current_target_triple();
        candidates.push(exe.join(format!("{}-{}", name, triple)));
    }

    // 2. Try the Tauri bin_dir resolution (works in tauri dev).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(name));
            let triple = current_target_triple();
            candidates.push(dir.join(format!("{}-{}", name, triple)));
        }
    }

    candidates
}

/// Return the host target triple at compile time (embedded via env! macro).
fn current_target_triple() -> &'static str {
    // CARGO_CFG_TARGET_ARCH etc. are set at compile time.
    // We embed the full triple via build.rs or rely on Tauri's naming convention.
    env!("TARGET_TRIPLE")
}

// ── Claude Code config patch (JSON) ───────────────────────────────────────────

/// Patch ~/.claude/settings.json with PreToolUse/UserPromptSubmit/Notification/Stop/SessionEnd.
fn patch_claude_config(hook_cmd: &str) -> Result<(), String> {
    let config_path = claude_settings_path()?;

    // Parse existing or create empty object.
    let mut root = read_json_or_empty(&config_path)?;

    let hook_entry = serde_json::json!({
        "type": "command",
        "command": format!("{} --agent claude", hook_cmd)
    });

    let hook_types = ["PreToolUse", "UserPromptSubmit", "Notification", "Stop", "SessionEnd"];
    let hooks_obj = root
        .as_object_mut()
        .ok_or("settings.json root is not an object")?
        .entry("hooks")
        .or_insert(serde_json::json!({}))
        .as_object_mut()
        .ok_or("settings.json 'hooks' is not an object")?;

    let needs_write = {
        let mut modified = false;
        for hook_type in hook_types {
            let arr = hooks_obj
                .entry(hook_type)
                .or_insert(serde_json::json!([]));
            modified |= append_hook_entry_json(arr, &hook_entry, Some(""))?;
        }
        modified
    };

    // Idempotent: if our command was already present in every hook type, nothing
    // meaningful changed — skip the write so a repeat install never overwrites the
    // original .bak (which would break a later uninstall).
    if !needs_write {
        return Ok(());
    }

    backup_and_write_json(&config_path, &root)
}

/// True if a ClaudeNested (`{"hooks":[{"command":...}]}`) or flat
/// (`{"command":...}`) entry already references `cmd`. Shared by install
/// (idempotency) and uninstall (selective removal).
fn entry_has_command(entry: &Json, cmd: &str) -> bool {
    if let Some(inner) = entry.get("hooks").and_then(|h| h.as_array()) {
        if inner
            .iter()
            .any(|h| h.get("command").and_then(|c| c.as_str()) == Some(cmd))
        {
            return true;
        }
    }
    entry.get("command").and_then(|c| c.as_str()) == Some(cmd)
}

/// Append a hook entry into a ClaudeNested array, idempotently.
///
/// `matcher`: Claude `settings.json` uses `Some("")` (matcher-keyed format);
/// Codex `hooks.json` uses `None` (matcher-less, matching the shipped CLI's own
/// entries). Returns true if the array was modified.
fn append_hook_entry_json(
    arr: &mut Json,
    hook_entry: &Json,
    matcher: Option<&str>,
) -> Result<bool, String> {
    let cmd = hook_entry["command"].as_str().unwrap_or("");
    let list = arr.as_array_mut().ok_or("hook type value is not an array")?;

    if list.iter().any(|e| entry_has_command(e, cmd)) {
        return Ok(false); // Already present — idempotent.
    }

    let block = match matcher {
        Some(m) => serde_json::json!({ "matcher": m, "hooks": [hook_entry] }),
        None => serde_json::json!({ "hooks": [hook_entry] }),
    };
    list.push(block);
    Ok(true)
}

// ── Codex config patch (JSON hooks.json — ClaudeNested, verified codex 0.134.0) ─
//
// Codex (≥ 0.134.0) reads hooks from ~/.codex/hooks.json (ClaudeNested format,
// PascalCase events, shared with other tools' hooks) and runs them only when
// `[features] hooks = true` is set in ~/.codex/config.toml. The earlier YAML
// append to config.toml never matched the shipped CLI, so Codex hooks silently
// did nothing — this MERGES a matcher-less entry per event (idempotent by
// command string) so foreign hooks are preserved, then ensures the feature flag.

/// Codex hook events Copet subscribes to (PascalCase, per ~/.codex/hooks.json).
/// SessionStart is intentionally omitted: `map_codex` has no state for it (no
/// "registered"), so subscribing would only spawn the sidecar for nothing — the
/// session registers on the first UserPromptSubmit/PreToolUse instead.
const CODEX_HOOK_EVENTS: &[&str] = &[
    "UserPromptSubmit",
    "PreToolUse",
    "PermissionRequest",
    "Stop",
    "SubagentStop",
];

fn patch_codex_config(hook_cmd: &str) -> Result<(), String> {
    let hooks_path = codex_hooks_path()?;
    let mut root = read_json_or_empty(&hooks_path)?;

    let hook_entry = serde_json::json!({
        "type": "command",
        "command": format!("{} --agent codex", hook_cmd)
    });

    let hooks_obj = root
        .as_object_mut()
        .ok_or("hooks.json root is not an object")?
        .entry("hooks")
        .or_insert(serde_json::json!({}))
        .as_object_mut()
        .ok_or("hooks.json 'hooks' is not an object")?;

    let needs_write = {
        let mut modified = false;
        for event in CODEX_HOOK_EVENTS {
            let arr = hooks_obj.entry(*event).or_insert(serde_json::json!([]));
            // Codex entries are matcher-less (matches the shipped CLI's own format).
            modified |= append_hook_entry_json(arr, &hook_entry, None)?;
        }
        modified
    };

    // Idempotent: skip the write (and the .bak overwrite) when nothing changed.
    if needs_write {
        backup_and_write_json(&hooks_path, &root)?;
    }

    // Codex runs hooks only when the feature flag is on. Shared with other tools
    // (e.g. AgentPet), so it is never removed on uninstall.
    ensure_codex_features_hooks()
}

/// Remove ONLY Copet's entries from ~/.codex/hooks.json, leaving foreign hooks
/// (other tools, user-added) and the shared `[features] hooks` flag intact.
fn uninstall_codex() -> Result<(), String> {
    let hooks_path = codex_hooks_path()?;
    if !hooks_path.exists() {
        return Ok(());
    }
    let cmd = "copet-hook --agent codex";
    let mut root = read_json_or_empty(&hooks_path)?;
    let Some(hooks_obj) = root
        .as_object_mut()
        .and_then(|o| o.get_mut("hooks"))
        .and_then(|h| h.as_object_mut())
    else {
        return Ok(());
    };
    for event in CODEX_HOOK_EVENTS {
        if let Some(arr) = hooks_obj.get_mut(*event).and_then(|a| a.as_array_mut()) {
            arr.retain(|entry| !entry_has_command(entry, cmd));
        }
    }
    // Drop event keys whose arrays are now empty so we don't leave clutter.
    let empty: Vec<String> = hooks_obj
        .iter()
        .filter(|(_, v)| v.as_array().map(|a| a.is_empty()).unwrap_or(false))
        .map(|(k, _)| k.clone())
        .collect();
    for k in empty {
        hooks_obj.remove(&k);
    }
    backup_and_write_json(&hooks_path, &root)?;
    // Clear our .bak so a later reinstall re-captures the CURRENT (foreign) state
    // as the fresh original — mirrors the restore_config invariant for claude/gemini
    // and prevents a stale .bak from silently dropping later-added foreign hooks.
    let _ = fs::remove_file(bak_path(&hooks_path));
    Ok(())
}

/// Ensure `[features] hooks = true` in ~/.codex/config.toml (idempotent, minimal
/// append). Never removed on uninstall — the flag is shared by all hook tools.
fn ensure_codex_features_hooks() -> Result<(), String> {
    let path = codex_config_toml_path()?;
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let Some(updated) = add_features_hooks_toml(&text) else {
        return Ok(()); // Already enabled.
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create {}: {}", parent.display(), e))?;
    }
    fs::write(&path, updated).map_err(|e| format!("Cannot write {}: {}", path.display(), e))
}

/// Pure: insert `hooks = true` under `[features]` (or append the table) unless a
/// `hooks = true` line already exists. Returns None when already enabled.
fn add_features_hooks_toml(text: &str) -> Option<String> {
    let already = text.lines().any(|l| {
        let c = l.trim().replace(' ', "");
        !c.starts_with('#') && c.starts_with("hooks=true")
    });
    if already {
        return None;
    }
    if let Some(idx) = text.lines().position(|l| l.trim() == "[features]") {
        let mut lines: Vec<String> = text.lines().map(|s| s.to_string()).collect();
        lines.insert(idx + 1, "hooks = true".to_string());
        Some(lines.join("\n"))
    } else {
        let mut t = text.to_string();
        if !t.is_empty() && !t.ends_with('\n') {
            t.push('\n');
        }
        t.push_str("\n[features]\nhooks = true\n");
        Some(t)
    }
}

// ── Gemini config patch (YAML text — append-only) ────────────────────────────

/// Append copet-hook snippet to ~/.gemini/settings.yaml.
fn patch_gemini_config(hook_cmd: &str) -> Result<(), String> {
    let config_path = gemini_config_path()?;
    let cmd_str = format!("{} --agent gemini", hook_cmd);

    if check_hook_present_text(&config_path, &cmd_str).unwrap_or(false) {
        return Ok(()); // Already present.
    }

    let snippet = format!(
        "\n# Copet hook (added by Copet app — do not edit this block)\nhooks:\n  BeforeAgent:\n    - command: \"{cmd}\"\n  BeforeTool:\n    - command: \"{cmd}\"\n  AfterAgent:\n    - command: \"{cmd}\"\n",
        cmd = cmd_str
    );

    backup_and_append_text(&config_path, &snippet)
}

// ── Restore / uninstall ───────────────────────────────────────────────────────

/// Restore .bak backup of the config file.
/// If no .bak exists, the hook was never installed — succeed silently.
fn restore_config(config_path: PathBuf, agent: &str) -> Result<(), String> {
    let bak = bak_path(&config_path);
    if bak.exists() {
        fs::copy(&bak, &config_path)
            .map_err(|e| format!("Cannot restore {}: {}", config_path.display(), e))?;
        fs::remove_file(&bak).ok(); // Best-effort cleanup.
    }
    // If no .bak: hook was never installed (or already uninstalled) — no-op.
    let _ = agent;
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn copet_bin_dir() -> Result<PathBuf, String> {
    let home = home_dir()?;
    Ok(home.join(".copet").join("bin"))
}

fn claude_settings_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".claude").join("settings.json"))
}

/// ~/.codex/hooks.json — where Codex (≥0.134.0) reads hook command entries.
fn codex_hooks_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".codex").join("hooks.json"))
}

/// ~/.codex/config.toml — holds the `[features] hooks = true` gate.
fn codex_config_toml_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".codex").join("config.toml"))
}

fn gemini_config_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".gemini").join("settings.yaml"))
}

fn home_dir() -> Result<PathBuf, String> {
    // std::env::home_dir() is deprecated; use HOME env var directly.
    std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "HOME environment variable not set".into())
}

fn bak_path(p: &Path) -> PathBuf {
    let mut s = p.as_os_str().to_owned();
    s.push(".bak");
    PathBuf::from(s)
}

/// Read JSON from path; if file missing, return empty object {}; if invalid JSON, error.
fn read_json_or_empty(path: &Path) -> Result<Json, String> {
    if !path.exists() {
        // Create parent dirs so the write later succeeds.
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Cannot create {}: {}", parent.display(), e))?;
        }
        return Ok(serde_json::json!({}));
    }
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("Cannot read {}: {}", path.display(), e))?;
    if raw.trim().is_empty() {
        return Ok(serde_json::json!({}));
    }
    serde_json::from_str(&raw)
        .map_err(|e| format!("Invalid JSON in {}: {}", path.display(), e))
}

/// Backup then write pretty JSON.
fn backup_and_write_json(path: &Path, data: &Json) -> Result<(), String> {
    backup_file(path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create dir {}: {}", parent.display(), e))?;
    }
    let serialized = serde_json::to_string_pretty(data)
        .map_err(|e| format!("JSON serialize error: {}", e))?;
    fs::write(path, serialized)
        .map_err(|e| format!("Cannot write {}: {}", path.display(), e))
}

/// Backup then append text to file (creates file if missing).
fn backup_and_append_text(path: &Path, snippet: &str) -> Result<(), String> {
    backup_file(path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Cannot create dir {}: {}", parent.display(), e))?;
    }
    use io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Cannot open {}: {}", path.display(), e))?;
    file.write_all(snippet.as_bytes())
        .map_err(|e| format!("Cannot append to {}: {}", path.display(), e))
}

/// Copy file to {path}.bak (skip if file doesn't exist yet).
fn backup_file(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(()); // Nothing to backup.
    }
    let bak = bak_path(path);
    if bak.exists() {
        // Preserve the ORIGINAL pre-install backup across repeat installs; uninstall
        // removes the .bak, so a fresh install after uninstall re-captures the original.
        return Ok(());
    }
    fs::copy(path, &bak)
        .map(|_| ())
        .map_err(|e| format!("Cannot backup {}: {}", path.display(), e))
}

/// Check if a specific command string appears in a JSON config file.
fn check_hook_present_json(path: &Path, cmd: &str) -> io::Result<bool> {
    if !path.exists() {
        return Ok(false);
    }
    let raw = fs::read_to_string(path)?;
    // Fast text scan — if the command string is anywhere in the file, it's installed.
    Ok(raw.contains(cmd))
}

/// Check if a specific command string appears in a text config file.
fn check_hook_present_text(path: &Path, cmd: &str) -> io::Result<bool> {
    if !path.exists() {
        return Ok(false);
    }
    let raw = fs::read_to_string(path)?;
    Ok(raw.contains(cmd))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const COPET: &str = "/Users/x/.copet/bin/copet-hook --agent codex";

    fn copet_entry() -> Json {
        json!({ "type": "command", "command": COPET })
    }

    #[test]
    fn entry_has_command_matches_nested_and_flat() {
        let nested = json!({ "hooks": [{ "type": "command", "command": COPET }] });
        let flat = json!({ "command": COPET });
        let foreign = json!({ "hooks": [{ "command": "/Applications/AgentPet.app/... hook --agent codex" }] });
        assert!(entry_has_command(&nested, COPET));
        assert!(entry_has_command(&flat, COPET));
        assert!(!entry_has_command(&foreign, COPET));
    }

    #[test]
    fn codex_merge_is_additive_and_idempotent_preserving_foreign() {
        // hooks.json already holds a foreign (AgentPet-style) Stop hook.
        let mut arr = json!([
            { "hooks": [{ "type": "command", "command": "\"/Applications/AgentPet.app/Contents/MacOS/agentpet\" hook --agent codex" }] }
        ]);
        // First install: appends our matcher-less entry.
        assert!(append_hook_entry_json(&mut arr, &copet_entry(), None).unwrap());
        let list = arr.as_array().unwrap();
        assert_eq!(list.len(), 2, "foreign hook preserved + ours added");
        // Our entry is matcher-less (Codex format).
        let ours = list.iter().find(|e| entry_has_command(e, COPET)).unwrap();
        assert!(ours.get("matcher").is_none());
        // Second install: idempotent (no duplicate).
        assert!(!append_hook_entry_json(&mut arr, &copet_entry(), None).unwrap());
        assert_eq!(arr.as_array().unwrap().len(), 2);
    }

    #[test]
    fn claude_merge_keeps_matcher_key() {
        let mut arr = json!([]);
        let entry = json!({ "type": "command", "command": "x --agent claude" });
        assert!(append_hook_entry_json(&mut arr, &entry, Some("")).unwrap());
        assert_eq!(arr.as_array().unwrap()[0]["matcher"], json!(""));
    }

    #[test]
    fn uninstall_removes_only_ours() {
        // Simulate the retain step uninstall_codex performs on one event array.
        let mut arr = json!([
            { "hooks": [{ "command": "\"/Applications/AgentPet.app/Contents/MacOS/agentpet\" hook --agent codex" }] },
            { "hooks": [{ "type": "command", "command": COPET }] }
        ]);
        let list = arr.as_array_mut().unwrap();
        list.retain(|e| !entry_has_command(e, COPET));
        assert_eq!(list.len(), 1);
        assert!(entry_has_command(&list[0], "\"/Applications/AgentPet.app/Contents/MacOS/agentpet\" hook --agent codex"));
    }

    #[test]
    fn features_hooks_appended_when_absent() {
        let out = add_features_hooks_toml("model = \"gpt-5\"\n").unwrap();
        assert!(out.contains("[features]"));
        assert!(out.contains("hooks = true"));
    }

    #[test]
    fn features_hooks_inserted_under_existing_table() {
        let out = add_features_hooks_toml("[features]\nother = true\n").unwrap();
        // Inserted directly under the [features] header.
        let idx_feat = out.find("[features]").unwrap();
        let idx_hooks = out.find("hooks = true").unwrap();
        assert!(idx_hooks > idx_feat);
    }

    #[test]
    fn features_hooks_noop_when_already_enabled() {
        assert!(add_features_hooks_toml("[features]\nhooks = true\n").is_none());
        // Tolerates whitespace variations.
        assert!(add_features_hooks_toml("[features]\nhooks=true\n").is_none());
    }

    #[test]
    fn features_hooks_ignores_commented_flag() {
        // A commented-out flag must NOT count as enabled.
        let out = add_features_hooks_toml("[features]\n# hooks = true\n").unwrap();
        assert!(out.contains("\nhooks = true"));
    }
}
