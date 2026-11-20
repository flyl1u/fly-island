//! MiniMax Code：M Plan 额度余量、会话任务进度，以及等待审批的提醒。
//!
//! 只读本机数据：会话库 `~/.minimax/v2/sqlite/runtime-state.sqlite`、`~/.mmx/config.json`
//! 里的 Token Plan 登录信息，以及可选的审批标记 `%LOCALAPPDATA%\fly-island-minimax\approvals.json`。
//! 审批标记由用户自己配置的 MiniMax Code PermissionRequest Hook 写入，插件不安装、不修改任何 Hook。

use fly_island_plugin_sdk::{json, now, quota, read_json, run, Value};
use rusqlite::{Connection, OpenFlags};
use std::{
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    time::Duration,
};

/// 一次最多发布多少条会话：能看清同时在跑的几件事，又不挤满列表。
const MAX_SESSIONS: usize = 12;
/// 结束的会话只在这段时间内出现，避免历史任务每轮都显示成「刚完成」。
const COMPLETED_WINDOW_MS: i64 = 10 * 60 * 1000;
/// 只往回查一天，长期不动的历史会话不参与。
const LOOKBACK_MS: i64 = 24 * 60 * 60 * 1000;
/// 只读 messages.jsonl 的尾部，任务清单一般就在最近几轮里。
const TAIL_BYTES: u64 = 256 * 1024;
/// 协议对每个文本字段的上限。
const TEXT_LIMIT: usize = 4096;

fn home() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn clip(text: &str) -> String {
    if text.len() <= TEXT_LIMIT {
        return text.to_owned();
    }
    let mut end = TEXT_LIMIT;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_owned()
}

/// Token Plan 的地址与凭据：插件里填的密钥优先，否则用 `mmx` 登录时存下的那一份。
fn plan_endpoint(settings: &Value) -> Option<(String, String)> {
    let config = home()
        .map(|dir| dir.join(".mmx").join("config.json"))
        .and_then(|path| read_json(&path, 64 * 1024).ok());
    let base = config
        .as_ref()
        .and_then(|config| config["oauth"]["resource_url"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| match config.as_ref().and_then(|config| config["region"].as_str()) {
            Some("global") => "https://api.minimax.io".to_owned(),
            _ => "https://api.minimaxi.com".to_owned(),
        });
    let token = settings["api_key"]
        .as_str()
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(str::to_owned)
        .or_else(|| config.as_ref().and_then(|config| config["api_key"].as_str()).map(str::to_owned))
        .or_else(|| {
            config
                .as_ref()
                .and_then(|config| config["oauth"]["access_token"].as_str())
                .map(str::to_owned)
        })?;
    Some((token, base))
}

/// 5 小时窗口是外环，周窗口是内环；两个窗口各自刷新，所以分开发。
fn parse_quota(body: &Value) -> Option<Value> {
    let rows = body["model_remains"].as_array()?;
    let row = rows
        .iter()
        .find(|row| row["model_name"].as_str() == Some("general"))
        .or_else(|| rows.first())?;
    let interval = row["current_interval_remaining_percent"].as_f64()?;
    let weekly = row["current_weekly_remaining_percent"].as_f64();
    let mut entry = quota("token-plan", "Token Plan", Some(interval), None, row["end_time"].as_i64());
    entry["secondaryPercent"] = json!(weekly);
    Some(entry)
}

fn fetch_quota(settings: &Value) -> Option<Value> {
    let (token, base) = plan_endpoint(settings)?;
    let body: Value = ureq::get(&format!("{base}/v1/token_plan/remains"))
        .set("Authorization", &format!("Bearer {token}"))
        .set("x-api-key", &token)
        .set("Accept", "application/json")
        .timeout(Duration::from_secs(10))
        .call()
        .ok()?
        .into_json()
        .ok()?;
    parse_quota(&body)
}

struct SessionRow {
    id: String,
    title: String,
    status: String,
    cwd: Option<String>,
    updated: i64,
    history: Option<String>,
}

/// 只读打开 MiniMax Code 自己的会话库；它可能正被占用，所以不等待、不重试。
fn recent_sessions(now_ms: i64) -> Vec<SessionRow> {
    let Some(path) = home().map(|dir| dir.join(".minimax/v2/sqlite/runtime-state.sqlite")) else {
        return Vec::new();
    };
    if !path.exists() {
        return Vec::new();
    }
    let Ok(db) = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) else {
        return Vec::new();
    };
    let Ok(mut statement) = db.prepare(
        "SELECT session_id, title, status, workspace_dir, updated_at_ms, history_relative_dir
         FROM local_runtime_sessions
         WHERE CAST(archived AS INTEGER) = 0
           AND visibility = 'visible'
           AND parent_session_id IS NULL
           AND session_kind = 'conversation'
           AND updated_at_ms >= ?1
         ORDER BY updated_at_ms DESC
         LIMIT 40",
    ) else {
        return Vec::new();
    };
    let rows = statement
        .query_map([now_ms - LOOKBACK_MS], |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                cwd: row.get(3)?,
                updated: row.get(4)?,
                history: row.get(5)?,
            })
        })
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default();
    rows
}

