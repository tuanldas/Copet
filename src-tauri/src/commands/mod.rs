// commands/mod.rs — sub-modules for all Tauri command handlers (Phase 06).
// Re-exports below are consumed by lib.rs generate_handler! via the full path
// `commands::window_commands::open_hud` etc. The #[allow] suppresses "unused"
// warnings for items that are referenced through the macro, not directly.

pub mod window_commands;
pub mod system_commands;
