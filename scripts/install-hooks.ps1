# install-hooks.ps1 — Windows CLI fallback for installing Copet agent hooks.
#
# Usage:
#   .\scripts\install-hooks.ps1 [-Agent claude|codex|gemini|all] [-Uninstall]
#
# What it does:
#   1. Copies copet-hook.exe → %USERPROFILE%\.copet\bin\
#   2. Appends hook snippet to agent config (backup .bak first, idempotent)
#   3. Prints PATH reminder if %USERPROFILE%\.copet\bin is not in $env:PATH
#
# Safe-by-design:
#   - Creates .bak before any config write.
#   - Idempotent: re-running does not duplicate entries.
#   - Never deletes user content — only appends / restores backup.

[CmdletBinding()]
param(
    [ValidateSet("claude", "codex", "gemini", "all")]
    [string]$Agent = "all",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$BinDir   = Join-Path $env:USERPROFILE ".copet\bin"
$HookBin  = Join-Path $BinDir "copet-hook.exe"
$RepoRoot = Split-Path $PSScriptRoot -Parent

# ── Helpers ───────────────────────────────────────────────────────────────────

function Backup-Config([string]$Path) {
    if (Test-Path $Path) {
        Copy-Item -Path $Path -Destination "${Path}.bak" -Force
        Write-Host "  Backed up: ${Path}.bak"
    }
}

function Restore-Config([string]$Path) {
    $bak = "${Path}.bak"
    if (Test-Path $bak) {
        Copy-Item -Path $bak -Destination $Path -Force
        Remove-Item $bak -Force
        Write-Host "  Restored: $Path"
    } else {
        Write-Host "  No backup found for $Path — skipping restore."
    }
}

function Test-HookPresent([string]$Path, [string]$Pattern) {
    if (-not (Test-Path $Path)) { return $false }
    return (Get-Content $Path -Raw) -match [regex]::Escape($Pattern)
}

# ── Binary copy ───────────────────────────────────────────────────────────────

function Install-Binary {
    # Find copet-hook.exe: prefer pre-built sidecar, then cargo output.
    $triple = (rustc -vV 2>$null | Select-String "^host:").ToString().Split(" ")[1]
    $candidates = @(
        (Join-Path $RepoRoot "src-tauri\binaries\copet-hook-${triple}.exe"),
        (Join-Path $RepoRoot "target\${triple}\release\copet-hook.exe"),
        (Join-Path $RepoRoot "target\release\copet-hook.exe")
    )
    $src = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $src) {
        Write-Error "copet-hook.exe not found. Run 'bash scripts/build-sidecars.sh' first (or cargo build -p copet-hook --release)."
        exit 1
    }

    if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir -Force | Out-Null }
    Copy-Item -Path $src -Destination $HookBin -Force
    Write-Host "  Installed: $HookBin"

    # PATH reminder.
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($currentPath -notlike "*$BinDir*") {
        Write-Host ""
        Write-Host "  NOTE: Add %USERPROFILE%\.copet\bin to your PATH. Run:"
        Write-Host "    [Environment]::SetEnvironmentVariable('PATH', `"`$env:PATH;$BinDir`", 'User')"
        Write-Host ""
    }
}

function Uninstall-Binary {
    if (Test-Path $HookBin) {
        Remove-Item $HookBin -Force
        Write-Host "  Removed: $HookBin"
    }
}

# ── Claude Code (%USERPROFILE%\.claude\settings.json) ────────────────────────

$ClaudeConfig = Join-Path $env:USERPROFILE ".claude\settings.json"
$ClaudeCmd    = "$HookBin --agent claude"

