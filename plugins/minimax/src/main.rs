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
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible, SetForegroundWindow,
    ShowWindow, SW_RESTORE,
};

/// 一次最多发布多少条会话：能看清同时在跑的几件事，又不挤满列表。
const MAX_SESSIONS: usize = 12;
/// 只往回查一天；更早的会话交给宿主的时间窗口处理。
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

/// 宿主按真实 updatedAt 和设置里的时间窗口决定显示多久，插件只负责如实翻译状态。
fn live_status(status: &str) -> Option<&'static str> {
    match status {
        "started" => Some("running"),
        "error" => Some("waiting"),
        "idle" | "aborted" => Some("completed"),
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
        let Some(live) = live_status(&row.status) else { continue };
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
            "action": "open"
        }));
    }
    Ok(json!({ "quota": quotas, "sessions": sessions, "notifications": notifications }))
}

fn main() {
    let result = run(
        Duration::from_secs(60),
        poll,
        |id, _| match id {
            // 点会话时把 MiniMax Code 切到前台：宿主只传动作 id，播件只管把窗口叫出来。
            "open" if focus_window() => Ok(json!(true)),
            "open" => Err("MiniMax Code 窗口没有打开".to_owned()),
            "install-hooks" => install_hooks().map(|()| json!(true)),
            "remove-hooks" => remove_hooks().map(|()| json!(true)),
            _ => Err("Unknown action".into()),
        },
    );
    if result.is_err() {
        std::process::exit(1);
    }
}


/// MiniMax Code 的主窗口：标题里带应用名；最小化的先恢复，再提到前台。
fn focus_window() -> bool {
    let mut found = false;
    let _ = unsafe { EnumWindows(Some(visit_window), LPARAM(&mut found as *mut bool as isize)) };
    found
}

unsafe extern "system" fn visit_window(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let found = &mut *(lparam.0 as *mut bool);
    if !IsWindowVisible(hwnd).as_bool() {
        return true.into();
    }
    let length = GetWindowTextLengthW(hwnd);
    if length <= 0 {
        return true.into();
    }
    let mut buffer = vec![0u16; length as usize + 1];
    let written = GetWindowTextW(hwnd, &mut buffer);
    if written <= 0 {
        return true.into();
    }
    if !String::from_utf16_lossy(&buffer[..written as usize]).contains("MiniMax Code") {
        return true.into();
    }
    let _ = ShowWindow(hwnd, SW_RESTORE);
    let _ = SetForegroundWindow(hwnd);
    *found = true;
    false.into()
}

/// 我们写进 hooks.json 的名字都带这个前缀，移除时只认它们。
const HOOK_PREFIX: &str = "小岛 · ";
const RECORD_HOOK: &str = "小岛 · 记录等待审批";
const CLEAR_HOOK: &str = "小岛 · 清掉审批标记";
/// 标记脚本编译进 exe：插件包装好就自带，不用额外分发文件。
const MARKER_SCRIPT: &str = include_str!("../hooks/approval-marker.ps1");

fn minimax_dir() -> Option<PathBuf> {
    home().map(|dir| dir.join(".minimax"))
}

fn marker_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|dir| dir.join("fly-island-minimax"))
}

/// 把标记脚本写到本地目录；PowerShell 5.1 需要 BOM 才按 UTF-8 读中文注释。
fn install_marker_script(dir: &Path) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|error| format!("创建目录失败：{error}"))?;
    let path = dir.join("approval-marker.ps1");
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(MARKER_SCRIPT.trim_start_matches('\u{feff}').as_bytes());
    std::fs::write(&path, bytes).map_err(|error| format!("写入脚本失败：{error}"))?;
    Ok(path)
}

fn write_hooks(path: &Path, root: &Value) -> Result<(), String> {
    let body = serde_json::to_vec_pretty(root).map_err(|error| format!("序列化失败：{error}"))?;
    std::fs::write(path, body).map_err(|error| format!("写入 hooks.json 失败：{error}"))
}

fn install_hooks() -> Result<(), String> {
    let dir = marker_dir().ok_or("找不到本地应用数据目录")?;
    let script = install_marker_script(&dir)?;
    let marker = dir.join("approvals.json");
    let hooks = minimax_dir()
        .ok_or("找不到 MiniMax Code 配置目录")?
        .join("hooks.json");
    let mut root = if hooks.exists() {
        read_json(&hooks, 256 * 1024)?
    } else {
        json!({ "enabled": true, "hooks": {} })
    };
    if !root.is_object() {
        return Err("hooks.json 不是 JSON 对象".to_owned());
    }
    root["enabled"] = json!(true);
    merge_hooks(&mut root, &script, &marker);
    write_hooks(&hooks, &root)
}

fn remove_hooks() -> Result<(), String> {
    let Some(hooks) = minimax_dir().map(|dir| dir.join("hooks.json")) else {
        return Ok(());
    };
    if !hooks.exists() {
        return Ok(());
    }
    let mut root = read_json(&hooks, 256 * 1024)?;
    drop_hooks(&mut root);
    write_hooks(&hooks, &root)
}

/// 只加我们自己的两组：审批时记一笔，工具跑完或一轮结束时清掉。
fn merge_hooks(root: &mut Value, script: &Path, marker: &Path) {
    let script = script.display();
    let marker = marker.display();
    set_handler(
        root,
        "PermissionRequest",
        json!({
            "type": "command",
            "name": RECORD_HOOK,
            "command": format!("powershell -NoProfile -ExecutionPolicy Bypass -File \"{script}\""),
            "commandWindows": format!("powershell -NoProfile -ExecutionPolicy Bypass -File \"{script}\""),
            "timeout": 5
        }),
    );
    let clear = json!({
        "type": "command",
        "name": CLEAR_HOOK,
        "command": format!("cmd /c if exist \"{marker}\" del /q \"{marker}\""),
        "commandWindows": format!("cmd /c if exist \"{marker}\" del /q \"{marker}\""),
        "timeout": 3
    });
    for event in ["PostToolUse", "Stop", "UserPromptSubmit"] {
        set_handler(root, event, clear.clone());
    }
}

