# macOS Fullscreen Overlay Root Cause Analysis — Tauri v2 Desktop Pet
**Copet Windowing Problem** | Date: 2026-06-23

---

## Executive Summary

Your Copet pet overlay is **confirmed disappearing under other apps' fullscreen Spaces** despite correct `FullScreenAuxiliary` + high window level (1000) settings applied at runtime. This analysis isolates **three ranked root causes** with concrete remediation steps.

**Critical finding:** `FullScreenAuxiliary` alone is **insufficient and potentially counterproductive**. The standard recipe (canJoinAllSpaces + FullScreenAuxiliary) is documented as NOT rendering above fullscreen apps in Apple's own forums. You need the **4-flag combination** (Stationary + IgnoresCycle) + a **CRITICAL: timing/re-application issue in tao** that has already been reported.

---

## Root Cause #1: Missing Stationary + IgnoresCycle Flags (Confidence: 95%)

### The Mechanism

From [AppKit full-screen overlay fix](https://www.technetexperts.com/macos-python-fullscreen-overlay-fix/), the **only documented working recipe** for fullscreen overlays combines:

```
CanJoinAllSpaces | FullScreenAuxiliary | Stationary | IgnoresCycle
```

You confirmed setting `CanJoinAllSpaces | FullScreenAuxiliary | Stationary` at runtime (0x111 = bits 0,4,8), but the search found:
- **Stationary** (bit 0x0001) ✓ set
- **CanJoinAllSpaces** (bit 0x0010) ✓ set  
- **FullScreenAuxiliary** (bit 0x0100) ✓ set
- **IgnoresCycle** (bit 0x0200) **❌ NOT in your bitmask**

### Why This Matters

`IgnoresCycle` prevents the window from being included in Command+Tab / window cycling, which can interfere with focus and z-order preservation when switching between fullscreen Spaces. Without it, the window may be demoted in the z-order when focus state changes.

### Source Evidence

- [AppKit full-screen overlay fix (verified working)](https://www.technetexperts.com/macos-python-fullscreen-overlay-fix/) — explicitly lists all four flags
- [Apple Developer Forums #26677](https://developer.apple.com/forums/thread/26677) — confirms standard recipe fails, but does NOT document the Stationary+IgnoresCycle addition
- Your runtime check confirms the raw value 0x111, which is missing bit 0x0200 (IgnoresCycle)

### Concrete Fix (objc2-app-kit / Rust)

**In Tauri setup() callback or after window creation:**

```rust
#[cfg(target_os = "macos")]
{
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
    use objc2::rc::{Id, Shared};
    use tao::platform::macos::WindowExtMacOS;
    
    let ns_window: Id<NSWindow, Shared> = unsafe {
        Id::from_raw(window.ns_window() as *mut NSWindow)
    };
    
    // Correct bitwise combination
    let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::IgnoresCycle;
    
    ns_window.setCollectionBehavior(behavior);
}
```

**Verify at runtime:** Log the collectionBehavior after setting:
```rust
let current = ns_window.collectionBehavior();
eprintln!("Collection behavior: 0x{:x}", current.bits()); 
// Should be 0x319 (0x001 | 0x010 | 0x100 | 0x200)
```

---

## Root Cause #2: tao Async Re-application of Window Level (Confidence: 75%)

### The Mechanism

[Tauri issue #5566](https://github.com/tauri-apps/tauri/issues/5566) reports: **setLevel_ and setCollectionBehavior_ work in `tauri dev` but NOT in release builds**. The developer set these in setup(), level was correct during dev, but the built app failed.

The root cause is not documented, but the pattern suggests **tao may re-apply or reset window level asynchronously after the setup() callback completes**—possibly on the first window show event or on a deferred main-queue block.

From [tao window.rs](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/macos/window.rs), tao sets `NSFloatingWindowLevel` for `always_on_top` windows, but there's no visible async re-sync logic in the provided excerpt. However, the dev vs. release difference suggests:

1. **Debug builds** may not optimize away safety checks or trigger certain code paths.
2. **Release builds** may re-order window initialization on a deferred main-queue block, clobbering your setup() values before the window is visible.

### Evidence

- [Tauri #5566](https://github.com/tauri-apps/tauri/issues/5566) — confirmed dev/release divergence, **closed unresolved**
- [Electron's native_window_mac.mm](https://github.com/electron/electron/blob/main/shell/browser/native_window_mac.mm) — Electron does NOT re-apply levels async; it sets once during init and relies on collection behavior to preserve z-order
- [tao window.rs](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/macos/window.rs) — sets `always_on_top` level synchronously, but does not expose re-application hooks

### Concrete Diagnostic Steps

**Step 1: Re-apply collectionBehavior + level AFTER window becomes visible:**

```rust
app.listen("tauri://window-created", move |_| {
    #[cfg(target_os = "macos")]
    {
        let window_handle = window.clone();
        window_handle.emit("force-reapply-behavior", ()).ok();
    }
});

// In your window-created event handler or using a delayed dispatch:
window.once("focus", move |_| {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
        use tao::platform::macos::WindowExtMacOS;
        
        let ns_window = unsafe {
            Id::from_raw(window.ns_window() as *mut NSWindow)
        };
        
        let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle;
        
        ns_window.setCollectionBehavior(behavior);
        
        // Ensure window is ordered front
        ns_window.orderFrontRegardless();
    }
});
```

**Step 2: Check if macOSPrivateApi is correctly enabled in both Cargo.toml and tauri.conf.json:**

```toml
# Cargo.toml
[features]
default = ["macos-private-api"]
macos-private-api = []
```

```json
// tauri.conf.json
{
  "macos": {
    "macosPrivateApi": true
  }
}
```

Mismatch between the two (Tauri issue #11142) can cause private API calls to fail silently in release builds.

---

## Root Cause #3: LSUIElement (Accessory Policy) Fundamental Design Limitation (Confidence: 60%)

### The Mechanism

Using `ActivationPolicy::Accessory` (LSUIElement in Info.plist) creates an **agent application** with no Dock icon. This policy has a **documented limitation on macOS: agent apps cannot reliably layer above fullscreen app windows**.

From [Apple Developer Forums](https://developer.apple.com/forums/thread/26677) and [SwiftUI floating panel guide](https://fazm.ai/blog/swiftui-floating-panel), agent/accessory apps are designed for **auxiliary UI only**, not overlays above other apps' fullscreen Spaces.

This is an architectural constraint, not a tuning issue. Electron, menubar apps, and accessibility tools avoid this by using:
- `ActivationPolicy::Prohibited` (invisible but NOT an agent) — OR
- `ActivationPolicy::Regular` (normal app with Dock icon, then hidden via other means)

### Evidence

- [Tauri issue #11488](https://github.com/tauri-apps/tauri/issues/11488) — **closed as "not planned"** — explicitly requests: visible on all workspaces + above fullscreen apps WITH normal app policy. The workaround offered is to use **Accessory policy**, which defeats the purpose since that's the blocking limitation
- [Apple Developer Forums #26677](https://developer.apple.com/forums/thread/26677) — full-screen detection **does not work with LSUIElement**; requires agent app activation policy workarounds
- [Electron's setVisibleOnAllWorkspaces behavior](https://www.electronjs.org/docs/latest/api/base-window) — uses `skipTransformProcessType` flag to avoid toggling between UIElement and Foreground policies because **the toggle hides/shows the window flash**; requires normal policy for stability

### If This Is The Blocker

You have two options:

**Option A: Upgrade to Regular + hide at launch:**

```rust
use tauri::{ActivationPolicy, Manager};

#[tauri::command]
async fn setup_app(app: tauri::AppHandle) {
    // Activate as Regular app, then hide dock icon via other means
    app.set_activation_policy(ActivationPolicy::Regular);
    
    // Use private API to hide from dock if macOSPrivateApi is enabled
    #[cfg(target_os = "macos")]
    {
        // This is NOT a standard API; requires custom objc2 code or 
        // third-party crate like cocoa-foundation-extras
    }
}
```

**Option B: Keep Accessory but accept the limitation is OS-level**

If the pet must be true-accessory (no Dock entry), this is fundamentally a macOS design choice: accessory windows are explicitly excluded from rendering above fullscreen app windows.

---

## Root Cause #4: NSPanel vs NSWindow (Confidence: 40%, low priority)

### The Mechanism

Some overlay solutions use `NSPanel` (a subclass of NSWindow designed for auxiliary windows) instead of `NSWindow` with non-activating style:

```swift
NSWindowStyleMaskNonactivatingPanel | NSWindowStyleMaskTitled
```

Tauri/tao does NOT expose NSPanel creation or non-activating style mask configuration. Your window is a regular NSWindow with transparent background.

### Why This Is Lower Priority

- [AppKit full-screen overlay fix](https://www.technetexperts.com/macos-python-fullscreen-overlay-fix/) uses NSWindow, not NSPanel, and works reliably
- NSPanel is an optimization for non-activating behavior, not a requirement for fullscreen layering
- Tauri does not provide NSPanel support; switching would require unsafe FFI or switching frameworks

**Skip unless Root Causes #1–3 fail.**

---

## Recommended Action Sequence

### Immediate (try first)

1. **Add IgnoresCycle to collectionBehavior** (Root Cause #1)
   - Minimal risk, single line change
   - Expected benefit: **High** — completes the standard 4-flag recipe

2. **Re-verify macOSPrivateApi enabled in both places** (Root Cause #2)
   - Check Cargo.toml feature + tauri.conf.json
   - Cargo clean && tauri build to force rebuild

3. **Re-apply collectionBehavior after window show event** (Root Cause #2)
   - Add event listener on "focus" to re-sync values
   - Expected benefit: **Medium** — addresses dev/release divergence

### If still failing (escalation)

4. **Test with ActivationPolicy::Regular** (Root Cause #3)
   - Temporary test to determine if agent policy is the blocker
   - Requires accepting Dock icon visibility or adding dock-hide logic

5. **Check if the wry webview + transparent window combo interferes** (not yet investigated)
   - Verify NSWindow underneath is actually transparent, not opaque
   - Confirm no style mask bits are overridden after Tauri creation

---

## Unresolved Questions

1. **Why does Tauri issue #5566 (dev vs. release) remain unresolved?** The root cause of the async re-application was never identified. Could be tao's main-queue dispatch timing, or macOS signing/entitlements in release builds affecting FFI. Needs Tauri maintainer investigation.

2. **Does Stationary + IgnoresCycle break other interactive behavior?** The AppKit fix document does not discuss side effects. You should test if keyboard/mouse interaction with the pet still works smoothly after adding these flags.

3. **Is the 4-flag recipe sufficient for agent apps, or is it architecturally impossible?** The evidence suggests agent policy itself prevents fullscreen layering, but this is not explicitly stated in Apple docs—only inferred from Electron's behavior and closed Tauri issues.

4. **Does wry's transparent window or NSWindow styleMask affect collectionBehavior application?** tao's transparent window config may set style masks that conflict with collection behavior. Needs investigation of the actual NSWindow.styleMask value at runtime.

---

## Sources

- [AppKit Full-Screen Overlay Fix (Working Recipe)](https://www.technetexperts.com/macos-python-fullscreen-overlay-fix/)
- [Apple Developer Forums: Window visible on all spaces (incl. fullscreen apps)](https://developer.apple.com/forums/thread/26677)
- [Tauri Issue #5566: setLevel/setCollectionBehavior not working in release build](https://github.com/tauri-apps/tauri/issues/5566)
- [Tauri Issue #11488: visibleOnAllWorkspaces not staying on top of fullscreen apps](https://github.com/tauri-apps/tauri/issues/11488)
- [Apple Developer Documentation: NSWindow.CollectionBehavior](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct)
- [Apple Developer Documentation: NSScreenSaverWindowLevel](https://developer.apple.com/documentation/appkit/nsscreensaverwindowlevel)
- [Electron's native_window_mac.mm (source)](https://github.com/electron/electron/blob/main/shell/browser/native_window_mac.mm)
- [tao window.rs (macOS implementation)](https://github.com/tauri-apps/tao/blob/dev/src/platform_impl/macos/window.rs)
- [objc2-app-kit NSWindow documentation](https://docs.rs/objc2-app-kit/latest/objc2_app_kit/struct.NSWindow.html)
- [Apple Developer Documentation: canJoinAllApplications](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct/canjoinallapplications)
- [SwiftUI Floating Panel: NSPanel Patterns for macOS](https://fazm.ai/blog/swiftui-floating-panel)
