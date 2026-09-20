//! Explicit local operator tool for testing the same native browser adapter as
//! the desktop. It reads bootstrap material from the environment, never prints
//! credentials, and requires a real passkey ceremony. Not run automatically.
use jarvis_identity::client::NativeClient;
use serde_json::json;
use std::time::Duration;
#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), String> {
    let base =
        std::env::var("JARVIS_LOCAL_CORE").unwrap_or_else(|_| "http://127.0.0.1:4310".into());
    let mode = std::env::args()
        .nth(1)
        .ok_or("Specify bootstrap, login or resume")?;
    let mut client = NativeClient::load()?;
    if mode == "resume" {
        client.resume(&base).await?;
    } else {
        if !matches!(mode.as_str(), "bootstrap" | "login") {
            return Err("Unsupported operation".into());
        }
        let token = if mode == "bootstrap" {
            Some(
                std::env::var("JARVIS_API_TOKEN")
                    .map_err(|_| "Bootstrap credential is required in the environment")?,
            )
        } else {
            None
        };
        let started = client.begin(&base, &mode, token, json!({})).await?;
        let id = started["id"].as_str().ok_or("Invalid ceremony response")?;
        println!("System browser ready. Complete the owner passkey confirmation.");
        loop {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            let result = client.poll(id).await?;
            if result["pending"].as_bool() != Some(true) {
                break;
            }
        }
    }
    let snapshot = client
        .api(&base, "GET", "/api/v1/identity/snapshot", json!({}))
        .await?;
    if snapshot["owner"]["preferredAddress"] != "Sir" {
        return Err("Unexpected owner profile".into());
    }
    println!("VERIFIED: native secure storage, device signature, owner session and authoritative snapshot.");
    Ok(())
}
