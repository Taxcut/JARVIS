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
            native_poll
        ])
        .run(tauri::generate_context!())
        .expect("JARVIS desktop failed to start");
}
