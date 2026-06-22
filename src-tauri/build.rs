fn main() {
    // Expose TARGET triple to install_commands.rs via env!("TARGET_TRIPLE").
    // CARGO_CFG_TARGET_ARCH is not the full triple; use the TARGET env var set by Cargo.
    let target = std::env::var("TARGET").unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=TARGET_TRIPLE={}", target);

    tauri_build::build()
}
