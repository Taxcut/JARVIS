use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "jarvis-show", "Open JARVIS", true, None::<&str>)?;
    let quit = MenuItem::with_id(
        app,
        "jarvis-quit",
        "Quit dashboard (runtime stays active)",
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    #[cfg(target_os = "macos")]
    let icon = tauri::include_image!("icons/tray.png");
    #[cfg(not(target_os = "macos"))]
    let icon = tauri::include_image!("icons/tray-color.png");
    TrayIconBuilder::with_id("jarvis-dashboard")
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("JARVIS dashboard")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "jarvis-show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "jarvis-quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
