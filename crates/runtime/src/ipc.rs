use crate::Status;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{io, path::PathBuf, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    sync::{mpsc, oneshot, watch},
};
#[derive(Serialize, Deserialize)]
#[serde(tag = "command", rename_all = "snake_case", deny_unknown_fields)]
pub enum Command {
    Status {},
    Reconnect {},
    Stop {},
    Provision { base: String, session: Value },
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reply {
    pub status: Option<Status>,
    pub error: Option<String>,
}
pub struct Control {
    pub command: Command,
    pub reply: oneshot::Sender<Reply>,
    pub delivered: oneshot::Receiver<()>,
}
const LIMIT: usize = 16_384;
async fn read<T: for<'a> Deserialize<'a>>(s: &mut (impl AsyncRead + Unpin)) -> io::Result<T> {
    let size = s.read_u32().await? as usize;
    if size == 0 || size > LIMIT {
        return Err(io::Error::other("IPC message rejected"));
    }
    let mut bytes = vec![0; size];
    s.read_exact(&mut bytes).await?;
    serde_json::from_slice(&bytes).map_err(|_| io::Error::other("IPC message rejected"))
}
async fn write<T: Serialize>(s: &mut (impl AsyncWrite + Unpin), value: &T) -> io::Result<()> {
    let bytes = serde_json::to_vec(value)?;
    if bytes.len() > LIMIT {
        return Err(io::Error::other("IPC message too large"));
    }
    s.write_u32(bytes.len() as u32).await?;
    s.write_all(&bytes).await?;
    s.flush().await
}
async fn handle<S: AsyncRead + AsyncWrite + Unpin>(
    mut stream: S,
    tx: &mpsc::Sender<Control>,
    status: &watch::Receiver<Status>,
) -> io::Result<()> {
    let command = tokio::time::timeout(Duration::from_secs(3), read(&mut stream)).await??;
    let (ack, delivered) = oneshot::channel();
    let result = if matches!(command, Command::Status {}) {
        Reply {
            status: Some(status.borrow().clone()),
            error: None,
        }
    } else {
        let (reply, rx) = oneshot::channel();
        tx.try_send(Control {
            command,
            reply,
            delivered,
        })
        .map_err(|_| io::Error::other("Runtime busy"))?;
        tokio::time::timeout(Duration::from_secs(35), rx)
            .await?
            .map_err(|_| io::Error::other("Runtime stopped"))?
    };
    let result = tokio::time::timeout(Duration::from_secs(3), write(&mut stream, &result)).await?;
    let _ = ack.send(());
    result
}
pub async fn serve(
    dir: PathBuf,
    tx: mpsc::Sender<Control>,
    mut status: watch::Receiver<Status>,
) -> io::Result<()> {
    let slots = std::sync::Arc::new(tokio::sync::Semaphore::new(8));
    let mut tasks = tokio::task::JoinSet::new();
    #[cfg(unix)]
    let listener = {
        let path = dir.join("ipc.sock");
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        let listener = tokio::net::UnixListener::bind(&path)?;
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        listener
    };
    #[cfg(windows)]
    let mut listener = crate::platform::windows::pipe(true)?;
    #[cfg(windows)]
    let _ = dir;
    loop {
        tokio::select! {
            r=status.changed()=>{if r.is_err(){break;}},
            Some(_)=tasks.join_next()=>{},
            stream=async {
                #[cfg(unix)] {let (s,_)=listener.accept().await?;if s.peer_cred()?.uid()!=unsafe{libc::geteuid()}{return Err(io::Error::other("IPC peer rejected"));}Ok::<_,io::Error>(s)}
                #[cfg(windows)] {listener.connect().await?;let next=crate::platform::windows::pipe(false)?;Ok::<_,io::Error>(std::mem::replace(&mut listener,next))}
            }=>{
                let stream=stream?;
                if let Ok(permit)=slots.clone().try_acquire_owned(){let sender=tx.clone();let current=status.clone();tasks.spawn(async move{let _permit=permit;let _=handle(stream,&sender,&current).await;});}
            }
        }
    }
    tasks.abort_all();
    while tasks.join_next().await.is_some() {}
    Ok(())
}
pub async fn request(command: Command) -> Result<Reply, String> {
    async fn operation(command: Command) -> io::Result<Reply> {
        #[cfg(unix)]
        let mut stream = {
            let path = crate::storage::directory()?.join("ipc.sock");
            let s = tokio::net::UnixStream::connect(path).await?;
            if s.peer_cred()?.uid() != unsafe { libc::geteuid() } {
                return Err(io::Error::other("IPC server rejected"));
            }
            s
        };
        #[cfg(windows)]
        let mut stream = tokio::net::windows::named_pipe::ClientOptions::new()
            .security_qos_flags(windows_sys::Win32::Storage::FileSystem::SECURITY_IDENTIFICATION)
            .open(crate::platform::windows::pipe_name()?)?;
        write(&mut stream, &command).await?;
        read(&mut stream).await
    }
    tokio::time::timeout(Duration::from_secs(40), operation(command))
        .await
        .map_err(|_| "Runtime response timed out")?
        .map_err(|_| "Runtime is not running or could not be reached".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    #[tokio::test]
    async fn actual_private_socket_serves_safe_status_and_stops_with_owner() {
        let dir = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        crate::storage::secure_directory(&dir).unwrap();
        let (tx, _rx) = mpsc::channel(1);
        let (state, watcher) = watch::channel(Status::default());
        let handle = tokio::spawn(serve(dir.clone(), tx, watcher));
        let path = dir.join("ipc.sock");
        for _ in 0..100 {
            if path.exists() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        let mut stream = tokio::net::UnixStream::connect(path).await.unwrap();
        write(&mut stream, &Command::Status {}).await.unwrap();
        let reply: Reply = read(&mut stream).await.unwrap();
        assert!(!reply.status.unwrap().execution_available);
        drop(state);
        tokio::time::timeout(Duration::from_secs(2), handle)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[tokio::test]
    async fn rejects_oversize_and_unknown_commands() {
        let (mut a, mut b) = tokio::io::duplex(32);
        a.write_u32((LIMIT + 1) as u32).await.unwrap();
        assert!(read::<Command>(&mut b).await.is_err());
        assert!(serde_json::from_value::<Command>(
            serde_json::json!({"command":"shell","path":"anything"})
        )
        .is_err());
        assert!(serde_json::from_value::<Command>(
            serde_json::json!({"command":"stop","extra":true})
        )
        .is_err());
    }
}
