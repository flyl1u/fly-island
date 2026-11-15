use base64::{engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD}, Engine};
use fly_island_plugin_sdk::{
    chromium_local_state_key, decrypt_chromium_v10, empty, json, now, quota, run, sha256, Value,
};
use std::{fs, path::PathBuf, time::Duration};

fn uuid() -> String {
    let input = format!("{}:{}", std::process::id(), now());
    let hash = sha256(input.as_bytes());
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&hash[..16]);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!("{}-{}-{}-{}-{}", &hex[..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..])
}

fn checksum(machine: &str, millis: i64) -> String {
    let stamp = (millis / 1_000_000) as u32;
    let mut bytes = [
        (stamp >> 8) as u8,
        stamp as u8,
        (stamp >> 24) as u8,
        (stamp >> 16) as u8,
        (stamp >> 8) as u8,
        stamp as u8,
    ];
    let mut previous = 165u8;
    for (i, byte) in bytes.iter_mut().enumerate() {
        *byte = (*byte ^ previous).wrapping_add(i as u8);
        previous = *byte;
    }
    format!("{}{machine}", URL_SAFE_NO_PAD.encode(bytes))
}

fn find_token(settings: &Value) -> Option<String> {
    if let Some(t) = settings["token"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
        return Some(t.to_owned());
    }
    let appdata = std::env::var_os("APPDATA")?;
    let base = PathBuf::from(&appdata).join("Grok Bot");
    let secrets_path = base.join("sand-secrets.json");
    let local_state_path = base.join("Local State");
    let raw = fs::read(&secrets_path).ok()?;
    let root: Value = serde_json::from_slice(&raw).ok()?;
    let accounts_val = match &root["cursor-accounts"] {
        Value::String(s) => serde_json::from_str::<Value>(s).ok()?,
        other => other.clone(),
    };
    let accounts = accounts_val.get("accounts")?.as_object()?;
    let active_slot = accounts_val["active"].as_str();
    let slot = active_slot.or_else(|| accounts.keys().next().map(|s| s.as_str()))?;
    let entry = accounts.get(slot)?;
    let mut encoded = entry["cursor-access-token"].as_str()?.trim();
    if let Some(scoped) = encoded.strip_prefix("scoped:v1:") {
        if let Some((_, val)) = scoped.split_once(':') {
            encoded = val;
        }
    }
    let Ok(blob) = STANDARD.decode(encoded) else {
        return Some(encoded.to_owned());
    };
    if blob.starts_with(b"v10") {
        let key = chromium_local_state_key(&local_state_path).ok()?;
        decrypt_chromium_v10(&key, &blob).ok()
    } else {
        String::from_utf8(blob).ok().or_else(|| Some(encoded.to_owned()))
    }
}

pub fn parse_grok_quota(v: &Value) -> Option<Value> {
    if v["usesPooledEnterpriseAllowance"].as_bool() == Some(true) {
        return None;
    }
    let used = v["usagePercent"].as_f64()?;
    let remaining = (100.0 - used).clamp(0.0, 100.0);
    let reset = v["nextResetTimestampUtc"].as_i64().or_else(|| {
        v["nextResetTimestampUtc"].as_str().and_then(|s| s.parse::<i64>().ok())
    }).map(|t| if t < 10_000_000_000 { t * 1000 } else { t });
    let plan = ["grokPlanLabel", "cursorPlanName"]
        .iter()
        .find_map(|k| v[k].as_str().filter(|s| !s.trim().is_empty()))
        .unwrap_or("Grok Bot");
    Some(quota("grok-bot-quota", plan, Some(remaining), None, reset))
}

fn fetch_quota(token: &str) -> Option<Value> {
    let req_id = uuid();
    let chk = checksum(&req_id, now());
    let resp = ureq::post("https://api2.cursor.sh/aiserver.v1.DashboardService/GetSandUsageStatus")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Content-Type", "application/json")
        .set("Accept", "application/json")
        .set("Connect-Protocol-Version", "1")
        .set("x-cursor-client-type", "sand")
        .set("x-cursor-client-version", "0.1.0")
        .set("x-cursor-checksum", &chk)
        .set("x-request-id", &req_id)
        .set("x-sand-box-namespace", "prod")
        .set("x-ghost-mode", "true")
        .timeout(Duration::from_secs(10))
        .send_string("{}")
        .ok()?;
    let val: Value = resp.into_json().ok()?;
    parse_grok_quota(&val)
}

fn main() {
    if run(Duration::from_secs(60), |settings| {
        let quota_item = find_token(settings).and_then(|t| fetch_quota(&t));
        let quota_list = quota_item.map(|q| vec![q]).unwrap_or_default();
        if quota_list.is_empty() {
            Ok(empty())
        } else {
            Ok(json!({
                "quota": quota_list,
                "sessions": [],
                "notifications": []
            }))
        }
    }, |_, _| Ok(json!(true))).is_err() {
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_checksum_and_uuid() {
        let id = uuid();
        assert_eq!(id.len(), 36);
        let chk = checksum(&id, 1_700_000_000_000);
        assert!(chk.ends_with(&id));
    }

    #[test]
    fn test_parse_grok_quota() {
        let val = json!({
            "usagePercent": 42.0,
            "nextResetTimestampUtc": 1750000000,
            "grokPlanLabel": "Grok Pro"
        });
        let q = parse_grok_quota(&val).expect("should parse");
        assert_eq!(q["id"], "grok-bot-quota");
        assert_eq!(q["label"], "Grok Pro");
        assert_eq!(q["remainingPercent"], 58.0);
        assert_eq!(q["resetsAt"], 1750000000000i64);
    }
}