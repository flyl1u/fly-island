//! MiniMax Code quota, local sessions and opt-in approval notifications.

mod hooks;
#[path = "win32/window.rs"]
mod window;

use fly_island_plugin_sdk::{json, now, quota, read_json, run, Value};
use rusqlite::{Connection, OpenFlags};
use std::{
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
    time::{Duration, Instant},
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
    let text = text.replace('\0', "");
    let mut end = text.len().min(TEXT_LIMIT);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_owned()
}

/// Token Plan 的地址与凭据：插件里填的密钥优先，否则用 `mmx` 登录时存下的那一份。
fn plan_endpoint(settings: &Value) -> Option<(String, &'static str)> {
    let config = home()
        .map(|dir| dir.join(".mmx").join("config.json"))
        .and_then(|path| read_json(&path, 64 * 1024).ok());
    let base = match settings["region"].as_str() {
        Some("global") => "https://api.minimax.io",
        Some("china") => "https://api.minimaxi.com",
        _ => plan_base(config.as_ref().unwrap_or(&Value::Null)),
    };
    let token = settings["api_key"]
        .as_str()
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            config
                .as_ref()
                .and_then(|config| config["api_key"].as_str())
                .map(str::to_owned)
        })
        .or_else(|| {
            config
                .as_ref()
                .and_then(|config| config["oauth"]["access_token"].as_str())
                .map(str::to_owned)
        })?;
    let token = token.trim();
    (!token.is_empty() && token.len() <= 4096 && token.bytes().all(|byte| byte.is_ascii_graphic()))
        .then(|| (token.to_owned(), base))
}

fn plan_base(config: &Value) -> &'static str {
    let official = [
        "https://api.minimax.io",
        "https://api.minimaxi.com",
        "https://www.minimax.io",
        "https://www.minimaxi.com",
    ];
    let configured = config["oauth"]["resource_url"]
        .as_str()
        .map(|url| url.trim_end_matches('/'));
    official
        .into_iter()
        .find(|host| Some(*host) == configured)
        .unwrap_or(if config["region"] == "global" {
            "https://api.minimax.io"
        } else {
            "https://api.minimaxi.com"
        })
}

/// 5 小时窗口是外环，周窗口是内环；两个窗口各自刷新，所以分开发。
fn parse_quota(body: &Value) -> Option<Value> {
    if body["base_resp"]["status_code"]
        .as_i64()
        .is_some_and(|code| code != 0)
    {
        return None;
    }
    let rows = body["model_remains"].as_array()?;
    let row = rows
        .iter()
        .find(|row| row["model_name"].as_str() == Some("general"))
        .or_else(|| rows.first())?;
    let interval = row["current_interval_remaining_percent"].as_f64()?;
    let weekly = row["current_weekly_remaining_percent"]
        .as_f64()
        .map(|percent| percent.clamp(0., 100.));
    let mut entry = quota(
        "token-plan",
        "Token Plan",
        Some(interval),
        None,
        row["end_time"].as_i64(),
    );
    entry["secondaryPercent"] = json!(weekly);
    Some(entry)
}

fn fetch_quota(settings: &Value) -> Option<Value> {
    let (token, base) = plan_endpoint(settings)?;
    const LIMIT: u64 = 128 * 1024;
    let client = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout(Duration::from_secs(5))
        .build();
    let response = client
        .get(&format!("{base}/v1/token_plan/remains"))
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/json")
        .call()
        .ok()?;
    let mut body = Vec::new();
    response
        .into_reader()
        .take(LIMIT + 1)
        .read_to_end(&mut body)
        .ok()?;
    if body.len() as u64 > LIMIT {
        return None;
    }
    parse_quota(&serde_json::from_slice(&body).ok()?)
}

#[derive(Default)]
struct Plan {
    checked: Option<Instant>,
    last_success: Option<(Instant, Value)>,
}

