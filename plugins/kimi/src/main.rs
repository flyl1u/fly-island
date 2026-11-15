use fly_island_plugin_sdk::{empty, json, now, quota, run, session, Value};
use std::{fs, path::PathBuf, time::Duration};

fn find_token(settings: &Value) -> Option<String> {
    if let Some(t) = settings["token"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
        return Some(t.to_owned());
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    let candidates = [
        PathBuf::from(&home).join(".kimi/credentials/kimi-code.json"),
        PathBuf::from(&home).join(".kimi/credentials.json"),
        PathBuf::from(&home).join(".kimi-code/credentials.json"),
    ];
    for path in candidates {
        if let Ok(raw) = fs::read(&path) {
            if let Ok(val) = serde_json::from_slice::<Value>(&raw) {
                for key in ["token", "access_token", "apiKey", "api_key"] {
                    if let Some(t) = val[key].as_str().map(str::trim).filter(|s| !s.is_empty()) {
                        return Some(t.to_owned());
                    }
                }
            }
        }
    }
    None
}

fn parse_quota(val: &Value) -> Option<Value> {
    let data = val.get("data").unwrap_or(val);
    let remaining = if let Some(p) = data["remaining_percent"].as_f64() {
        Some(p)
    } else if let Some(used) = data["used_percent"].as_f64() {
        Some((100.0 - used).clamp(0.0, 100.0))
    } else if let (Some(used), Some(total)) = (data["used"].as_f64(), data["total"].as_f64()) {
        if total > 0.0 {
            Some(((total - used) / total * 100.0).clamp(0.0, 100.0))
        } else {
            None
        }
    } else {
        None
    };

    let balance = data["balance"].as_str().or_else(|| data["remaining_amount"].as_str()).map(str::to_owned);
    let reset = data["resets_at"].as_i64().or_else(|| data["next_reset_time"].as_i64()).map(|t| {
        if t < 10_000_000_000 { t * 1000 } else { t }
    });

    Some(quota("kimi-quota", "Kimi Code", remaining, balance, reset))
}

fn fetch_quota(token: &str) -> Option<Value> {
    let resp = ureq::get("https://api.kimi.com/coding/v1/usages")
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .timeout(Duration::from_secs(10))
        .call()
        .ok()?;
    let val: Value = resp.into_json().ok()?;
    parse_quota(&val)
}

fn list_sessions() -> Vec<Value> {
    let mut sessions = Vec::new();
    let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) else {
        return sessions;
    };
    let dirs = [
        PathBuf::from(&home).join(".kimi/sessions"),
        PathBuf::from(&home).join(".kimi/chats"),
    ];
    for dir in dirs {
        let Ok(entries) = fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(raw) = fs::read(&path) {
                if let Ok(v) = serde_json::from_slice::<Value>(&raw) {
                    let id = v["id"].as_str().unwrap_or_default();
                    if id.is_empty() { continue; }
                    let title = v["title"].as_str().or_else(|| v["name"].as_str()).unwrap_or("Untitled session");
                    let cwd = v["cwd"].as_str().or_else(|| v["workdir"].as_str());
                    let status = match v["status"].as_str() {
                        Some("running") | Some("in_progress") => "running",
                        Some("waiting") | Some("paused") => "waiting",
                        _ => "completed",
                    };
                    let updated = v["updatedAt"].as_i64().or_else(|| v["updated_at"].as_i64()).unwrap_or_else(now);
                    let updated = if updated < 10_000_000_000 { updated * 1000 } else { updated };
                    sessions.push(session(id, title, cwd, status, updated, None));
                }
            }
        }
    }
    sessions
}

fn main() {
    if run(Duration::from_secs(60), |settings| {
        let quota_item = find_token(settings).and_then(|t| fetch_quota(&t));
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
    fn test_parse_kimi_quota() {
        let val = json!({
            "data": {
                "used_percent": 28.5,
                "resets_at": 1750000000,
                "balance": "$50.00"
            }
        });
        let q = parse_quota(&val).expect("should parse");
        assert_eq!(q["id"], "kimi-quota");
        assert_eq!(q["remainingPercent"], 71.5);
        assert_eq!(q["balance"], "$50.00");
        assert_eq!(q["resetsAt"], 1750000000000i64);
    }
}
