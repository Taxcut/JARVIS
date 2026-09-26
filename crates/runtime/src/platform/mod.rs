#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
pub mod windows;
#[derive(Clone, Copy, Debug)]
pub enum Event {
    Sleep,
    Wake,
    SessionInactive,
    SessionActive,
    Logout,
    Ready,
    Unavailable,
}
#[cfg(target_os = "macos")]
pub use macos::{observe, startup};
#[cfg(windows)]
pub use windows::{observe, startup};
#[cfg(not(any(target_os = "macos", windows)))]
pub fn observe(tx: tokio::sync::mpsc::Sender<Event>) {
    let _ = tx.blocking_send(Event::Unavailable);
}
#[cfg(not(any(target_os = "macos", windows)))]
pub fn startup(_: Option<bool>) -> Result<String, String> {
    Ok("UNAVAILABLE".into())
}
pub fn helper_path() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|_| "Application path unavailable")?;
    let path = exe
        .parent()
        .ok_or("Application path unavailable")?
        .join(if cfg!(windows) {
            "jarvis-runtime.exe"
        } else {
            "jarvis-runtime"
        });
    let meta = std::fs::symlink_metadata(&path).map_err(|_| "Runtime helper is not installed")?;
    if !meta.is_file() || meta.file_type().is_symlink() {
        return Err("Invalid runtime helper".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        for ancestor in path.ancestors() {
            let metadata =
                std::fs::symlink_metadata(ancestor).map_err(|_| "Runtime path unavailable")?;
            if metadata.file_type().is_symlink()
                || metadata.permissions().mode() & 0o022 != 0
                || (metadata.uid() != 0 && metadata.uid() != unsafe { libc::geteuid() })
            {
                return Err("Runtime path is not protected from other users".into());
            }
        }
    }
    Ok(path)
}
pub fn start() -> Result<(), String> {
    let mut c = std::process::Command::new(helper_path()?);
    c.arg("--supervise")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
    }
    // Detached OS child; a thread reaps it without tying its lifetime to the dashboard.
    let mut child = c.spawn().map_err(|_| "Runtime could not start")?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}