function Install-ClaudeHook {
    Write-Host "Installing Claude Code hook..."
    $dir = Split-Path $ClaudeConfig
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    if (-not (Test-Path $ClaudeConfig)) { '{}' | Set-Content $ClaudeConfig -Encoding UTF8 }

    if (Test-HookPresent $ClaudeConfig $ClaudeCmd) {
        Write-Host "  Already installed — skipping."
        return
    }

    Backup-Config $ClaudeConfig

    $root = Get-Content $ClaudeConfig -Raw | ConvertFrom-Json -AsHashtable

    $hookEntry = @{
        matcher = ""
        hooks   = @(@{ type = "command"; command = $ClaudeCmd })
    }
    $hookTypes = @("PreToolUse", "UserPromptSubmit", "Notification", "Stop", "SessionEnd")

    if (-not $root.ContainsKey("hooks")) { $root["hooks"] = @{} }
    foreach ($ht in $hookTypes) {
        if (-not $root["hooks"].ContainsKey($ht)) { $root["hooks"][$ht] = @() }
        # Idempotency check.
        $alreadyIn = $root["hooks"][$ht] | Where-Object {
            ($_.hooks | Where-Object { $_.command -eq $ClaudeCmd })
        }
        if (-not $alreadyIn) {
            $root["hooks"][$ht] += $hookEntry
        }
    }

    $root | ConvertTo-Json -Depth 10 | Set-Content $ClaudeConfig -Encoding UTF8
    Write-Host "  Updated: $ClaudeConfig"
}

function Uninstall-ClaudeHook {
    Write-Host "Uninstalling Claude Code hook..."
    Restore-Config $ClaudeConfig
}

# ── Codex ────────────────────────────────────────────────────────────────────

function Get-CodexConfigPath {
    $xdg = Join-Path $env:USERPROFILE ".config\codex\config.yaml"
    if (Test-Path (Split-Path $xdg)) { return $xdg }
    return Join-Path $env:USERPROFILE ".codex\config.toml"
}

$CodexCmd = "$HookBin --agent codex"

function Install-CodexHook {
    Write-Host "Installing Codex hook..."
    $cfg = Get-CodexConfigPath
    $dir = Split-Path $cfg
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    if (-not (Test-Path $cfg)) { "" | Set-Content $cfg -Encoding UTF8 }

    if (Test-HookPresent $cfg $CodexCmd) {
        Write-Host "  Already installed — skipping."
        return
    }

    Backup-Config $cfg

    $snippet = @"

# Copet hook (added by install-hooks.ps1 — do not edit this block)
hooks:
  preToolUse:
    - command: "$CodexCmd"
  notifications:
    - command: "$CodexCmd"
"@
    Add-Content -Path $cfg -Value $snippet -Encoding UTF8
    Write-Host "  Updated: $cfg"
}

function Uninstall-CodexHook {
    Write-Host "Uninstalling Codex hook..."
    Restore-Config (Get-CodexConfigPath)
}

# ── Gemini CLI ────────────────────────────────────────────────────────────────

$GeminiConfig = Join-Path $env:USERPROFILE ".gemini\settings.yaml"
$GeminiCmd    = "$HookBin --agent gemini"

function Install-GeminiHook {
    Write-Host "Installing Gemini CLI hook..."
    $dir = Split-Path $GeminiConfig
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    if (-not (Test-Path $GeminiConfig)) { "" | Set-Content $GeminiConfig -Encoding UTF8 }

    if (Test-HookPresent $GeminiConfig $GeminiCmd) {
        Write-Host "  Already installed — skipping."
        return
    }

    Backup-Config $GeminiConfig

    $snippet = @"

# Copet hook (added by install-hooks.ps1 — do not edit this block)
hooks:
  BeforeAgent:
    - command: "$GeminiCmd"
  BeforeTool:
    - command: "$GeminiCmd"
  AfterAgent:
    - command: "$GeminiCmd"
"@
    Add-Content -Path $GeminiConfig -Value $snippet -Encoding UTF8
    Write-Host "  Updated: $GeminiConfig"
}

function Uninstall-GeminiHook {
    Write-Host "Uninstalling Gemini CLI hook..."
    Restore-Config $GeminiConfig
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

if ($Uninstall) {
    Uninstall-Binary
    if ($Agent -in "all", "claude")  { Uninstall-ClaudeHook }
    if ($Agent -in "all", "codex")   { Uninstall-CodexHook }
    if ($Agent -in "all", "gemini")  { Uninstall-GeminiHook }
    Write-Host "Done. Restart your agent CLI to pick up the changes."
} else {
    Install-Binary
    if ($Agent -in "all", "claude")  { Install-ClaudeHook }
    if ($Agent -in "all", "codex")   { Install-CodexHook }
    if ($Agent -in "all", "gemini")  { Install-GeminiHook }
    Write-Host "Done. Start Copet, then run your agent — the pet will react!"
}
