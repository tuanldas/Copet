//! IPC module — wires the local-socket daemon into the Tauri app lifecycle.
//!
//! Public surface: `spawn_daemon(app_handle)` called once from `init_ipc` in lib.rs.

pub mod socket_daemon;

pub use socket_daemon::spawn_daemon;
