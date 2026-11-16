//! Protocol reference: Renly1994/xiaotang-daozai src/gemini_quota.rs (MIT).
//! Copyright (c) 2026 小唐的Token and Daozai contributors.
use fly_island_plugin_sdk::{empty, json, now, quota, read_json, run, session, timestamp_or_file, Value};
use std::{fs, path::PathBuf, time::Duration};

struct Creds {
    access_token: String,
    refresh_token: Option<String>,
    expires_at: Option<i64>,
    client_id: Option<String>,
    client_secret: Option<String>,
}

fn load_creds(settings: &Value) -> Option<Creds> {
    if let Some(t) = settings["token"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
        let refresh = settings["refresh_token"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned);
        return Some(Creds {
            access_token: t.to_owned(),
            refresh_token: refresh,
            expires_at: None,
            client_id: None,
            client_secret: None,
        });
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    let candidates = [
        PathBuf::from(&home).join(".gemini/oauth_creds.json"),
        PathBuf::from(&home).join(".config/gemini/oauth_creds.json"),
        PathBuf::from(&home).join(".gemini/credentials.json"),
    ];
    for path in candidates {
        if let Ok(v) = read_json(&path, 1024 * 1024) {
                let access = v["access_token"].as_str().or_else(|| v["token"].as_str()).map(str::trim).filter(|s| !s.is_empty());
                if let Some(acc) = access {
                    return Some(Creds {
                        access_token: acc.to_owned(),
                        refresh_token: v["refresh_token"].as_str().map(str::to_owned),
                        expires_at: v["expiry_date"].as_i64().or_else(|| v["expires_at"].as_i64()),
                        client_id: v["client_id"].as_str().map(str::to_owned),
                        client_secret: v["client_secret"].as_str().map(str::to_owned),
                    });
                }
        }
    }
    None
}

fn refresh_token_if_needed(creds: &mut Creds) {
    let now_ms = now();
    let is_expired = creds.expires_at.is_some_and(|exp| {
        let exp_ms = if exp < 10_000_000_000 { exp * 1000 } else { exp };
        now_ms + 60_000 >= exp_ms
    });
    if !is_expired {
        return;
    }
    let Some(refresh) = &creds.refresh_token else { return };
    let client_id = creds.client_id.as_deref().unwrap_or("681255809395-oo8ft2oprreus9msvdrvm02mepq9rhkn.apps.googleusercontent.com");
    let client_secret = creds.client_secret.as_deref().unwrap_or("");
    let mut form = vec![("grant_type", "refresh_token"), ("client_id", client_id), ("refresh_token", refresh)];
    if !client_secret.is_empty() {
        form.push(("client_secret", client_secret));
    }
    let Ok(resp) = ureq::post("https://oauth2.googleapis.com/token")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .timeout(Duration::from_secs(10))
        .send_form(&form) else { return };
    if let Ok(json) = resp.into_json::<Value>() {
        if let Some(new_tok) = json["access_token"].as_str() {
            creds.access_token = new_tok.to_owned();
            if let Some(sec) = json["expires_in"].as_i64() {
                creds.expires_at = Some(now_ms + sec * 1000);
            }
        }
    }
}

pub fn parse_gemini_quota(v: &Value) -> Option<Value> {
    // 1. Direct userQuota: { "userQuota": { "remaining": 80.0, "total": 100.0, "resetsAt": ... } }
    if let Some(uq) = v.get("userQuota").or_else(|| v.get("user_quota")) {
        let remaining = if let Some(p) = uq["remaining_percent"].as_f64() {
            Some(p)
        } else if let (Some(rem), Some(tot)) = (uq["remaining"].as_f64(), uq["total"].as_f64()) {
            if tot > 0.0 { Some(rem / tot * 100.0) } else { None }
        } else {
            None
        };
        let reset = uq["resetsAt"].as_i64().or_else(|| uq["resets_at"].as_i64()).map(|t| {
            if t < 10_000_000_000 { t * 1000 } else { t }
        });
        return Some(quota("gemini-quota", "Gemini Code Assist", remaining, None, reset));
    }
    // 2. LoadCodeAssist response with tier / quota limits
    if let Some(tier) = v["tier"].as_str().or_else(|| v["plan"].as_str()) {
        let remaining = v["remaining_percent"].as_f64();
        let reset = v["resets_at"].as_i64().map(|t| if t < 10_000_000_000 { t * 1000 } else { t });
        return Some(quota("gemini-quota", &format!("Gemini ({tier})"), remaining, None, reset));
    }
    // 3. Fallback generic quota structure
    if let Some(rem) = v["remaining_percent"].as_f64() {
        return Some(quota("gemini-quota", "Gemini Code Assist", Some(rem), None, None));
    }
    None
}

fn fetch_quota(creds: &mut Creds) -> Option<Value> {
    refresh_token_if_needed(creds);
    let endpoints = [
        "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
        "https://cloudcode-pa.googleapis.com/v1:retrieveUserQuota",
    ];
    for url in endpoints {
        let resp = ureq::post(url)
            .set("Authorization", &format!("Bearer {}", creds.access_token))
            .set("Content-Type", "application/json")
            .timeout(Duration::from_secs(10))
            .send_string(r#"{"client_metadata":{"ide_type":"IDE_TYPE_UNSPECIFIED"}}"#);
        if let Ok(r) = resp {
            if let Ok(val) = r.into_json::<Value>() {
                if let Some(q) = parse_gemini_quota(&val) {
                    return Some(q);
                }
            }
        }
    }
    None
}

fn list_sessions() -> Vec<Value> {
    let mut sessions = Vec::new();
    let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) else {
        return sessions;
    };
    let home_path = PathBuf::from(&home);
    let search_dirs = [
        home_path.join(".gemini/tmp"),
        home_path.join(".gemini/chats"),
        home_path.join(".gemini/conversations"),
        home_path.join(".gemini/antigravity/conversations"),
    ];
    for base in search_dirs {
        let Ok(entries) = fs::read_dir(&base) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // Check if subdir has chats
                let chats_dir = path.join("chats");
                if chats_dir.is_dir() {
                    if let Ok(chats) = fs::read_dir(chats_dir) {
                        for chat in chats.flatten() {
                            let cp = chat.path();
                            if cp.extension().and_then(|e| e.to_str()) == Some("json") {
                                if let Ok(v) = read_json(&cp, 16 * 1024 * 1024) {
                                        let id = v["id"].as_str().or_else(|| v["sessionId"].as_str()).unwrap_or_default();
                                        if !id.is_empty() {
                                            let title = v["title"].as_str().unwrap_or("Gemini Chat");
                                            let cwd = v["cwd"].as_str().or_else(|| v["workdir"].as_str());
                                            let updated = timestamp_or_file(v["updatedAt"].as_i64(), &cp);
                                            sessions.push(session(id, title, cwd, "completed", updated, None));
                                        }
                                }
                            }
                        }
                    }
                }
            } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(v) = read_json(&path, 16 * 1024 * 1024) {
                        let id = v["id"].as_str().or_else(|| v["sessionId"].as_str()).unwrap_or_default();
                        if !id.is_empty() {
                            let title = v["title"].as_str().unwrap_or("Gemini Chat");
                            let cwd = v["cwd"].as_str().or_else(|| v["workdir"].as_str());
                            let updated = timestamp_or_file(v["updatedAt"].as_i64(), &path);
                            sessions.push(session(id, title, cwd, "completed", updated, None));
                        }
                }
            }
        }
    }
    sessions
}

