#!/usr/bin/env bash
# build-sidecars.sh — Build copet-hook and copet-run for the host triple and
# copy them into src-tauri/binaries/{name}-{triple} as required by Tauri externalBin.
#
# Usage:
#   bash scripts/build-sidecars.sh          # host triple
#   bash scripts/build-sidecars.sh <triple> # specific triple (cross-compile; requires target installed)
#
# Tauri externalBin naming convention:
#   src-tauri/binaries/{name}-{target-triple}[.exe on Windows]
#
# Refs: https://v2.tauri.app/develop/sidecar/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARIES_DIR="$REPO_ROOT/src-tauri/binaries"

# ── Detect target triple ──────────────────────────────────────────────────────
if [[ $# -ge 1 ]]; then
  TARGET_TRIPLE="$1"
else
  # Auto-detect host triple from rustc.
  TARGET_TRIPLE="$(rustc -vV 2>/dev/null | grep '^host:' | awk '{print $2}')"
  if [[ -z "$TARGET_TRIPLE" ]]; then
    echo "ERROR: Could not detect host triple. Is rustc in PATH?" >&2
    exit 1
  fi
fi

echo "Building sidecars for triple: $TARGET_TRIPLE"

# ── Build release binaries ────────────────────────────────────────────────────
cd "$REPO_ROOT"

cargo build \
  --release \
  -p copet-hook \
  -p copet-run \
  --target "$TARGET_TRIPLE" 2>&1

# ── Copy into src-tauri/binaries/ ────────────────────────────────────────────
mkdir -p "$BINARIES_DIR"

# Determine extension (.exe on Windows target).
EXT=""
if [[ "$TARGET_TRIPLE" == *"-windows-"* ]]; then
  EXT=".exe"
fi

for BINARY in copet-hook copet-run; do
  SRC="$REPO_ROOT/target/$TARGET_TRIPLE/release/${BINARY}${EXT}"
  DEST="$BINARIES_DIR/${BINARY}-${TARGET_TRIPLE}${EXT}"

  if [[ ! -f "$SRC" ]]; then
    echo "ERROR: Expected binary not found: $SRC" >&2
    exit 1
  fi

  cp "$SRC" "$DEST"
  chmod +x "$DEST"
  SIZE_KB=$(du -k "$DEST" | cut -f1)
  echo "  Copied: $DEST (${SIZE_KB}KB)"
done

echo ""
echo "Sidecars ready in: $BINARIES_DIR"
echo "Verify files:"
ls -lh "$BINARIES_DIR/"