impl Plan {
    fn quota(&mut self, settings: &Value) -> Option<Value> {
        if self
            .checked
            .is_none_or(|time| time.elapsed() >= Duration::from_secs(60))
        {
            self.checked = Some(Instant::now());
            if let Some(value) = fetch_quota(settings) {
                self.last_success = Some((Instant::now(), value));
            }
        }
        self.last_success
            .as_ref()
            .filter(|(time, _)| time.elapsed() <= Duration::from_secs(300))
            .map(|(_, value)| value.clone())
    }
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
    if db.busy_timeout(Duration::ZERO).is_err() {
        return Vec::new();
    }
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
                title: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
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
    let relative = Path::new(history);
    if !relative
        .components()
        .all(|part| matches!(part, Component::Normal(_)))
    {
        return None;
    }
    let root = root.canonicalize().ok()?;
    let history = root
        .join(relative)
        .join("messages.jsonl")
        .canonicalize()
        .ok()?;
    if !history.starts_with(&root) {
        return None;
    }
    let text = read_tail(&history, TAIL_BYTES)?;
    for line in text.lines().rev() {
        if !line.contains("\"todowrite\"") {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let Some(blocks) = value["message"]["content"].as_array() else {
            continue;
        };
        let todos = blocks.iter().find_map(|block| {
            (block["name"] == "todowrite")
                .then(|| block["arguments"]["todos"].as_array())
                .flatten()
        });
        let Some(todos) = todos.filter(|todos| !todos.is_empty()) else {
            continue;
        };
        let done = todos
            .iter()
            .filter(|todo| todo["status"].as_str() == Some("completed"))
            .count();
        return Some((done, todos.len()));
    }
    None
}

fn poll(settings: &Value, plan: &mut Plan) -> Result<Value, String> {
    let now_ms = now();
    let quotas: Vec<Value> = plan.quota(settings).into_iter().collect();
    let marks = hooks::approval_marks();
    let english = settings["language"] == "en";
    let mut sessions = Vec::new();
    let mut notifications = Vec::new();
    for row in recent_sessions(now_ms).into_iter() {
        let Some(live) = live_status(&row.status) else {
            continue;
        };
        if sessions.len() >= MAX_SESSIONS {
            break;
        }
        if row.id.trim().is_empty() || row.id.len() > 512 || row.id.contains('\0') {
            continue;
        }
        let mark = if live == "completed" {
            None
        } else {
            marks
                .iter()
                .filter(|mark| {
                    mark.session_id == row.id
                        && (0..=30 * 60 * 1000).contains(&now_ms.saturating_sub(mark.at))
                })
                .max_by_key(|mark| mark.at)
        };
        let live = if mark.is_some() { "waiting" } else { live };
        let progress = match live {
            "completed" => None,
            _ => row.history.as_deref().and_then(todo_progress),
        };
        let mut title = if row.title.trim().is_empty() {
            "MiniMax Code".to_owned()
        } else {
            row.title
        };
        if let Some((done, total)) = progress {
            let suffix = if english {
                format!("{done}/{total} tasks")
            } else {
                format!("{done}/{total} 项任务")
            };
            title.push_str(&format!(" · {suffix}"));
        }
        if let Some(mark) = mark {
            let prompt = if english {
                "Approval pending"
            } else {
                "等待审批"
            };
            let label = format!("{prompt}: {}", mark.tool);
            notifications.push(json!({
                "id": format!("approval-{}-{}", row.id, mark.at),
                "sourceId": row.id,
                "appName": "MiniMax Code",
                "icon": "plugin",
                "title": clip(&label),
                "body": clip(&title),
                "receivedAt": mark.at,
                "action": "open"
            }));
            title = format!("{label} · {title}");
        }
        sessions.push(json!({
            "id": row.id,
            "title": clip(&title),
            "cwd": row.cwd.as_deref().map(clip),
            "status": live,
            "updatedAt": row.updated,
            "action": "open"
        }));
    }
    Ok(json!({ "quota": quotas, "sessions": sessions, "notifications": notifications }))
}

fn main() {
    let mut plan = Plan::default();
    let result = if std::env::args().nth(1).as_deref() == Some("--disconnect-approvals") {
        hooks::remove()
    } else {
        run(
            Duration::from_secs(60),
            |settings| poll(settings, &mut plan),
            |id, _| match id {
                "open" if window::focus() => Ok(json!(true)),
                "open" => Err("MiniMax Code window could not be activated".into()),
                "install-hooks" => hooks::install().map(|()| json!(true)),
                "remove-hooks" => hooks::remove().map(|()| json!(true)),
                _ => Err("Unknown action".into()),
            },
        )
    };
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
    fn live_status_is_honest_and_leaves_aging_to_the_host() {
        assert_eq!(live_status("started"), Some("running"));
        assert_eq!(live_status("error"), Some("waiting"));
        assert_eq!(live_status("idle"), Some("completed"));
        assert_eq!(live_status("aborted"), Some("completed"));
        assert_eq!(live_status("weird"), None);
    }

    #[test]
    fn newest_todo_list_wins() {
        let fixture = tempfile::tempdir().unwrap();
        let root = fixture.path();
        let history = "2026/11/20/03-04-19-352-session_x";
        let dir = root.join(history);
        std::fs::create_dir_all(&dir).unwrap();
        let lines = [
            r#"{"message":{"content":[{"type":"toolCall","name":"todowrite","arguments":{"todos":[{"status":"completed"}]}}]}}"#,
            r#"{"message":{"content":[{"type":"text","text":"done"}]}}"#,
            r#"{"message":{"content":[{"type":"toolCall","name":"todowrite","arguments":{"todos":[{"status":"completed"},{"status":"completed"},{"status":"pending"}]}}]}}"#,
        ];
        std::fs::write(dir.join("messages.jsonl"), lines.join("\n")).unwrap();
        assert_eq!(todo_progress_in(root, history), Some((2, 3)));
        assert_eq!(todo_progress_in(root, "2026/11/20/absent"), None);
        assert_eq!(todo_progress_in(root, "../elsewhere"), None);
    }

    #[test]
    fn credentials_stay_on_official_origins() {
        assert_eq!(
            plan_base(
                &json!({"oauth":{"resource_url":"https://example.invalid"},"region":"global"})
            ),
            "https://api.minimax.io"
        );
        assert_eq!(
            plan_base(&json!({"oauth":{"resource_url":"https://api.minimaxi.com/"}})),
            "https://api.minimaxi.com"
        );
    }

    #[test]
    fn long_titles_are_clipped_on_a_char_boundary() {
        let title = "任务".repeat(2000);
        let clipped = clip(&title);
        assert!(clipped.len() <= TEXT_LIMIT);
        assert!(title.starts_with(&clipped));
    }
}
