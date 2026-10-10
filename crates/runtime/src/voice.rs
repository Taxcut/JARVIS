//! Runtime-owned voice settings and credential delegation, never exposed to the webview.
use crate::storage;
use jarvis_voice::{
    controller::{Manager, Save},
    Settings,
};
use std::{
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
    sync::Arc,
};
use tokio::sync::mpsc;
pub fn start(
    directory: &Path,
    credentials: mpsc::Sender<jarvis_voice::controller::CredentialRequest>,
) -> Manager {
    let path = directory.join("voice-settings.json");
    let settings = storage::open_private(&path)
        .ok()
        .and_then(|f| {
            let mut bytes = Vec::new();
            f.take(4097).read_to_end(&mut bytes).ok()?;
            if bytes.len() > 4096 {
                return None;
            }
            let s: Settings = serde_json::from_slice(&bytes).ok()?;
            s.validate().ok()?;
            Some(s)
        })
        .unwrap_or_default();
    let save: Save = Arc::new(move |settings| {
        let save = || -> std::io::Result<()> {
            let bytes = serde_json::to_vec(settings)?;
            let mut file = storage::open_private(&path)?;
            file.seek(SeekFrom::Start(0))?;
            file.write_all(&bytes)?;
            file.set_len(bytes.len() as u64)?;
            file.sync_all()
        };
        save().map_err(|_| "Voice settings could not be saved")
    });
    Manager::start(settings, save, credentials)
}
