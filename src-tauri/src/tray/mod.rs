#[allow(clippy::module_inception)]
pub mod tray;

// set_tray_state and TrayAgentState are used by Phase 07 (agent XP wiring).
#[allow(unused_imports)]
pub use tray::{init_tray, set_tray_state, toggle_pet_window, open_window, TrayAgentState};