fn main() {
    if run(Duration::from_secs(60), |settings| {
        let mut creds = load_creds(settings);
        let quota_item = creds.as_mut().and_then(fetch_quota);
        let quota_list = quota_item.map(|q| vec![q]).unwrap_or_default();
        let session_list = list_sessions();
        if quota_list.is_empty() && session_list.is_empty() {
            Ok(empty())
        } else {
            Ok(json!({
                "quota": quota_list,
                "sessions": session_list,
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
    fn test_parse_gemini_quota_user_quota() {
        let val = json!({
            "userQuota": {
                "remaining": 75.0,
                "total": 100.0,
                "resetsAt": 1750000000
            }
        });
        let q = parse_gemini_quota(&val).expect("should parse");
        assert_eq!(q["id"], "gemini-quota");
        assert_eq!(q["remainingPercent"], 75.0);
        assert_eq!(q["resetsAt"], 1750000000000i64);
    }

    #[test]
    fn test_parse_gemini_quota_tier() {
        assert!(parse_gemini_quota(&json!({"tier":"STANDARD"})).unwrap()["remainingPercent"].is_null());
        let val = json!({
            "tier": "STANDARD",
            "remaining_percent": 88.0,
            "resets_at": 1750000000
        });
        let q = parse_gemini_quota(&val).expect("should parse");
        assert_eq!(q["label"], "Gemini (STANDARD)");
        assert_eq!(q["remainingPercent"], 88.0);
    }
}
