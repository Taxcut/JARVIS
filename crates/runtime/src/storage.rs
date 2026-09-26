use fs2::FileExt;
use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};
pub fn directory() -> io::Result<PathBuf> {
    let base = directories::BaseDirs::new()
        .ok_or_else(|| io::Error::other("User directory unavailable"))?;
    let path = base
        .data_local_dir()
        .join("com.taxcut.jarvis")
        .join("runtime");
    secure_directory(&path)?;
    Ok(path)
}
pub fn secure_directory(path: &Path) -> io::Result<()> {
    if path.exists() && fs::symlink_metadata(path)?.file_type().is_symlink() {
        return Err(io::Error::other("Runtime directory must not be a symlink"));
    }
    if let Some(parent) = path.parent() {
        if parent.exists() && fs::symlink_metadata(parent)?.file_type().is_symlink() {
            return Err(io::Error::other("Runtime parent must not be a symlink"));
        }
    }
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt, PermissionsExt};
        if fs::metadata(path)?.uid() != unsafe { libc::geteuid() } {
            return Err(io::Error::other("Runtime directory owner mismatch"));
        }
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    #[cfg(windows)]
    super::platform::windows::protect_directory(path)?;
    Ok(())
}
pub fn open_private(path: &Path) -> io::Result<File> {
    let mut o = OpenOptions::new();
    o.create(true).read(true).write(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        o.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        o.custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT);
    }
    let file = o.open(path)?;
    if !file.metadata()?.is_file() || fs::symlink_metadata(path)?.file_type().is_symlink() {
        return Err(io::Error::other("Invalid runtime file"));
    }
    Ok(file)
}
pub struct InstanceLock {
    _file: File,
}
impl InstanceLock {
    pub fn acquire(directory: &Path, name: &str) -> io::Result<Self> {
        let file = open_private(&directory.join(name))?;
        file.try_lock_exclusive()?;
        Ok(Self { _file: file })
    }
}
// Only fixed event codes enter logs. No request bodies, URLs, headers, tokens or OS errors.
pub struct Log {
    directory: PathBuf,
}
impl Log {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }
    pub fn event(&self, code: &'static str, state: super::State) {
        let _ = self.write(code, state);
    }
    fn write(&self, code: &'static str, state: super::State) -> io::Result<()> {
        let path = self.directory.join("runtime.log");
        if fs::metadata(&path).is_ok_and(|m| m.len() > 1_048_576) {
            for i in (1..=2).rev() {
                let from = self.directory.join(format!("runtime.{i}.log"));
                let to = self.directory.join(format!("runtime.{}.log", i + 1));
                if from.exists() {
                    fs::rename(from, to)?;
                }
            }
            fs::rename(&path, self.directory.join("runtime.1.log"))?;
        }
        let mut file = open_private(&path)?;
        use std::io::{Seek, SeekFrom};
        file.seek(SeekFrom::End(0))?;
        #[derive(Serialize)]
        struct Record {
            at: String,
            level: &'static str,
            component: &'static str,
            correlation_id: uuid::Uuid,
            code: &'static str,
            state: super::State,
        }
        serde_json::to_writer(
            &mut file,
            &Record {
                at: super::utc(),
                level: "INFO",
                component: "runtime",
                correlation_id: uuid::Uuid::new_v4(),
                code,
                state,
            },
        )?;
        file.write_all(b"\n")
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn locks_release_after_owner_drops() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        secure_directory(&dir).unwrap();
        let one = InstanceLock::acquire(&dir, "lock").unwrap();
        assert!(InstanceLock::acquire(&dir, "lock").is_err());
        drop(one);
        assert!(InstanceLock::acquire(&dir, "lock").is_ok());
        fs::remove_dir_all(dir).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn refuses_symlink() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir(&dir).unwrap();
        let link = dir.join("link");
        std::os::unix::fs::symlink(dir.join("target"), &link).unwrap();
        assert!(open_private(&link).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