/// 只把真正在跑、刚出错或刚结束的会话交给宿主；历史会话不重复冒充「刚完成」。
fn live_status(status: &str, updated: i64, now_ms: i64) -> Option<&'static str> {
    match status {
        "started" => Some("running"),
        "error" => Some("waiting"),
        "idle" | "aborted" if now_ms - updated <= COMPLETED_WINDOW_MS => Some("completed"),
        _ => None,
    }
}

fn read_tail(path: &Path, bytes: u64) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(bytes))).ok()?;
    let mut buffer = Vec::new();
    file.take(bytes).read_to_end(&mut buffer).ok()?;
    Some(String::from_utf8_lossy(&buffer).into_owned())
}

/// 最近一次 `todowrite` 留下的任务清单：已完成数 / 总数。
fn todo_progress(history: &str) -> Option<(usize, usize)> {
    todo_progress_in(&home()?.join(".minimax/v2/sessions"), history)
}

fn todo_progress_in(root: &Path, history: &str) -> Option<(usize, usize)> {
    let text = read_tail(&root.join(history).join("messages.jsonl"), TAIL_BYTES)?;
    for line in text.lines().rev() {
        if !line.contains("\"todowrite\"") {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else { continue };
        let Some(blocks) = value["message"]["content"].as_array() else { continue };
        let todos = blocks
            .iter()
            .find_map(|block| block["arguments"]["todos"].as_array());
        let Some(todos) = todos.filter(|todos| !todos.is_empty()) else { continue };
        let done = todos.iter().filter(|todo| todo["status"].as_str() == Some("completed")).count();
        return Some((done, todos.len()));
    }
    None
}

/// 用户自己配置的 PermissionRequest Hook 写下的待审批标记。
fn approval_marks() -> Vec<Value> {
    let Some(dir) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) else {
        return Vec::new();
    };
    let Ok(root) = read_json(&dir.join("fly-island-minimax").join("approvals.json"), 64 * 1024) else {
        return Vec::new();
    };
    root["approvals"].as_array().cloned().unwrap_or_default()
}

