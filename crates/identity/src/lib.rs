use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
use ed25519_dalek::{Signer, SigningKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zeroize::Zeroizing;
pub mod client;
const SERVICE: &str = "com.taxcut.jarvis.identity.v1";
pub trait SecureStore: Send + Sync {
    fn read(&self) -> Result<Option<Vec<u8>>, String>;
    fn write(&self, secret: &[u8]) -> Result<(), String>;
}
pub struct NativeStore;
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl SecureStore for NativeStore {
    fn read(&self) -> Result<Option<Vec<u8>>, String> {
        let entry =
            keyring::Entry::new(SERVICE, "identity").map_err(|_| "Secure storage unavailable")?;
        match entry.get_secret() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("Secure storage could not be read".into()),
        }
    }
    fn write(&self, value: &[u8]) -> Result<(), String> {
        keyring::Entry::new(SERVICE, "identity")
            .and_then(|e| e.set_secret(value))
            .map_err(|_| "Secure storage could not be saved".into())
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
impl SecureStore for NativeStore {
    fn read(&self) -> Result<Option<Vec<u8>>, String> {
        Err(format!("Native secure storage unsupported: {SERVICE}"))
    }
    fn write(&self, _: &[u8]) -> Result<(), String> {
        Err("Native secure storage unsupported".into())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SavedIdentity {
    version: u8,
    id: Uuid,
    key: [u8; 32],
    resume: Option<Resume>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Resume {
    pub session_id: Uuid,
    pub refresh: String,
    pub base: String,
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DevicePublic {
    pub id: Uuid,
    pub public_key: String,
    pub display_name: String,
    pub platform: &'static str,
    pub architecture: &'static str,
}
pub struct Identity {
    saved: SavedIdentity,
    store: Box<dyn SecureStore>,
}
impl Identity {
    pub fn load(store: Box<dyn SecureStore>) -> Result<Self, String> {
        let saved = match store.read()? {
            Some(bytes) => {
                let bytes = Zeroizing::new(bytes);
                let saved: SavedIdentity = serde_json::from_slice(&bytes)
                    .map_err(|_| "Secure identity is corrupt; no replacement was generated")?;
                if saved.version != 1 || saved.id.is_nil() {
                    return Err("Unsupported secure identity".into());
                }
                saved
            }
            None => {
                let mut key = [0u8; 32];
                getrandom::fill(&mut key).map_err(|_| "Secure randomness unavailable")?;
                SavedIdentity {
                    version: 1,
                    id: Uuid::new_v4(),
                    key,
                    resume: None,
                }
            }
        };
        let value = Self { saved, store };
        value.persist()?;
        Ok(value)
    }
    fn persist(&self) -> Result<(), String> {
        let bytes = Zeroizing::new(
            serde_json::to_vec(&self.saved).map_err(|_| "Secure identity could not be encoded")?,
        );
        self.store.write(&bytes)
    }
    pub fn public(&self) -> DevicePublic {
        DevicePublic {
            id: self.saved.id,
            public_key: B64.encode(
                SigningKey::from_bytes(&self.saved.key)
                    .verifying_key()
                    .as_bytes(),
            ),
            display_name: if cfg!(target_os = "macos") {
                "Mac"
            } else {
                "Windows PC"
            }
            .into(),
            platform: if cfg!(target_os = "macos") {
                "macos"
            } else {
                "windows"
            },
            architecture: if cfg!(target_arch = "aarch64") {
                "arm64"
            } else {
                "x64"
            },
        }
    }
    pub fn fingerprint(&self) -> String {
        hash(
            SigningKey::from_bytes(&self.saved.key)
                .verifying_key()
                .as_bytes(),
        )
    }
    fn sign(&self, value: &str) -> String {
        B64.encode(
            SigningKey::from_bytes(&self.saved.key)
                .sign(value.as_bytes())
                .to_bytes(),
        )
    }
    fn save_resume(&mut self, resume: Resume) -> Result<(), String> {
        self.saved.resume = Some(resume);
        self.persist()
    }
}
impl Drop for SavedIdentity {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.key.zeroize();
        if let Some(r) = self.resume.as_mut() {
            r.refresh.zeroize();
        }
    }
}
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn canonical_request(
    (device, session): (Uuid, Uuid),
    method: &str,
    path: &str,
    body: &str,
    timestamp: &str,
    nonce: &str,
    correlation: Uuid,
) -> Result<String, String> {
    if !matches!(method, "GET" | "POST")
        || !path.starts_with("/api/v1/")
        || path
            .bytes()
            .any(|c| !c.is_ascii_lowercase() && !c.is_ascii_digit() && c != b'/' && c != b'-')
        || timestamp.len() != 13
        || !timestamp.bytes().all(|c| c.is_ascii_digit())
        || B64.decode(nonce).map(|v| v.len()).unwrap_or(0) != 32
    {
        return Err("Invalid signed request".into());
    }
    Ok(format!("JARVIS-REQUEST-V1\n{device}\n{session}\n{method}\n{path}\n{}\n{timestamp}\n{nonce}\n{correlation}",hash(body.as_bytes())))
}
fn proof(id: &str, challenge: &str, device: &DevicePublic) -> String {
    format!(
        "JARVIS-PROOF-V1\n{id}\n{challenge}\n{}\n{}",
        device.id, device.public_key
    )
}
fn random_secret() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "Secure randomness unavailable")?;
    Ok(B64.encode(bytes))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    #[derive(Clone, Default)]
    struct Mock(Arc<Mutex<Option<Vec<u8>>>>);
    impl SecureStore for Mock {
        fn read(&self) -> Result<Option<Vec<u8>>, String> {
            Ok(self.0.lock().unwrap().clone())
        }
        fn write(&self, v: &[u8]) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(v.to_vec());
            Ok(())
        }
    }
    #[test]
    fn secure_identity_is_stable_and_corruption_fails_closed() {
        let store = Mock::default();
        let first = Identity::load(Box::new(store.clone())).unwrap();
        let second = Identity::load(Box::new(store.clone())).unwrap();
        assert_eq!(first.public().id, second.public().id);
        assert_eq!(first.fingerprint(), second.fingerprint());
        assert_eq!(first.fingerprint().len(), 64);
        assert!(!serde_json::to_string(&first.public())
            .unwrap()
            .contains("refresh"));
        *store.0.lock().unwrap() = Some(b"corrupt".to_vec());
        assert!(Identity::load(Box::new(store)).is_err());
    }
    #[test]
    fn signing_is_compatible_and_binds_body() {
        let id = Identity::load(Box::new(Mock::default())).unwrap();
        let message = canonical_request(
            (id.public().id, Uuid::new_v4()),
            "POST",
            "/api/v1/identity/mutate",
            "{}",
            "1800000000000",
            &B64.encode([7u8; 32]),
            Uuid::new_v4(),
        )
        .unwrap();
        let sig =
            ed25519_dalek::Signature::from_slice(&B64.decode(id.sign(&message)).unwrap()).unwrap();
        let key = SigningKey::from_bytes(&id.saved.key).verifying_key();
        assert!(key.verify_strict(message.as_bytes(), &sig).is_ok());
        assert!(key
            .verify_strict(format!("{message}x").as_bytes(), &sig)
            .is_err());
        assert!(canonical_request(
            (id.public().id, Uuid::new_v4()),
            "POST",
            "/api/v1/path?x=1",
            "",
            "1800000000000",
            &B64.encode([7u8; 32]),
            Uuid::new_v4()
        )
        .is_err());
    }
    #[test]
    fn cross_language_signature_fixture() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../packages/security/fixtures/signing-v1.json"
        ))
        .unwrap();
        let key = SigningKey::from_bytes(&[1u8; 32]); // Public, test-only fixture seed.
        let message = fixture["canonical"].as_str().unwrap();
        assert_eq!(
            B64.encode(key.verifying_key().as_bytes()),
            fixture["publicKey"].as_str().unwrap()
        );
        assert_eq!(
            hash(key.verifying_key().as_bytes()),
            fixture["fingerprint"].as_str().unwrap()
        );
        assert_eq!(
            B64.encode(key.sign(message.as_bytes()).to_bytes()),
            fixture["signature"].as_str().unwrap()
        );
        let input = &fixture["input"];
        assert_eq!(
            canonical_request(
                (
                    Uuid::parse_str(input["deviceId"].as_str().unwrap()).unwrap(),
                    Uuid::parse_str(input["sessionId"].as_str().unwrap()).unwrap()
                ),
                "POST",
                input["path"].as_str().unwrap(),
                input["body"].as_str().unwrap(),
                input["timestamp"].as_str().unwrap(),
                input["nonce"].as_str().unwrap(),
                Uuid::parse_str(input["correlationId"].as_str().unwrap()).unwrap()
            )
            .unwrap(),
            message
        );
    }
    #[test]
    fn unavailable_storage_has_no_fallback() {
        struct Denied;
        impl SecureStore for Denied {
            fn read(&self) -> Result<Option<Vec<u8>>, String> {
                Err("unavailable".into())
            }
            fn write(&self, _: &[u8]) -> Result<(), String> {
                panic!("must not write fallback")
            }
        }
        assert!(Identity::load(Box::new(Denied)).is_err());
    }
    #[test]
    #[ignore = "Run explicitly on owner Mac; uses and removes an isolated Keychain entry"]
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    fn native_store_roundtrip() {
        let id = Uuid::new_v4().to_string();
        let entry = keyring::Entry::new("com.taxcut.jarvis.validation", &id).unwrap();
        let secret = random_secret().unwrap();
        entry.set_secret(secret.as_bytes()).unwrap();
        assert_eq!(entry.get_secret().unwrap(), secret.as_bytes());
        entry.delete_credential().unwrap();
        assert!(matches!(entry.get_secret(), Err(keyring::Error::NoEntry)));
    }
}
