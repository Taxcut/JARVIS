fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "native_status",
            "native_resume",
            "native_api",
            "native_begin",
            "native_poll",
            "runtime_status",
            "runtime_start",
            "runtime_connect",
            "runtime_reconnect",
            "runtime_stop",
            "runtime_startup",
        ]),
    ))
    .expect("Could not build desktop permissions");
}