/// 同名就替换、否则新起一组；用户自己的其它钩子原样保留。
fn set_handler(root: &mut Value, event: &str, handler: Value) {
    if !root["hooks"].is_object() {
        root["hooks"] = json!({});
    }
    if !root["hooks"][event].is_array() {
        root["hooks"][event] = json!([]);
    }
    let Some(groups) = root["hooks"][event].as_array_mut() else {
        return;
    };
    for group in groups.iter_mut() {
        let Some(handlers) = group["hooks"].as_array_mut() else {
            continue;
        };
        if let Some(slot) = handlers.iter_mut().find(|item| item["name"] == handler["name"]) {
            *slot = handler.clone();
            return;
        }
    }
    groups.push(json!({ "hooks": [handler] }));
}

/// 只摘掉带我们前缀的处理器，空掉的组和事件一并清走。
fn drop_hooks(root: &mut Value) {
    if !root["hooks"].is_object() {
        return;
    }
    let events: Vec<String> = root["hooks"]
        .as_object()
        .map(|hooks| hooks.keys().cloned().collect())
        .unwrap_or_default();
    for event in events {
        let empty = {
            let Some(groups) = root["hooks"][&event].as_array_mut() else {
                continue;
            };
            groups.retain_mut(|group| {
                let Some(handlers) = group["hooks"].as_array_mut() else {
                    return true;
                };
                handlers.retain(|item| {
                    item["name"].as_str().is_none_or(|name| !name.starts_with(HOOK_PREFIX))
                });
                !handlers.is_empty()
            });
            groups.is_empty()
        };
        if empty {
            if let Some(hooks) = root["hooks"].as_object_mut() {
                hooks.remove(&event);
            }
        }
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
    fn live_status_is_honest_and_leaves_aging_to_the_host() {
        assert_eq!(live_status("started"), Some("running"));
        assert_eq!(live_status("error"), Some("waiting"));
        assert_eq!(live_status("idle"), Some("completed"));
        assert_eq!(live_status("aborted"), Some("completed"));
        assert_eq!(live_status("weird"), None);
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

    fn ours(root: &Value, event: &str) -> usize {
        root["hooks"][event]
            .as_array()
            .map(|groups| {
                groups.iter()
                    .flat_map(|group| group["hooks"].as_array().into_iter().flatten())
                    .filter(|item| item["name"].as_str().unwrap_or_default().starts_with(HOOK_PREFIX))
                    .count()
            })
            .unwrap_or(0)
    }

    fn user_hook_present(root: &Value, event: &str, name: &str) -> bool {
        root["hooks"][event]
            .as_array()
            .is_some_and(|groups| groups.iter().any(|group| {
                group["hooks"].as_array().is_some_and(|handlers| handlers.iter().any(|item| item["name"] == name))
            }))
    }

    #[test]
    fn hook_install_adds_once_and_keeps_the_users_own_hooks() {
        let mut root = json!({
            "enabled": true,
            "hooks": {
                "PermissionRequest": [{ "hooks": [{ "type": "command", "name": "用户的钩子", "command": "echo hi" }] }],
                "Stop": [{ "hooks": [{ "type": "command", "name": "用户的停止钩子", "command": "echo bye" }] }]
            }
        });
        let script = Path::new("C:/x/approval-marker.ps1");
        let marker = Path::new("C:/x/approvals.json");
        merge_hooks(&mut root, script, marker);
        merge_hooks(&mut root, script, marker);
        for event in ["PermissionRequest", "PostToolUse", "Stop", "UserPromptSubmit"] {
            assert_eq!(ours(&root, event), 1, "{event}");
        }
        assert!(user_hook_present(&root, "PermissionRequest", "用户的钩子"));
        assert!(user_hook_present(&root, "Stop", "用户的停止钩子"));
        assert_eq!(root["enabled"], true);
    }

    #[test]
    fn hook_removal_leaves_the_users_own_hooks_alone() {
        let mut root = json!({
            "enabled": true,
            "hooks": {
                "PermissionRequest": [{ "hooks": [{ "type": "command", "name": "用户的钩子", "command": "echo hi" }] }],
                "Stop": [{ "hooks": [{ "type": "command", "name": "用户的停止钩子", "command": "echo bye" }] }]
            }
        });
        merge_hooks(&mut root, Path::new("C:/x/a.ps1"), Path::new("C:/x/b.json"));
        drop_hooks(&mut root);
        for event in ["PermissionRequest", "PostToolUse", "Stop", "UserPromptSubmit"] {
            assert_eq!(ours(&root, event), 0, "{event}");
        }
        assert!(user_hook_present(&root, "PermissionRequest", "用户的钩子"));
        assert!(user_hook_present(&root, "Stop", "用户的停止钩子"));
        assert!(root["hooks"].get("PostToolUse").is_none(), "只属于我们的事件整条清掉");
    }

    #[test]
    fn long_titles_are_clipped_on_a_char_boundary() {
        let title = "任务".repeat(2000);
        let clipped = clip(&title);
        assert!(clipped.len() <= TEXT_LIMIT);
        assert!(title.starts_with(&clipped));
    }
}
