//! Nous Research Hermes Agent 会话插件。
//! Hermes 采用 BYOK (Bring-Your-Own-Key) 模式，无集中式官方额度计费接口；本插件提供本地会话列表。

use fly_island_plugin_sdk::{empty, json, now, run, session, Value};
use std::{fs, path::PathBuf, time::Duration};

pub fn parse_session_file(path: &std::path::Path) -> Option<Value> {
    let raw = fs::read(path).ok()?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("hermes-session");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or_default();

    if ext == "json" {
        if let Ok(v) = serde_json::from_slice::<Value>(&raw) {
            let id = v["id"].as_str().or_else(|| v["session_id"].as_str()).unwrap_or(stem);
            let title = v["title"].as_str().or_else(|| v["name"].as_str()).unwrap_or(stem);
            let cwd = v["cwd"].as_str().or_else(|| v["workdir"].as_str());
            let status = match v["status"].as_str() {
                Some("running") | Some("active") => "running",
                Some("waiting") | Some("paused") => "waiting",
                _ => "completed",
            };
            let updated = v["updated_at"]
                .as_i64()
                .or_else(|| v["updatedAt"].as_i64())
                .unwrap_or_else(now);
            let updated = if updated < 10_000_000_000 { updated * 1000 } else { updated };
            return Some(session(id, title, cwd, status, updated, None));
        }
    } else if ext == "jsonl" {
        // Read first non-empty line or last line
        if let Some(first_line) = raw.split(|&b| b == b'\n').find(|line| !line.is_empty()) {
            if let Ok(v) = serde_json::from_slice::<Value>(first_line) {
                let id = v["id"].as_str().or_else(|| v["session_id"].as_str()).unwrap_or(stem);
                let title = v["title"].as_str().or_else(|| v["name"].as_str()).unwrap_or(stem);
                let cwd = v["cwd"].as_str().or_else(|| v["workdir"].as_str());
                let updated = v["timestamp"].as_i64().unwrap_or_else(now);
                return Some(session(id, title, cwd, "completed", updated, None));
            }
        }
    }
    None
}

fn list_sessions(settings: &Value) -> Vec<Value> {
    let mut sessions = Vec::new();
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
    let mut search_dirs = Vec::new();

    if let Some(custom) = settings["sessions_dir"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
        search_dirs.push(PathBuf::from(custom));
    }
    if let Some(h) = home {
        let hermes_root = PathBuf::from(h).join(".hermes");
        search_dirs.push(hermes_root.join("sessions"));
        search_dirs.push(hermes_root.join("chats"));
        search_dirs.push(hermes_root.join("state"));
        search_dirs.push(hermes_root);
    }

    for dir in search_dirs {
        let Ok(entries) = fs::read_dir(dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(s) = parse_session_file(&path) {
                    sessions.push(s);
                }
            }
        }
    }
    sessions
}

fn main() {
    if run(Duration::from_secs(60), |settings| {
        let session_list = list_sessions(settings);
        if session_list.is_empty() {
            Ok(empty())
        } else {
            Ok(json!({
                "quota": [],
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
    fn test_parse_session_json() {
        let temp = std::env::temp_dir().join("hermes_test_session.json");
        let data = json!({
            "id": "hermes-123",
            "title": "Hermes Coding Task",
            "cwd": "C:/Projects/test",
            "status": "running",
            "updated_at": 1750000000
        });
        fs::write(&temp, data.to_string()).unwrap();
        let s = parse_session_file(&temp).expect("should parse");
        let _ = fs::remove_file(&temp);
        assert_eq!(s["id"], "hermes-123");
        assert_eq!(s["title"], "Hermes Coding Task");
        assert_eq!(s["status"], "running");
        assert_eq!(s["updatedAt"], 1750000000000i64);
    }
}