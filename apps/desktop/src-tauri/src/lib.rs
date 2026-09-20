#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    debug_assert!(!jarvis_runtime::status().execution_available);
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("JARVIS desktop failed to start");
}
