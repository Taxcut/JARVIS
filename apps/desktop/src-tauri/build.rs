fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "native_status",
            "native_resume",
            "native_api",
            "native_begin",
            "native_poll",
        ]),
    ))
    .expect("Could not build desktop permissions");
}
