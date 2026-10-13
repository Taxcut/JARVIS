use crate::{canonical_request, proof, random_secret, DevicePublic, Identity, NativeStore, Resume};
use reqwest::{Client, Method};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use url::Url;
use uuid::Uuid;
struct Pending {
    base: String,
    secret: String,
    signature: String,
    expires: u64,
}
struct Access {
    session: Uuid,
    token: String,
    expires: u64,
}
pub struct NativeClient {
    identity: Identity,
    http: Client,
    access: Option<Access>,
    pending: HashMap<String, Pending>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeStatus {
    pub device: DevicePublic,
    fingerprint: String,
    pub resumable: bool,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn base(value: &str) -> Result<String, String> {
    let u = Url::parse(value).map_err(|_| "Invalid Core address")?;
    if u.scheme() != "http"
        || u.host_str() != Some("127.0.0.1")
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path() != "/"
        || u.port().unwrap_or(0) < 1024
    {
        return Err("Use a local Core at http://127.0.0.1:PORT".into());
    }
    Ok(u.origin().ascii_serialization())
}
fn field(v: &Value, name: &str) -> Result<String, String> {
    v.get(name)
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| "Invalid Core response".into())
}
impl NativeClient {
    pub fn load() -> Result<Self, String> {
        Self::with_identity(Identity::load(Box::new(NativeStore))?)
    }
    pub fn load_runtime() -> Result<Self, String> {
        Self::with_identity(Identity::load_runtime(
            Box::new(NativeStore),
            Box::new(crate::RuntimeSessionStore),
        )?)
    }
    fn with_identity(identity: Identity) -> Result<Self, String> {
        Ok(Self {
            identity,
            http: Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(10))
                .build()
                .map_err(|_| "Network client unavailable")?,
            access: None,
            pending: HashMap::new(),
        })
    }
    pub fn status(&self) -> NativeStatus {
        NativeStatus {
            device: self.identity.public(),
            fingerprint: self.identity.fingerprint(),
            resumable: self.identity.saved.resume.is_some(),
        }
    }
    async fn response(r: reqwest::RequestBuilder) -> Result<Value, String> {
        let mut r = r.send().await.map_err(|_| "Core is unavailable")?;
        let status = r.status();
        if r.content_length().unwrap_or(0) > 2 * 1024 * 1024 {
            return Err("Core response too large".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = r.chunk().await.map_err(|_| "Core is unavailable")? {
            if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
                return Err("Core response too large".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        if status.is_server_error() {
            return Err("Core is unavailable".into());
        }
        let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Invalid Core response")?;
        if !status.is_success() {
            return Err(match value["error"]["code"].as_str() {
                Some("STEP_UP_REQUIRED") => "Fresh passkey verification required",
                Some("REVISION_CONFLICT") => {
                    "This record changed. Review the latest state and try again."
                }
                Some("LOCKDOWN") => "Security lockdown is active",
                Some("FINAL_PASSKEY_REQUIRED") => {
                    "Add another passkey before removing the last one"
                }
                Some("RATE_LIMITED") => "Please wait before trying again",
                Some("RUNTIME_UPDATE_REQUIRED") => "Runtime update required",
                Some("DEVICE_REVOKED") => "Device revoked",
                _ => "Authentication or request rejected",
            }
            .into());
        }
        Ok(value)
    }

    async fn signed(
        &self,
        core: &str,
        method: &str,
        path: &str,
        body: &str,
        session: Uuid,
        token: &str,
    ) -> Result<Value, String> {
        let device = self.identity.public();
        let nonce = random_secret()?;
        let correlation = Uuid::new_v4();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "Invalid system clock")?
            .as_millis()
            .to_string();
        let canonical = canonical_request(
            (device.id, session),
            method,
            path,
            body,
            &timestamp,
            &nonce,
            correlation,
        )?;
        let mut r = self
            .http
            .request(
                Method::from_bytes(method.as_bytes()).map_err(|_| "Invalid method")?,
                format!("{core}{path}"),
            )
            .bearer_auth(token)
            .header("x-jarvis-version", "1")
            .header("x-device-id", device.id.to_string())
            .header("x-session-id", session.to_string())
            .header("x-timestamp", timestamp)
            .header("x-nonce", nonce)
            .header("x-correlation-id", correlation.to_string())
            .header("x-signature", self.identity.sign(&canonical));
        if !body.is_empty() {
            r = r
                .header("content-type", "application/json")
                .body(body.to_string());
        }
        Self::response(r).await
    }
    fn accept(&mut self, core: &str, value: &Value) -> Result<(), String> {
        let session =
            Uuid::parse_str(&field(value, "sessionId")?).map_err(|_| "Invalid session")?;
        let refresh = field(value, "refresh")?;
        let access = field(value, "access")?;
        if refresh.len() != 43
            || access.len() != 43
            || field(value, "deviceId")? != self.identity.public().id.to_string()
        {
            return Err("Invalid session binding".into());
        }
        self.identity.save_resume(Resume {
            session_id: session,
            refresh,
            base: core.into(),
        })?;
        self.access = Some(Access {
            session,
            token: access,
            expires: now() + 840,
        });
        Ok(())
    }
    pub async fn resume(&mut self, core: &str) -> Result<Value, String> {
        let core = base(core)?;
        let r = self
            .identity
            .saved
            .resume
            .clone()
            .ok_or("No saved session. Sign in with your passkey.")?;
        if r.base != core {
            return Err("Saved session belongs to another Core".into());
        }
        let response = self
            .signed(
                &core,
                "POST",
                "/api/v1/session/refresh",
                "{}",
                r.session_id,
                &r.refresh,
            )
            .await?;
        self.accept(&core, &response)?;
        Ok(json!({"version":1,"authenticated":true,"sessionId":r.session_id}))
    }
    pub async fn api(
        &mut self,
        core: &str,
        method: &str,
        path: &str,
        body: Value,
    ) -> Result<Value, String> {
        let core = base(core)?;
        if !matches!(
            (method, path),
            ("GET", "/api/v1/identity/snapshot")
                | ("GET", "/api/v1/setup/status")
                | ("POST", "/api/v1/identity/mutate")
                | ("POST", "/api/v1/sync/ticket")
                | ("POST", "/api/v1/setup/core/verify")
        ) {
            return Err("Native API route is not permitted".into());
        }
        self.allowed_call(&core, method, path, body).await
    }
    // Native callers only. These routes are deliberately absent from the React bridge allowlist.
    pub async fn issue_runtime_session(&mut self, core: &str) -> Result<Value, String> {
        self.allowed_call(&base(core)?, "POST", "/api/v1/runtime/session", json!({}))
            .await
    }
    pub fn adopt_runtime_session(&mut self, core: &str, session: &Value) -> Result<(), String> {
        if !self.identity.runtime {
            return Err("Runtime-only operation".into());
        }
        self.accept(&base(core)?, session)
    }
    pub fn saved_core(&self) -> Option<String> {
        self.identity.saved.resume.as_ref().map(|r| r.base.clone())
    }
    pub async fn runtime_api(
        &mut self,
        core: &str,
        method: &str,
        path: &str,
        body: Value,
    ) -> Result<Value, String> {
        if !self.identity.runtime
            || !matches!(
                (method, path),
                ("GET", "/api/v1/runtime/compatibility")
                    | ("GET", "/api/v1/identity/snapshot")
                    | ("POST", "/api/v1/sync/ticket")
                    | ("POST", "/api/v1/runtime/register")
                    | ("POST", "/api/v1/runtime/heartbeat")
                    | ("POST", "/api/v1/runtime/stop")
                    | ("POST", "/api/v1/voice/session")
            )
        {
            return Err("Runtime route not permitted".into());
        }
        self.allowed_call(&base(core)?, method, path, body).await
    }
    async fn allowed_call(
        &mut self,
        core: &str,
        method: &str,
        path: &str,
        body: Value,
    ) -> Result<Value, String> {
        if self.access.as_ref().is_none_or(|a| a.expires <= now()) {
            self.resume(core).await?;
        }
        if self
            .identity
            .saved
            .resume
            .as_ref()
            .is_none_or(|r| r.base != core)
        {
            return Err("Core binding mismatch".into());
        }
        let a = self.access.as_ref().ok_or("Sign in required")?;
        let raw = if method == "GET" {
            String::new()
        } else {
            serde_json::to_string(&body).map_err(|_| "Invalid request")?
        };
        self.signed(core, method, path, &raw, a.session, &a.token)
            .await
    }
    pub async fn begin(
        &mut self,
        core: &str,
        mode: &str,
        token: Option<String>,
        extra: Value,
    ) -> Result<Value, String> {
        let core = base(core)?;
        self.pending.retain(|_, p| p.expires > now());
        if self.pending.len() >= 4 {
            return Err("Finish or wait for the current ceremony".into());
        }
        let mut input = json!({"version":1,"mode":mode,"device":self.identity.public()});
        for name in ["purpose", "target", "grant", "recoveryCode"] {
            if let Some(v) = extra.get(name) {
                input[name] = v.clone();
            }
        }
        let result = if mode == "pair" {
            let secret = token.ok_or("Pairing secret required")?;
            Self::response(
                self.http
                    .post(format!("{core}/api/v1/enrollment/prepare"))
                    .json(&json!({"version":1,"secret":secret,"device":self.identity.public()})),
            )
            .await?
        } else if matches!(mode, "stepup" | "add") {
            if self
                .identity
                .saved
                .resume
                .as_ref()
                .is_none_or(|r| r.base != core)
            {
                return Err("Core binding mismatch".into());
            }
            if self.access.as_ref().is_none_or(|a| a.expires <= now()) {
                self.resume(&core).await?;
            }
            let a = self.access.as_ref().ok_or("Sign in required")?;
            self.signed(
                &core,
                "POST",
                "/api/v1/auth/prepare",
                &input.to_string(),
                a.session,
                &a.token,
            )
            .await?
        } else if matches!(mode, "bootstrap" | "login" | "recovery") {
            let mut req = self
                .http
                .post(format!("{core}/api/v1/auth/prepare"))
                .json(&input);
            if mode == "bootstrap" {
                req = req.bearer_auth(token.ok_or("Bootstrap credential required")?);
            }
            Self::response(req).await?
        } else {
            return Err("Unsupported ceremony".into());
        };
        let id = field(&result, "id")?;
        Uuid::parse_str(&id).map_err(|_| "Invalid ceremony")?;
        let redeem = field(&result, "redeemSecret")?;
        let challenge = field(&result, "challenge")?;
        let signature = self
            .identity
            .sign(&proof(&id, &challenge, &self.identity.public()));
        Self::response(
            self.http
                .post(format!("{core}/api/v1/auth/activate"))
                .json(&json!({"version":1,"id":id,"secret":redeem,"signature":signature})),
        )
        .await?;
        if mode != "pair" {
            let browser_secret = field(&result, "browserSecret")?;
            let port = Url::parse(&core)
                .map_err(|_| "Invalid Core")?
                .port()
                .ok_or("Missing Core port")?;
            let auth_url = format!("http://localhost:{port}/auth#id={id}&secret={browser_secret}");
            open::that(auth_url).map_err(|_| "System browser could not be opened")?;
        }
        self.pending.insert(
            id.clone(),
            Pending {
                base: core,
                secret: redeem,
                signature,
                expires: now() + 180,
            },
        );
        Ok(json!({"version":1,"id":id}))
    }
    pub async fn poll(&mut self, id: &str) -> Result<Value, String> {
        let p = self.pending.get(id).ok_or("Ceremony not found")?;
        if p.expires <= now() {
            self.pending.remove(id);
            return Err("Ceremony expired".into());
        }
        let core = p.base.clone();
        let result = Self::response(
            self.http
                .post(format!("{core}/api/v1/auth/redeem"))
                .json(&json!({"version":1,"id":id,"secret":p.secret,"signature":p.signature})),
        )
        .await?;
        if result.get("pending").and_then(Value::as_bool) == Some(true) {
            return Ok(json!({"version":1,"pending":true}));
        }
        self.pending.remove(id);
        if result.get("access").is_some() {
            self.accept(&core, &result)?;
            return Ok(
                json!({"version":1,"authenticated":true,"sessionId":result.get("sessionId")}),
            );
        }
        Ok(result)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loopback_only() {
        assert!(base("http://127.0.0.1:4310").is_ok());
        for bad in [
            "https://evil.example",
            "http://localhost:4310",
            "http://127.0.0.1:4310/path",
            "http://user@127.0.0.1:4310",
            "http://127.0.0.1:4310?token=x",
        ] {
            assert!(base(bad).is_err());
        }
    }
}
