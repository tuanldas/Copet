# Copet — Distribution & Signing Guide

Build commands, signing configuration, and notarization steps for all platforms.

---

## 1. Build Commands

### Prerequisites (all platforms)

```bash
pnpm install
bash scripts/build-sidecars.sh   # build copet-hook + copet-run into src-tauri/binaries/
```

### macOS

```bash
# DMG + .app bundle (Apple Silicon / Intel — matches the host triple automatically):
pnpm build:mac
# Equivalent: pnpm tauri build --bundles dmg,app

# Output: src-tauri/target/release/bundle/dmg/Copet_*.dmg
#         src-tauri/target/release/bundle/macos/Copet.app
```

### Windows (run on Windows or via CI)

```bash
pnpm tauri build --bundles msi,nsis
# Output: src-tauri/target/release/bundle/msi/Copet_*.msi
#         src-tauri/target/release/bundle/nsis/Copet_*-setup.exe
```

### Linux (run on Linux or via CI)

```bash
pnpm tauri build --bundles appimage,deb
# Output: src-tauri/target/release/bundle/appimage/copet_*.AppImage
#         src-tauri/target/release/bundle/deb/copet_*.deb
```

### Sidecar naming convention (Tauri externalBin)

Tauri requires sidecar binaries named `{name}-{target-triple}[.exe]` in `src-tauri/binaries/`.
`build-sidecars.sh` handles this automatically:

```
src-tauri/binaries/
  copet-hook-aarch64-apple-darwin      ← macOS Apple Silicon
  copet-hook-x86_64-apple-darwin       ← macOS Intel
  copet-hook-x86_64-pc-windows-msvc.exe
  copet-hook-x86_64-unknown-linux-gnu
  copet-run-aarch64-apple-darwin
  ...
```

---

## 2. macOS Signing & Notarization

### MVP status: UNSIGNED

The MVP ships unsigned. Users bypass Gatekeeper via right-click → Open (see [installation-guide.md](./installation-guide.md)).

### When a Developer ID is available

Set environment variables (locally or as GitHub Actions secrets):

```bash
export APPLE_CERTIFICATE="<base64-encoded .p12>"
export APPLE_CERTIFICATE_PASSWORD="<p12 password>"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="your@apple.id"
export APPLE_PASSWORD="<app-specific password>"   # from appleid.apple.com
export APPLE_TEAM_ID="<10-char team ID>"
```

`tauri.conf.json` already has `bundle.macOS.signingIdentity: null` — Tauri reads
`APPLE_SIGNING_IDENTITY` from env when the field is null/omitted.

#### Notarization

Tauri v2 notarizes automatically when `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID`
are set. The stapled `.dmg` is ready for distribution without Gatekeeper prompts.

#### Activating signing in CI

Uncomment the signing env vars in `.github/workflows/build-release.yml`:

```yaml
env:
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

Add the secrets in GitHub repo → Settings → Secrets and variables → Actions.

---

## 3. Windows Signing

### MVP status: UNSIGNED → SmartScreen warning

Unsigned Windows builds trigger a SmartScreen "unknown publisher" warning on first run.
Users click **More info → Run anyway**.

### OV Certificate (traditional)

```bash
export WINDOWS_CERTIFICATE="<base64-encoded .pfx>"
export WINDOWS_CERTIFICATE_PASSWORD="<pfx password>"
```

Tauri reads these automatically when set.

### Azure Key Vault (cloud HSM — recommended for EV/OV)

Use `AzureSignTool` in CI:

```yaml
- name: Sign with Azure Key Vault
  run: |
    AzureSignTool sign \
      --azure-key-vault-url ${{ secrets.AZURE_KEY_VAULT_URL }} \
      --azure-key-vault-client-id ${{ secrets.AZURE_CLIENT_ID }} \
      --azure-key-vault-client-secret ${{ secrets.AZURE_CLIENT_SECRET }} \
      --azure-key-vault-certificate ${{ secrets.AZURE_CERT_NAME }} \
      --timestamp-rfc3161 http://timestamp.digicert.com \
      "src-tauri/target/release/bundle/msi/Copet_*.msi"
```

SmartScreen reputation builds up automatically after ~50–100 signed installs.

---

## 4. Linux

No code-signing required for AppImage or deb. Wayland overlay behavior notes:

- `alwaysOnTop` works on most compositors (KDE Plasma, GNOME with XWayland).
- `visibleOnAllWorkspaces` may not work on all Wayland compositors — falls back gracefully.
- AppImage is portable (no install); deb integrates with apt.

---

## 5. GitHub Actions CI

The workflow `.github/workflows/build-release.yml` builds all three platforms on push to `main`.

- Artifacts are uploaded (not released) — 14-day retention.
- Download from the **Actions** tab → select the workflow run → **Artifacts** section.
- To promote to a Release, add a `release` job gated on all build jobs passing.

### Adding a Release step (future)

```yaml
release:
  needs: [build]
  runs-on: ubuntu-latest
  steps:
    - uses: actions/download-artifact@v4
    - uses: softprops/action-gh-release@v2
      with:
        files: "**/*.dmg\n**/*.msi\n**/*.AppImage"
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 6. Version Bumping

Version is set in one place: `src-tauri/tauri.conf.json` → `"version"`.
Tauri reads it into the bundle metadata and the About dialog automatically.

```bash
# Bump version (edit manually or use a script):
sed -i '' 's/"version": "0.1.0"/"version": "0.2.0"/' src-tauri/tauri.conf.json
```

---

## 7. Distribution Channels (future)

| Channel | Notes |
|---|---|
| GitHub Releases | Add release job to CI; attach dmg/msi/AppImage |
| Homebrew Cask | Requires signed + notarized dmg; submit PR to homebrew-cask |
| Winget | Submit package manifest to microsoft/winget-pkgs |
| AUR (Arch) | Community-maintained PKGBUILD for AppImage |

MVP ships without a formal channel — users install from the GitHub Actions artifact or local build.
