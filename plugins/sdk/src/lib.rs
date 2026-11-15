//! API v1 stdio runtime. Only JSON-RPC goes to stdout; credentials never go to diagnostics.
use std::{io::{self, BufRead, Write}, path::Path, sync::mpsc, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
pub use serde_json::{json, Value};

pub fn now() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64) }
pub fn empty() -> Value { json!({"quota":[],"sessions":[],"notifications":[]}) }
pub fn quota(id: &str, label: &str, percent: Option<f64>, balance: Option<String>, reset: Option<i64>) -> Value {
    json!({"id":id,"label":label,"remainingPercent":percent.map(|v| v.clamp(0.0,100.0)),"secondaryPercent":null,"balance":balance,"resetsAt":reset,"updatedAt":now()})
}
pub fn session(id: &str, title: &str, cwd: Option<&str>, status: &str, updated: i64, action: Option<&str>) -> Value {
    json!({"id":id,"title":title,"cwd":cwd,"status":status,"updatedAt":updated,"action":action})
}
pub fn notification(id: &str, source_id: &str, app_name: &str, icon: &str, title: &str, body: &str, action: Option<&str>) -> Value {
    json!({"id":id,"sourceId":source_id,"appName":app_name,"icon":icon,"title":title,"body":body,"receivedAt":now(),"action":action})
}

pub fn send(value: Value) -> io::Result<()> {
    let mut out = io::stdout().lock();
    writeln!(out, "{value}")?;
    out.flush()
}

pub fn publish(data: Value) -> io::Result<()> {
    send(json!({"jsonrpc":"2.0","method":"publish","params":data}))
}

pub fn sha256(data: &[u8]) -> [u8; 32] {
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

pub fn aes_256_gcm_decrypt(key: &[u8], nonce: &[u8], ciphertext_and_tag: &[u8]) -> Result<Vec<u8>, String> {
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce);
    cipher.decrypt(nonce, ciphertext_and_tag).map_err(|e| e.to_string())
}

#[cfg(windows)]
pub fn dpapi_decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::{
        Foundation::{LocalFree, HLOCAL},
        Security::Cryptography::{CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB},
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output)
            .map_err(|e| e.to_string())?;
        if output.pbData.is_null() {
            return Err("DPAPI decryption returned null".into());
        }
        let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as _)));
        Ok(slice)
    }
}

#[cfg(not(windows))]
pub fn dpapi_decrypt(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI only supported on Windows".into())
}

#[cfg(windows)]
pub fn dpapi_encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::{
        Foundation::{LocalFree, HLOCAL},
        Security::Cryptography::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB},
    };
    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut output)
            .map_err(|e| e.to_string())?;
        if output.pbData.is_null() {
            return Err("DPAPI encryption returned null".into());
        }
        let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as _)));
        Ok(slice)
    }
}

#[cfg(not(windows))]
pub fn dpapi_encrypt(_data: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI only supported on Windows".into())
}

pub fn chromium_local_state_key(local_state_path: &Path) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let raw = std::fs::read(local_state_path).map_err(|e| e.to_string())?;
    let json: Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
    let b64 = json["os_crypt"]["encrypted_key"].as_str().ok_or("No encrypted_key in Local State")?;
    let decoded = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let protected = decoded.strip_prefix(b"DPAPI").ok_or("encrypted_key does not start with DPAPI")?;
    dpapi_decrypt(protected)
}

pub fn decrypt_chromium_v10(key: &[u8], ciphertext: &[u8]) -> Result<String, String> {
    let payload = ciphertext.strip_prefix(b"v10").ok_or("Payload does not start with v10")?;
    if payload.len() < 12 + 16 {
        return Err("Payload too short for v10".into());
    }
    let nonce = &payload[..12];
    let cipher_and_tag = &payload[12..];
    let plain = aes_256_gcm_decrypt(key, nonce, cipher_and_tag)?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

pub fn run(mut interval: Duration, mut poll: impl FnMut(&Value) -> Result<Value, String>, mut action: impl FnMut(&str, &Value) -> Result<Value, String>) -> Result<(), String> {
    let (tx, rx) = mpsc::sync_channel(16);
    std::thread::spawn(move || {
        let input = io::stdin();
        for line in input.lock().lines() {
            let Ok(line) = line else { break; };
            if line.len() > 256 * 1024 { break; }
            if tx.send(line).is_err() { break; }
        }
    });
    let mut settings = Value::Null;
    let mut ready = false;
    let mut next = Instant::now();
    loop {
        let wait = if ready { next.saturating_duration_since(Instant::now()) } else { Duration::from_secs(10) };
        match rx.recv_timeout(wait) {
            Ok(line) => {
                let v: Value = serde_json::from_str(&line).map_err(|_| "Invalid RPC")?;
                if v["jsonrpc"] != "2.0" { return Err("Invalid RPC version".into()); }
                let id = v["id"].clone();
                match v["method"].as_str() {
                    Some("initialize") if !ready && v["params"]["apiVersion"] == 1 => {
                        settings = v["params"]["settings"].clone();
                        if let Some(seconds) = settings["interval"].as_str().and_then(|s| s.parse::<u64>().ok()) { interval = Duration::from_secs(seconds.clamp(1,3600)); }
                        send(json!({"jsonrpc":"2.0","id":id,"result":{"apiVersion":1}})).map_err(|e| e.to_string())?;
                        ready = true; next = Instant::now();
                    }
                    Some("action") if ready => {
                        match action(v["params"]["id"].as_str().unwrap_or_default(), &settings) {
                            Ok(result) => send(json!({"jsonrpc":"2.0","id":id,"result":result})),
                            Err(_) => send(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,"message":"Action failed"}})),
                        }.map_err(|e| e.to_string())?;
                        next = Instant::now();
                    }
                    _ => { send(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Unknown method"}})).map_err(|e| e.to_string())?; }
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
            Err(mpsc::RecvTimeoutError::Timeout) if !ready => return Err("Initialize timeout".into()),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if ready && Instant::now() >= next {
            let params = match poll(&settings) { Ok(v) => v, Err(_) => { eprintln!("Plugin refresh unavailable; check local sign-in"); empty() } };
            send(json!({"jsonrpc":"2.0","method":"publish","params":params})).map_err(|e| e.to_string())?;
            next = Instant::now() + interval;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256() {
        let hash = sha256(b"hello world");
        let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    }

    #[test]
    fn test_aes_gcm() {
        use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
        let key = [42u8; 32];
        let nonce = [7u8; 12];
        let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
        let encrypted = cipher.encrypt(Nonce::from_slice(&nonce), b"secret text".as_slice()).unwrap();
        let decrypted = aes_256_gcm_decrypt(&key, &nonce, &encrypted).unwrap();
        assert_eq!(decrypted, b"secret text");
    }

    #[cfg(windows)]
    #[test]
    fn test_dpapi() {
        let secret = b"super secret dpapi data";
        let encrypted = dpapi_encrypt(secret).unwrap();
        let decrypted = dpapi_decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, secret);
    }
}
