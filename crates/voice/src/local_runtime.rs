//! Start only the fixed, explicitly installed inference runtime. No caller-selected command.
use std::{
    fs,
    io::Read,
    process::{Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};
static LAST_START: Mutex<Option<Instant>> = Mutex::new(None);
pub fn start() -> Result<(), &'static str> {
    let mut last = LAST_START
        .lock()
        .map_err(|_| "Local runtime start is busy")?;
    if last.is_some_and(|time| time.elapsed() < Duration::from_secs(30)) {
        return Err("Local model runtime could not restart. Reconnect audio in a moment.");
    }
    let root = crate::models::model_root()?
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Local runtime storage is unavailable")?
        .to_path_buf();
    let directory = root.join("ollama-runtime/0.35.1");
    for ancestor in directory.ancestors() {
        if fs::symlink_metadata(ancestor)
            .map_err(|_| "Complete local voice setup before enabling conversation.")?
            .file_type()
            .is_symlink()
        {
            return Err("Local model runtime must not use linked storage");
        }
    }
    let mut raw = Vec::new();
    fs::File::open(directory.join("jarvis-verified.json"))
        .map_err(|_| "Complete verified local voice setup.")?
        .take(4097)
        .read_to_end(&mut raw)
        .map_err(|_| "Local runtime setup could not be checked")?;
    if raw.len() > 4096 {
        return Err("Local runtime setup record is invalid");
    }
    let value: serde_json::Value =
        serde_json::from_slice(&raw).map_err(|_| "Local runtime setup record is invalid")?;
    let archive = if cfg!(target_os = "macos") {
        "3137dbf28948ee844e0fb3e584d9b5de6879d73d9f0cb7eff3ad64930601d307"
    } else {
        "dc50b9ca7f9023c86525012632cd1615b093d0407987444a7f62ecab617e8e93"
    };
    if value["version"] != "0.35.1"
        || value["archiveSha256"] != archive
        || value["modelDigest"] != crate::local::DIGEST
    {
        return Err("Local runtime setup does not match the approved release");
    }
    let binary = directory.join(if cfg!(windows) {
        "ollama.exe"
    } else {
        "ollama"
    });
    let metadata =
        fs::symlink_metadata(&binary).map_err(|_| "Local model runtime is not installed")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err("Local runtime executable is invalid");
    }
    let mut command = Command::new(binary);
    command
        .arg("serve")
        .env("OLLAMA_HOST", "127.0.0.1:11434")
        .env("OLLAMA_NO_CLOUD", "1")
        .env("OLLAMA_NUM_PARALLEL", "1")
        .env("OLLAMA_MAX_LOADED_MODELS", "1")
        .env("OLLAMA_CONTEXT_LENGTH", "2048")
        .env("OLLAMA_MODELS", root.join("ollama-models"))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Local model runtime could not start")?;
    *last = Some(Instant::now());
    // Reap the managed process independently of the audio worker. It may serve
    // subsequent dashboard/runtime launches; model weights unload after idle.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}