fn poll(settings: &Value) -> Result<Value, String> {
    let now_ms = now();
    let quotas: Vec<Value> = fetch_quota(settings).into_iter().collect();
    let marks = approval_marks();
    let mut sessions = Vec::new();
    let mut notifications = Vec::new();
    for row in recent_sessions(now_ms).into_iter() {
        let Some(live) = live_status(&row.status, row.updated, now_ms) else { continue };
        if sessions.len() >= MAX_SESSIONS {
            break;
        }
        let mark = marks.iter().find(|mark| mark["sessionId"].as_str() == Some(row.id.as_str()));
        let tool = mark.and_then(|mark| mark["tool"].as_str());
        // 在等审批的会话先别报「运行中」，否则岛上看着像它自己在干活。
        let live = if tool.is_some() && live == "running" { "waiting" } else { live };
        let progress = match live {
            "completed" => None,
            _ => row.history.as_deref().and_then(todo_progress),
        };
        let mut title = row.title.clone();
        if let Some((done, total)) = progress {
            title.push_str(&format!(" · {done}/{total} 项任务"));
        }
        if let Some(tool) = tool {
            title = format!("等待审批 {tool} · {title}");
            let at = mark.and_then(|mark| mark["at"].as_i64()).unwrap_or(row.updated);
            notifications.push(json!({
                "id": format!("approval-{}-{at}", row.id),
                "sourceId": row.id,
                "appName": "MiniMax Code",
                "icon": "plugin",
                "title": clip(&format!("等待审批：{tool}")),
                "body": clip(&row.title),
                "receivedAt": at,
                "action": null
            }));
        }
        sessions.push(json!({
            "id": row.id,
            "title": clip(&title),
            "cwd": row.cwd,
            "status": live,
            "updatedAt": row.updated,
            "action": null
        }));
    }
    Ok(json!({ "quota": quotas, "sessions": sessions, "notifications": notifications }))
}

fn main() {
    let result = run(
        Duration::from_secs(60),
        poll,
        |id, _| match id {
            "refresh" => Ok(json!(true)),
            _ => Err("Unknown action".into()),
        },
    );
    if result.is_err() {
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_both_plan_windows() {
        let body = json!({
            "model_remains": [
                { "model_name": "video", "current_interval_remaining_percent": 12 },
                {
                    "model_name": "general",
                    "current_interval_remaining_percent": 91,
                    "current_weekly_remaining_percent": 100,
                    "end_time": 1795176000000i64
                }
            ]
        });
        let entry = parse_quota(&body).expect("general row");
        assert_eq!(entry["remainingPercent"], 91.0);
        assert_eq!(entry["secondaryPercent"], 100.0);
        assert_eq!(entry["resetsAt"], 1795176000000i64);
    }

    #[test]
    fn missing_windows_do_not_become_zero() {
        let body = json!({ "model_remains": [{ "model_name": "general", "current_weekly_remaining_percent": 40 }] });
        assert!(parse_quota(&body).is_none());
        assert!(parse_quota(&json!({ "base_resp": { "status_code": 1004 } })).is_none());
    }

    #[test]
    fn only_live_sessions_reach_the_island() {
        let now = 1_800_000_000_000;
        assert_eq!(live_status("started", now - 60_000, now), Some("running"));
        assert_eq!(live_status("error", now - 60_000, now), Some("waiting"));
        assert_eq!(live_status("idle", now - 60_000, now), Some("completed"));
        assert_eq!(live_status("idle", now - COMPLETED_WINDOW_MS - 1, now), None);
        assert_eq!(live_status("aborted", now - 86_400_000, now), None);
    }

    #[test]
    fn newest_todo_list_wins() {
        let root = std::env::temp_dir().join(format!("minimax-plugin-{}", std::process::id()));
        let history = "2026/11/20/03-04-19-352-session_x";
        let dir = root.join(history);
        std::fs::create_dir_all(&dir).unwrap();
        let lines = [
            r#"{"message":{"content":[{"type":"toolCall","name":"todowrite","arguments":{"todos":[{"status":"completed"}]}}]}}"#,
            r#"{"message":{"content":[{"type":"text","text":"done"}]}}"#,
            r#"{"message":{"content":[{"type":"toolCall","name":"todowrite","arguments":{"todos":[{"status":"completed"},{"status":"completed"},{"status":"pending"}]}}]}}"#,
        ];
        std::fs::write(dir.join("messages.jsonl"), lines.join("\n")).unwrap();
        assert_eq!(todo_progress_in(&root, history), Some((2, 3)));
        assert_eq!(todo_progress_in(&root, "2026/11/20/absent"), None);
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn long_titles_are_clipped_on_a_char_boundary() {
        let title = "任务".repeat(2000);
        let clipped = clip(&title);
        assert!(clipped.len() <= TEXT_LIMIT);
        assert!(title.starts_with(&clipped));
    }
}
