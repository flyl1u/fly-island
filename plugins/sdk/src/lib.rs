//! API v1 stdio runtime. Only JSON-RPC goes to stdout; credentials never go to diagnostics.
//! Local credential algorithm reference: Renly1994/xiaotang-daozai src/native_auth.rs (MIT).
//! Copyright (c) 2026 小唐的Token and Daozai contributors.
use std::{io::{self, BufRead, Read, Write}, path::Path, sync::mpsc, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
pub use serde_json::{json, Value};
pub mod credentials;
const MAX_LINE: usize = 256 * 1024;
static READY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

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
    if !READY.load(std::sync::atomic::Ordering::Acquire) { return Ok(()); }
    send(json!({"jsonrpc":"2.0","method":"publish","params":bounded_contributions(data)}))
}

fn bounded_contributions(mut data: Value) -> Value {
    for (field, cap) in [("quota", 32), ("sessions", 200), ("notifications", 100)] {
        // Read the field, never index it: indexing a missing key would add a null the host
        // cannot read as an array. A plugin that only sends a panel leaves the others out.
        if let Some(items) = data.get_mut(field).and_then(Value::as_array_mut) {
            if field == "sessions" { items.sort_by_key(|s| std::cmp::Reverse(s["updatedAt"].as_i64().unwrap_or(0))); }
            let mut ids = std::collections::HashSet::new();
            items.retain(|item| item["id"].as_str().is_some_and(|s| !s.is_empty() && ids.insert(s.to_owned()))
                && item.as_object().is_some_and(|o| o.values().all(|v| v.as_str().is_none_or(|s| s.len() <= 4096 && !s.contains('\0')))));
            items.truncate(cap);
        }
    }
    // Count bounds alone do not bound UTF-8 payload size. Preserve the newest entries.
    while data.to_string().len() > MAX_LINE - 128 {
        let field = ["sessions", "notifications", "quota"].into_iter()
            .max_by_key(|key| data[*key].as_array().map_or(0, Vec::len));
        let Some(items) = field.and_then(|key| data.get_mut(key)).and_then(Value::as_array_mut).filter(|items| !items.is_empty()) else { return empty(); };
        items.pop();
    }
    data
}

pub fn read_json(path: &Path, limit: u64) -> Result<Value, String> {
    let mut bytes = Vec::new();
    std::fs::File::open(path).map_err(|e| e.to_string())?.take(limit + 1)
        .read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit { return Err("Local JSON file too large".into()); }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid local JSON".into())
}

pub fn file_timestamp(path: &Path) -> i64 {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as i64)
}

pub fn timestamp_or_file(value: Option<i64>, path: &Path) -> i64 {
    value.map_or_else(|| file_timestamp(path), |t| if t < 10_000_000_000 { t.saturating_mul(1000) } else { t })
}

pub fn sha256(data: &[u8]) -> [u8; 32] {
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

pub fn aes_256_gcm_decrypt(key: &[u8], nonce: &[u8], ciphertext_and_tag: &[u8]) -> Result<Vec<u8>, String> {
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    if nonce.len() != 12 { return Err("Invalid AES-GCM nonce length".into()); }
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
        cbData: u32::try_from(data.len()).map_err(|_| "DPAPI input too large")?,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    // SAFETY: input points into the live slice; DPAPI allocates output, copied before LocalFree.
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
        cbData: u32::try_from(data.len()).map_err(|_| "DPAPI input too large")?,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    // SAFETY: input points into the live slice; DPAPI allocates output, copied before LocalFree.
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
    let json = read_json(local_state_path, 16 * 1024 * 1024)?;
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
    struct RuntimeGuard;
    impl Drop for RuntimeGuard {
        fn drop(&mut self) { READY.store(false, std::sync::atomic::Ordering::Release); }
    }
    let _runtime = RuntimeGuard;
    let (tx, rx) = mpsc::sync_channel(16);
    std::thread::spawn(move || {
        let input = io::stdin();
        let mut reader = input.lock();
        loop {
            let mut bytes = Vec::new();
            if !matches!(reader.by_ref().take((MAX_LINE + 1) as u64).read_until(b'\n', &mut bytes), Ok(n) if n > 0)
                || bytes.len() > MAX_LINE { break; }
            let Ok(line) = String::from_utf8(bytes) else { break; };
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
                    Some("shutdown") => return Ok(()),
                    Some("initialize") if !ready && v["params"]["apiVersion"] == 1 => {
                        settings = v["params"]["settings"].clone();
                        if let Some(seconds) = settings["interval"].as_str().and_then(|s| s.parse::<u64>().ok()) { interval = Duration::from_secs(seconds.clamp(1,3600)); }
                        send(json!({"jsonrpc":"2.0","id":id,"result":{"apiVersion":1}})).map_err(|e| e.to_string())?;
                        READY.store(true, std::sync::atomic::Ordering::Release);
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
            publish(params).map_err(|e| e.to_string())?;
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
        for nonce in [&[][..], &[0; 11][..], &[0; 13][..]] {
            assert!(aes_256_gcm_decrypt(&key, nonce, &encrypted).is_err());
        }
    }

    #[test]
    fn histories_are_deduplicated_sorted_and_bounded_by_count_and_bytes() {
        let sessions: Vec<_> = (0..500).map(|i| session(&format!("s{i}"), &"a".repeat(4000), None, "completed", i, None)).collect();
        let data = bounded_contributions(json!({"quota":[],"sessions":sessions,"notifications":[]}));
        let items = data["sessions"].as_array().unwrap();
        assert!(items.len() < 200 && !items.is_empty());
        assert_eq!(items[0]["updatedAt"], 499);
        assert!(data.to_string().len() < MAX_LINE - 128);
        let duplicate = session("same", "hello", None, "completed", 1, None);
        let data = bounded_contributions(json!({"sessions":[duplicate,duplicate]}));
        assert_eq!(data["sessions"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn a_panel_only_payload_is_not_padded_with_nulls() {
        // Indexing a missing key would add `"quota": null`, which the host cannot read as an
        // array; a plugin with only a page must be able to send just that.
        let data = bounded_contributions(json!({"panel": {"headline": "hi"}}));
        assert_eq!(data, json!({"panel": {"headline": "hi"}}));
    }

    #[test]
    fn missing_session_time_does_not_manufacture_a_new_completion() {
        let path = std::env::temp_dir().join(format!("fly-sdk-time-{}.json", std::process::id()));
        std::fs::write(&path, "{}").unwrap();
        let first = timestamp_or_file(None, &path);
        assert_eq!(timestamp_or_file(None, &path), first);
        assert_eq!(timestamp_or_file(Some(1_750_000_000), &path), 1_750_000_000_000);
        assert!(read_json(&path, 1).is_err());
        std::fs::remove_file(path).unwrap();
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
