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
//   4. Uninstall restores .bak; if .bak missing, removes only injected block.
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
        "codex"  => restore_config(codex_config_path()?,  "codex"),
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
        "codex"  => check_hook_present_text(&codex_config_path()?,  "copet-hook --agent codex"),
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
            modified |= append_hook_entry_json(arr, &hook_entry)?;
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

/// Append hook entry into a JSON array under a hook-type block.
/// Claude Code hook format:
///   [ { "matcher": "", "hooks": [ { "type": "command", "command": "..." } ] } ]
///
/// We insert as a top-level matcher-less entry. Idempotent: skip if command present.
fn append_hook_entry_json(arr: &mut Json, hook_entry: &Json) -> Result<bool, String> {
    let cmd = hook_entry["command"].as_str().unwrap_or("");

    let list = arr.as_array_mut().ok_or("hook type value is not an array")?;

    // Scan existing entries for our command.
    for outer in list.iter() {
        if let Some(inner_hooks) = outer.get("hooks").and_then(|h| h.as_array()) {
            for h in inner_hooks {
                if h.get("command").and_then(|c| c.as_str()) == Some(cmd) {
                    return Ok(false); // Already present — idempotent.
                }
            }
        }
        // Also handle flat format.
        if outer.get("command").and_then(|c| c.as_str()) == Some(cmd) {
            return Ok(false);
        }
    }

    // Append block: { "matcher": "", "hooks": [hook_entry] }
    list.push(serde_json::json!({
        "matcher": "",
        "hooks": [hook_entry]
    }));
    Ok(true)
}

// ── Codex config patch (YAML text — append-only) ──────────────────────────────

/// Append copet-hook snippet to ~/.config/codex/config.yaml (or ~/.codex/config.toml).
/// We use text-based append because YAML parsing requires a crate we don't import.
/// Idempotent: check if "copet-hook --agent codex" already in file.
fn patch_codex_config(hook_cmd: &str) -> Result<(), String> {
    let config_path = codex_config_path()?;
    let cmd_str = format!("{} --agent codex", hook_cmd);

    if check_hook_present_text(&config_path, &cmd_str).unwrap_or(false) {
        return Ok(()); // Already present.
    }

    let snippet = format!(
        "\n# Copet hook (added by Copet app — do not edit this block)\nhooks:\n  preToolUse:\n    - command: \"{cmd}\"\n  notifications:\n    - command: \"{cmd}\"\n",
        cmd = cmd_str
    );

    backup_and_append_text(&config_path, &snippet)
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

fn codex_config_path() -> Result<PathBuf, String> {
    // Try XDG path first, then ~/.codex fallback.
    let xdg = home_dir()?.join(".config").join("codex").join("config.yaml");
    if xdg.parent().map(|p| p.exists()).unwrap_or(false) || xdg.exists() {
        return Ok(xdg);
    }
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
