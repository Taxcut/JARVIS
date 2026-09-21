use jarvis_identity::client::{NativeClient, NativeStatus};
use serde_json::Value;
use tokio::sync::Mutex;
struct IdentityState(Mutex<Option<NativeClient>>);
async fn ready(
    state: &IdentityState,
) -> Result<tokio::sync::MutexGuard<'_, Option<NativeClient>>, String> {
    let mut value = state.0.lock().await;
    if value.is_none() {
        *value = Some(NativeClient::load()?);
    }
    Ok(value)
}
#[tauri::command]
async fn native_status(state: tauri::State<'_, IdentityState>) -> Result<NativeStatus, String> {
    let guard = ready(&state).await?;
    Ok(guard
        .as_ref()
        .ok_or("Native identity unavailable")?
        .status())
}
#[tauri::command]
async fn native_resume(
    state: tauri::State<'_, IdentityState>,
    base: String,
) -> Result<Value, String> {
    ready(&state)
        .await?
        .as_mut()
        .ok_or("Native identity unavailable")?
        .resume(&base)
        .await
}
#[tauri::command]
async fn native_api(
    state: tauri::State<'_, IdentityState>,
    base: String,
    method: String,
    path: String,
    body: Value,
) -> Result<Value, String> {
    ready(&state)
        .await?
        .as_mut()
        .ok_or("Native identity unavailable")?
        .api(&base, &method, &path, body)
        .await
}
#[tauri::command]
async fn native_begin(
    state: tauri::State<'_, IdentityState>,
    base: String,
    mode: String,
    token: Option<String>,
    extra: Value,
) -> Result<Value, String> {
    ready(&state)
        .await?
        .as_mut()
        .ok_or("Native identity unavailable")?
        .begin(&base, &mode, token, extra)
        .await
}
#[tauri::command]
async fn native_poll(state: tauri::State<'_, IdentityState>, id: String) -> Result<Value, String> {
    ready(&state)
        .await?
        .as_mut()
        .ok_or("Native identity unavailable")?
        .poll(&id)
        .await
}
#[tauri::command]
async fn runtime_status() -> Result<Option<jarvis_runtime::Status>, String> {
    match jarvis_runtime::ipc::request(jarvis_runtime::ipc::Command::Status {}).await {
        Ok(reply) => Ok(reply.status),
        Err(_) => Ok(None),
    }
}
#[tauri::command]
async fn runtime_start() -> Result<(), String> {
    if jarvis_runtime::ipc::request(jarvis_runtime::ipc::Command::Status {})
        .await
        .is_ok()
    {
        return Ok(());
    }
    jarvis_runtime::platform::start()
}
#[tauri::command]
async fn runtime_connect(
    state: tauri::State<'_, IdentityState>,
    base: String,
) -> Result<jarvis_runtime::ipc::Reply, String> {
    // Verify local receiver before issuing credentials. Never return provisioning material to React.
    jarvis_runtime::ipc::request(jarvis_runtime::ipc::Command::Status {}).await?;
    let session = ready(&state)
        .await?
        .as_mut()
        .ok_or("Native identity unavailable")?
        .issue_runtime_session(&base)
        .await?;
    jarvis_runtime::ipc::request(jarvis_runtime::ipc::Command::Provision { base, session }).await
}
#[tauri::command]
async fn runtime_reconnect() -> Result<jarvis_runtime::ipc::Reply, String> {
    jarvis_runtime::ipc::request(jarvis_runtime::ipc::Command::Reconnect {}).await
}
#[tauri::command]
async fn runtime_stop() -> Result<jarvis_runtime::ipc::Reply, String> {
    jarvis_runtime::ipc::request(jarvis_runtime::ipc::Command::Stop {}).await
}
#[tauri::command]
async fn runtime_startup(enable: Option<bool>) -> Result<String, String> {
    jarvis_runtime::platform::startup(enable)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    debug_assert!(!jarvis_runtime::status().execution_available);
    tauri::Builder::default()
        .manage(IdentityState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            native_status,
            native_resume,
            native_api,
            native_begin,
            native_poll,
            runtime_status,
            runtime_start,
            runtime_connect,
            runtime_reconnect,
            runtime_stop,
            runtime_startup
        ])
        .run(tauri::generate_context!())
        .expect("JARVIS desktop failed to start");
}
