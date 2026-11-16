//! Algorithms adapted from Renly1994/xiaotang-daozai src/zcode_quota.rs (MIT).
//! Copyright (c) 2026 小唐的Token and Daozai contributors.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use fly_island_plugin_sdk::{
    aes_256_gcm_decrypt, empty, json, quota, read_json, run, sha256, Value,
};
use std::{path::PathBuf, time::Duration};

fn decrypt_value(root: &Value, name: &str) -> Option<String> {
    let raw = root[name].as_str()?;
    let Some(encoded) = raw.strip_prefix("enc:v1:") else {
        return Some(raw.to_owned());
    };
    let secret = std::env::var("ZCODE_CREDENTIAL_SECRET")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            format!(
                "zcode-credential-fallback:win32:{}:{}",
                std::env::var("USERPROFILE").unwrap_or_default(),
                std::env::var("USERNAME").unwrap_or_default()
            )
        });
    let key = sha256(secret.trim().as_bytes());
    let parts: Vec<Vec<u8>> = encoded
        .split('.')
        .map(|s| URL_SAFE_NO_PAD.decode(s).ok())
        .collect::<Option<Vec<_>>>()?;
    if parts.len() != 3 {
        return None;
    }
    let iv = &parts[0];
    let tag = &parts[1];
    let cipher = &parts[2];
    if tag.len() != 16 {
        return None;
    }
    let mut ciphertext_and_tag = cipher.clone();
    ciphertext_and_tag.extend_from_slice(tag);
    let plain = aes_256_gcm_decrypt(&key, iv, &ciphertext_and_tag).ok()?;
    String::from_utf8(plain).ok()
}

pub fn parse_coding_quota(v: &Value) -> Option<Value> {
    for row in v["data"]["limits"].as_array().into_iter().flatten() {
        let Some(used) = row["percentage"].as_f64().filter(|p| (0.0..=100.0).contains(p)) else {
            continue;
        };
        let remaining = (100.0 - used).clamp(0.0, 100.0);
        let reset = row["nextResetTime"].as_i64().filter(|x| *x > 0).map(|x| {
            if x < 10_000_000_000 { x * 1000 } else { x }
        });
        return Some(quota("zcode-quota", "ZCode Coding Plan", Some(remaining), None, reset));
    }
    None
}

pub fn parse_start_quota(v: &Value) -> Option<Value> {
    for bucket in v["data"]["balances"].as_array().into_iter().flatten() {
        let Some(total) = bucket["total_units"]
            .as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .or_else(|| bucket["total_units"].as_f64())
        else {
            continue;
        };
        let Some(left) = bucket["remaining_units"]
            .as_str()
            .and_then(|s| s.parse::<f64>().ok())
            .or_else(|| bucket["remaining_units"].as_f64())
        else {
            continue;
        };
        if total > 0.0 {
            let remaining = (left / total * 100.0).clamp(0.0, 100.0);
            let label = bucket["show_name"].as_str().unwrap_or("ZCode 体验额度");
            let reset = bucket["expires_at"].as_i64().map(|x| if x < 10_000_000_000 { x * 1000 } else { x });
            return Some(quota("zcode-quota", label, Some(remaining), None, reset));
        }
    }
    None
}

fn fetch_quota(settings: &Value) -> Option<Value> {
    if let Some(key) = settings["api_key"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
        let resp = ureq::get("https://api.z.ai/api/monitor/usage/quota/limit")
            .set("Authorization", key)
            .set("Accept", "application/json")
            .timeout(Duration::from_secs(10))
            .call()
            .ok()?;
        let val: Value = resp.into_json().ok()?;
        if let Some(q) = parse_coding_quota(&val) {
            return Some(q);
        }
    }

    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    let path = PathBuf::from(home).join(".zcode/v2/credentials.json");
    let root = read_json(&path, 1024 * 1024).ok()?;
    let family = decrypt_value(&root, "oauth:active_provider").unwrap_or_else(|| "zai".into());
    let jwt = decrypt_value(&root, "zcodejwttoken");

    // Check individual coding plan api key
    let payload_str = jwt.as_deref().and_then(|t| t.split('.').nth(1))?;
    let payload_bytes = URL_SAFE_NO_PAD.decode(payload_str).ok()?;
    let payload: Value = serde_json::from_slice(&payload_bytes).ok()?;
    let sub = payload["sub"].as_str().or_else(|| payload["user_id"].as_str())?;
    let key_name = format!("account-provider:coding-plan:account:{family}-individual-coding-plan:account:{sub}:api-key");

    if let Some(api_key) = decrypt_value(&root, &key_name) {
        let url = if family == "zai" {
            "https://api.z.ai/api/monitor/usage/quota/limit"
        } else {
            "https://bigmodel.cn/api/monitor/usage/quota/limit"
        };
        let resp = ureq::get(url)
            .set("Authorization", &api_key)
            .set("Accept", "application/json")
            .timeout(Duration::from_secs(10))
            .call()
            .ok()?;
        let val: Value = resp.into_json().ok()?;
        if let Some(q) = parse_coding_quota(&val) {
            return Some(q);
        }
    }

    // Fallback: Start plan billing balance
    let telemetry_path = path.with_file_name("telemetry-state.json");
    let mid = read_json(&telemetry_path, 1024 * 1024).ok().and_then(|val| {
        val["deviceMid"].as_str().map(str::to_owned)
    });
    if let Some(t) = jwt {
        let mut req = ureq::get("https://zcode.z.ai/api/v1/zcode-plan/billing/balance")
            .set("Authorization", &format!("Bearer {t}"))
            .set("Accept", "application/json")
            .timeout(Duration::from_secs(10));
        if let Some(m) = &mid {
            req = req.set("X-Device-Mid", m);
        }
        if let Ok(resp) = req.call() {
            if let Ok(val) = resp.into_json::<Value>() {
                if let Some(q) = parse_start_quota(&val) {
                    return Some(q);
                }
            }
        }
    }
    None
}

fn main() {
    if run(Duration::from_secs(60), |settings| {
        let quota_item = fetch_quota(settings);
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
    fn test_parse_coding_quota() {
        let val = json!({
            "code": 200,
            "data": {
                "limits": [
                    {
                        "type": "TOKENS_LIMIT",
                        "percentage": 30.0,
                        "nextResetTime": 1750000000000i64
                    }
                ]
            }
        });
        let q = parse_coding_quota(&val).expect("should parse");
        assert_eq!(q["id"], "zcode-quota");
        assert_eq!(q["label"], "ZCode Coding Plan");
        assert_eq!(q["remainingPercent"], 70.0);
        assert_eq!(q["resetsAt"], 1750000000000i64);
    }

    #[test]
    fn test_parse_start_quota() {
        let val = json!({
            "data": {
                "balances": [
                    {
                        "show_name": "体验额度",
                        "total_units": "1000",
                        "remaining_units": "400",
                        "expires_at": 1750000000
                    }
                ]
            }
        });
        let q = parse_start_quota(&val).expect("should parse");
        assert_eq!(q["label"], "体验额度");
        assert_eq!(q["remainingPercent"], 40.0);
        assert_eq!(q["resetsAt"], 1750000000000i64);
    }
}
