//! Google Antigravity's model quotas and local conversations. Its language
//! server publishes the loopback port and CSRF token it listens on (`daemon/hub_<port>.json`), which
//! answers a read-only `GetUserStatus` with the quota of each model; `conversation_summaries.db`
//! lists the conversations with their run status. Their transcript adds the latest turn details.

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

use reqwest::{header, redirect::Policy, StatusCode};
use rusqlite::{params, Connection};
use serde_json::Value;

use super::{
    antigravity_transcript::{self, Transcript},
    markers::AGENT_RUNNING_STALE_AFTER_MS,
    session_host::SessionHost,
    sessions::{parse_timestamp_ms, AgentSessionSummary},
    snapshot::current_unix_millis,
    sqlite_read,
    title::shorten,
    usage::{AgentUsage, UsageSource, UsageWindow},
    window_focus,
};

/// The provider name the island uses for these sessions.
const PROVIDER: &str = "antigravity";
/// The IDE's executable, as `window_focus::app_name` spells it.
pub(super) const DESKTOP_APP: &str = PROVIDER;
/// The IDE's folder under the home directory, and the CLI's, which keeps the same summaries.
const APP_FOLDER: &str = ".gemini/antigravity";
const CLI_FOLDER: &str = ".gemini/antigravity-cli";
const IDE_FOLDER: &str = ".gemini/antigravity-ide";
const APP_FOLDERS: [&str; 3] = [APP_FOLDER, IDE_FOLDER, CLI_FOLDER];
const HUB_FOLDER: &str = "daemon";
const SUMMARIES_FILE: &str = "conversation_summaries.db";
/// The language server answers `GetUserStatus` with about 55 KB; far more is not that answer.
const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;
/// Conversations read from the summaries table before the ones outside the window are dropped.
const MAX_ROWS: usize = 64;
const MAX_SESSIONS: usize = 12;
/// A closed IDE leaves its hub files behind, one per start; only the newest few are worth a try.
const MAX_HUBS: usize = 6;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(4);
/// The answer is kept this long: the Agent page asks every 30 seconds, and opening a connection to
/// an app that is not running fails at once, so the cache keeps the log quiet rather than fast.
const KEEP_FOR: Duration = Duration::from_secs(60);
static LAST: Mutex<Option<(Instant, Option<AgentUsage>)>> = Mutex::new(None);

/// What the language server asked the IDE's model list at startup.
const STATUS_PATH: &str = "/exa.language_server_pb.LanguageServerService/GetUserStatus";
const CSRF_HEADER: &str = "X-Codeium-Csrf-Token";

/// Where the running language server listens, from `daemon/hub_<port>.json`.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Hub {
    port: u16,
    token: String,
    /// The language server's version, which it expects back in the request's metadata.
    version: String,
}

fn parse_hub(text: &str) -> Option<Hub> {
    let text = text.trim_start_matches('\u{feff}');
    let value: Value = serde_json::from_str(text).ok()?;
    let port = value["httpPort"].as_u64().filter(|port| (1..=65_535).contains(port))? as u16;
    let token = value["csrfToken"].as_str()?.trim().to_string();
    let version = value["lsVersion"].as_str().unwrap_or_default().trim().to_string();
    (!token.is_empty()).then_some(Hub { port, token, version })
}

/// The request body, shaped as the IDE's own UI sends it.
fn status_body(version: &str) -> String {
    serde_json::json!({
        "metadata": {
            "api_key": "",
            "ide_name": "antigravity",
            "ide_version": version,
            "extension_version": "",
            "session_id": "fly-island",
            "request_id": "1"
        }
    })
    .to_string()
}

/// The hub files worth trying, newest first: the running server wrote the newest one.
fn hubs(app_dir: &Path) -> Vec<Hub> {
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(app_dir.join(HUB_FOLDER))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            name.starts_with("hub_") && name.ends_with(".json")
        })
        .filter_map(|entry| Some((entry.metadata().ok()?.modified().ok()?, entry.path())))
        .collect();
    files.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    files
        .into_iter()
        .take(MAX_HUBS)
        .filter_map(|(_, path)| parse_hub(&fs::read_to_string(path).ok()?))
        .collect()
}

fn text(value: &Value, maximum: usize) -> Option<String> {
    value.as_str().map(str::trim).filter(|text| !text.is_empty()).and_then(|text| shorten(text, maximum))
}

/// Two models on one tier report one and the same quota: the card lists it once.
fn same_quota(a: &UsageWindow, b: &UsageWindow) -> bool {
    (a.used - b.used).abs() < 0.05 && a.resets_at == b.resets_at
}

/// `userStatus`: the plan, then each model with the share of its quota left and when that resets.
/// The tightest model comes first, as the rings show it.
fn parse_status(value: &Value, now: i64) -> Option<AgentUsage> {
    let status = &value["userStatus"];
    let plan = status["planStatus"]["planInfo"]["planName"]
        .as_str()
        .map(str::trim)
        .filter(|plan| !plan.is_empty())
        .map(str::to_string);
    let mut models: Vec<UsageWindow> = Vec::new();
    for config in status["cascadeModelConfigData"]["clientModelConfigs"].as_array().into_iter().flatten() {
        let Some(left) = config["quotaInfo"]["remainingFraction"].as_f64().filter(|left| left.is_finite()) else { continue };
        let Some(name) = text(&config["label"], 60).or_else(|| text(&config["modelId"], 60)) else { continue };
        let window = UsageWindow {
            name,
            used: ((1.0 - left.clamp(0.0, 1.0)) * 100.0).clamp(0.0, 100.0),
            resets_at: config["quotaInfo"]["resetTime"].as_str().and_then(parse_timestamp_ms),
        };
        if !models.iter().any(|known| same_quota(known, &window)) {
            models.push(window);
        }
    }
    if models.is_empty() {
        return None;
    }
    models.sort_by(|a, b| b.used.total_cmp(&a.used));
    Some(AgentUsage { updated_at: Some(now), five_hour: None, seven_day: None, models, plan, source: UsageSource::Antigravity })
}

async fn fetch_status(hub: &Hub) -> Option<AgentUsage> {
    let Ok(token) = header::HeaderValue::from_str(&hub.token) else { return None };
    let client = reqwest::Client::builder().connect_timeout(REQUEST_TIMEOUT).timeout(REQUEST_TIMEOUT).redirect(Policy::none()).build().ok()?;
    let url = format!("http://127.0.0.1:{}{}", hub.port, STATUS_PATH);
    let response = client
        .post(&url)
        .header(CSRF_HEADER, token)
        .header(header::CONTENT_TYPE, "application/json")
        .body(status_body(&hub.version))
        .send()
        .await
        .ok()?;
    if response.status() != StatusCode::OK {
        return None;
    }
    if response.content_length().is_some_and(|length| length > MAX_RESPONSE_BYTES) {
        return None;
    }
    let bytes = response.bytes().await.ok()?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return None;
    }
    let value: Value = serde_json::from_slice(&bytes).ok()?;
    parse_status(&value, current_unix_millis())
}

/// The newest hub that answers; `None` when the IDE is closed or none of them knows its quota.
async fn read_quota(app_dir: &Path) -> Option<AgentUsage> {
    for hub in hubs(app_dir) {
        if let Some(usage) = fetch_status(&hub).await {
            return Some(usage);
        }
    }
    None
}

/// Antigravity's model quotas; `None` when it is not installed, is not running and has not run yet,
/// or reports no quota. What it last said stays shown after it quits, until that quota resets.
#[tauri::command]
pub async fn get_antigravity_usage() -> Result<Option<AgentUsage>, String> {
    let Some(app_dir) = crate::system::windows_home_dir().ok().map(|home| home.join(APP_FOLDER)) else { return Ok(None) };
    if !app_dir.is_dir() {
        return Ok(None);
    }
    let kept = LAST.lock().ok().and_then(|last| last.as_ref().filter(|(at, _)| at.elapsed() < KEEP_FOR).map(|(_, usage)| usage.clone()));
    if let Some(usage) = kept {
        return Ok(usage);
    }
    let fresh = read_quota(&app_dir).await;
    let known = LAST.lock().ok().and_then(|last| last.as_ref().and_then(|(_, usage)| usage.clone()));
    let answer = fresh.or(known);
    if let Ok(mut last) = LAST.lock() {
        *last = Some((Instant::now(), answer.clone()));
    }
    Ok(answer)
}

/// The run state of a conversation: the IDE says so itself and keeps writing while it works.
fn phase(status: &str, quiet_for: i64) -> &'static str {
    let status = status.to_ascii_uppercase();
    if status.contains("WAITING") || status.contains("PERMISSION") || status.contains("USER_INPUT") {
        "waiting"
    } else if status.contains("RUNNING") || status.contains("IN_PROGRESS") || status.contains("BUSY") || status.ends_with("_CANCELING") {
        if quiet_for > AGENT_RUNNING_STALE_AFTER_MS { "stale" } else { "running" }
    } else {
        "completed"
    }
}

/// `file:///c%3A/Work/app` → `c:\Work\app`. Remote workspaces and other schemes have no folder.
fn folder_of_uri(uri: &str) -> Option<String> {
    let path = uri.trim().strip_prefix("file:///")?;
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        let hex = |at: usize| bytes.get(at).and_then(|byte| (*byte as char).to_digit(16));
        match (bytes[index], hex(index + 1), hex(index + 2)) {
            (b'%', Some(high), Some(low)) => {
                decoded.push((high * 16 + low) as u8);
                index += 3;
            }
            (byte, _, _) => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    let path = String::from_utf8(decoded).ok()?.replace('/', "\\");
    if matches!(path.as_bytes(), [b'a'..=b'z' | b'A'..=b'Z', b':', ..]) {
        return Some(path[..1].to_ascii_uppercase() + &path[1..]);
    }
    Some(format!("\\{path}"))
}

/// The first local folder a conversation works in; `workspace_uris` is a JSON array of them.
fn workspace_folder(uris: &str) -> Option<String> {
    serde_json::from_str::<Value>(uris)
        .ok()?
        .as_array()?
        .iter()
        .filter_map(|uri| uri.as_str())
        .find_map(folder_of_uri)
}

/// One row of `conversation_summaries`, as the reader needs it.
#[derive(Debug, PartialEq)]
struct Row {
    id: String,
    title: Option<String>,
    modified_at: i64,
    status: String,
    prompt_at: Option<i64>,
    prompt_step: Option<u64>,
    cwd: Option<String>,
}

fn summaries(db: &Connection) -> Vec<Row> {
    let query = |prompt_step: &str| format!(
        "SELECT conversation_id, title, last_modified_time, workspace_uris, status, last_user_input_time, \
         {prompt_step} FROM conversation_summaries \
         WHERE COALESCE(nesting_depth, 0) <= 0 AND COALESCE(parent_conversation_id, '') = '' \
         ORDER BY last_modified_time DESC LIMIT ?1"
    );
    let Ok(mut statement) = db.prepare(&query("last_user_input_step_index")).or_else(|_| db.prepare(&query("NULL"))) else {
        return Vec::new();
    };
    let rows = statement.query_map(params![MAX_ROWS as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<i64>>(6)?,
        ))
    });
    rows.map(|rows| {
        rows.flatten()
            .filter_map(|(id, title, modified, uris, status, prompt, step)| {
                Some(Row {
                    id: id.trim().to_string(),
                    title: title.as_deref().map(str::trim).filter(|title| !title.is_empty()).and_then(|title| shorten(title, 80)),
                    modified_at: parse_timestamp_ms(modified.as_deref()?)?,
                    status: status.as_deref().unwrap_or("").to_string(),
                    prompt_at: prompt.as_deref().and_then(parse_timestamp_ms).filter(|&time| time > 0),
                    prompt_step: step.and_then(|index| u64::try_from(index).ok()),
                    cwd: uris.as_deref().and_then(workspace_folder),
                })
            })
            .filter(|row| !row.id.is_empty())
            .collect::<Vec<Row>>()
    })
    .unwrap_or_default()
}

fn summary(row: Row, host: SessionHost, turn: Transcript, now: i64) -> AgentSessionSummary {
    let updated_at = row.modified_at;
    let phase = match phase(&row.status, now.saturating_sub(updated_at)) {
        "running" | "stale" if turn.waiting => "waiting",
        "completed" if turn.failed => "failed",
        phase => phase,
    };
    let prompt_at = row.prompt_at.or(turn.prompt_at);
    AgentSessionSummary {
        title: row.title.or_else(|| turn.prompt.clone()).or_else(|| row.cwd.as_deref().and_then(super::title::folder_title)),
        host: Some(host),
        model: turn.model,
        effort: turn.effort,
        last_message: turn.reply,
        reply_asks: turn.reply_asks,
        last_prompt: turn.prompt,
        current_tool: matches!(phase, "running" | "stale" | "waiting").then_some(turn.tool).flatten(),
        context_tokens: turn.context_tokens,
        last_completed_at: turn.finished_at.filter(|&ended| {
            // The transcript drops fractions of a second but the summary retains them.
            phase == "completed" && prompt_at.is_some_and(|prompt| ended / 1000 >= prompt / 1000)
        }),
        turn_started_at: prompt_at,
        owner_prompt_at: prompt_at,
        cwd: row.cwd,
        phase,
        updated_at,
        ..AgentSessionSummary::blank(PROVIDER, row.id)
    }
}

/// Antigravity's conversations that changed within `window_ms`, newest first.
pub(super) fn list_sessions(home: &Path, now: i64, window_ms: i64) -> Vec<AgentSessionSummary> {
    let desktop_exe = window_focus::open_app_exe(DESKTOP_APP);
    let cli_exe = cli_executable(home).map(|path| path.to_string_lossy().into_owned());
    let mut rows = APP_FOLDERS
        .into_iter()
        .filter_map(|folder| sqlite_read::open(&home.join(folder).join(SUMMARIES_FILE)).map(|db| (db, folder)))
        .flat_map(|(db, folder)| summaries(&db).into_iter().map(move |row| (row, folder)))
        .filter(|(row, _)| now.saturating_sub(row.modified_at) <= window_ms)
        .collect::<Vec<_>>();
    rows.sort_by_key(|(row, _)| std::cmp::Reverse(row.modified_at));
    let mut seen = HashSet::new();
    rows.into_iter()
        .filter(|(row, _)| seen.insert(row.id.clone()))
        .take(MAX_SESSIONS)
        .map(|(row, folder)| {
            let host = if folder == CLI_FOLDER {
                SessionHost { name: "Antigravity CLI".to_string(), exe: cli_exe.clone(), kind: "terminal" }
            } else {
                SessionHost { name: "Antigravity".to_string(), exe: desktop_exe.clone(), kind: "editor" }
            };
            let turn = antigravity_transcript::read(&home.join(folder), &row.id, row.prompt_step);
            summary(row, host, turn, now)
        })
        .collect()
}

/// The conversation Antigravity wrote last: with its window in front, that is the one looked at.
pub(super) fn newest_session_id(home: &Path) -> Option<String> {
    let db = sqlite_read::open(&home.join(APP_FOLDER).join(SUMMARIES_FILE))?;
    summaries(&db).into_iter().next().map(|row| row.id)
}

pub(super) fn cli_session(home: &Path, id: &str) -> bool {
    fn last_modified(home: &Path, folder: &str, id: &str) -> Option<i64> {
        let db = sqlite_read::open(&home.join(folder).join(SUMMARIES_FILE))?;
        let value: String = db.query_row(
            "SELECT last_modified_time FROM conversation_summaries WHERE conversation_id = ?1",
            [id],
            |row| row.get(0),
        ).ok()?;
        parse_timestamp_ms(&value)
    }
    let Some(cli) = last_modified(home, CLI_FOLDER, id) else { return false };
    [APP_FOLDER, IDE_FOLDER].into_iter()
        .all(|folder| last_modified(home, folder, id).is_none_or(|desktop| cli > desktop))
}

pub(super) fn cli_executable(home: &Path) -> Option<PathBuf> {
    let path = home.join(".gemini/bin/agy.exe");
    path.is_file().then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_the_hub_file_of_a_running_server() {
        let hub = parse_hub("{\"pid\": 12, \"httpsPort\": 60106, \"httpPort\": 60107, \"lsVersion\": \"2.34.0\", \"csrfToken\": \"t\"}");
        assert_eq!(hub, Some(Hub { port: 60107, token: "t".to_string(), version: "2.34.0".to_string() }));
        assert!(parse_hub("{\"httpPort\": 0, \"csrfToken\": \"t\"}").is_none(), "a port no server can listen on");
        assert!(parse_hub("{\"httpPort\": 60107, \"csrfToken\": \" \"}").is_none(), "a request without a token is refused");
        assert!(parse_hub("not json").is_none());
        assert_eq!(status_body("2.34.0"), r#"{"metadata":{"api_key":"","extension_version":"","ide_name":"antigravity","ide_version":"2.34.0","request_id":"1","session_id":"fly-island"}}"#);
    }

    #[test]
    fn reads_the_quota_of_each_model_once() {
        let answer = json!({"userStatus": {
            "planStatus": {"planInfo": {"planName": "Pro"}},
            "cascadeModelConfigData": {"clientModelConfigs": [
                {"label": "Gemini 4 Neon (High)", "quotaInfo": {"remainingFraction": 0.75, "resetTime": "2030-01-01T00:00:00Z"}},
                {"label": "Gemini 4 Neon (XHigh)", "quotaInfo": {"remainingFraction": 0.75, "resetTime": "2030-01-01T00:00:00Z"}},
                {"label": "Claude Sonnet 4.5", "quotaInfo": {"remainingFraction": 0.25, "resetTime": "2030-01-02T00:00:00Z"}},
                {"label": "Unlimited", "quotaInfo": {}}
            ]}
        }});
        let usage = parse_status(&answer, 7).unwrap();
        assert_eq!(usage.plan.as_deref(), Some("Pro"));
        assert_eq!(usage.source, UsageSource::Antigravity);
        assert_eq!(usage.five_hour, None, "Antigravity has no 5-hour window of its own");
        let names: Vec<&str> = usage.models.iter().map(|model| model.name.as_str()).collect();
        assert_eq!(names, ["Claude Sonnet 4.5", "Gemini 4 Neon (High)"], "one quota listed once, the tightest first");
        assert_eq!(usage.models[0].used, 75.0);
        assert!(usage.models[0].resets_at.is_some());
    }

    #[test]
    fn a_status_without_any_quota_is_nothing_to_show() {
        assert!(parse_status(&json!({"userStatus": {}}), 1).is_none());
        assert!(parse_status(&json!({"userStatus": {"cascadeModelConfigData": {"clientModelConfigs": [
            {"label": "x", "quotaInfo": {"remainingFraction": "a lot"}}]}}}), 1).is_none());
    }

    #[test]
    fn a_conversation_is_working_while_antigravity_says_so() {
        assert_eq!(phase("CASCADE_RUN_STATUS_IDLE", 0), "completed");
        assert_eq!(phase("CASCADE_RUN_STATUS_RUNNING", 0), "running");
        assert_eq!(phase("CASCADE_RUN_STATUS_RUNNING", AGENT_RUNNING_STALE_AFTER_MS + 1), "stale");
        assert_eq!(phase("CASCADE_RUN_STATUS_WAITING_FOR_USER", 0), "waiting");
    }

    #[test]
    fn a_rows_folder_and_phase_become_a_session() {
        let row = Row {
            id: "c1".to_string(),
            title: Some("Fix the tests".to_string()),
            modified_at: 5_000,
            status: "CASCADE_RUN_STATUS_RUNNING".to_string(),
            prompt_at: Some(4_000),
            prompt_step: None,
            cwd: workspace_folder("[\"file:///c%3A/Work/app\"]"),
        };
        let host = SessionHost { name: "Antigravity".to_string(), exe: None, kind: "editor" };
        let session = summary(row, host.clone(), Transcript::default(), 6_000);
        assert_eq!(session.provider, PROVIDER);
        assert_eq!(session.session_id, "c1");
        assert_eq!(session.phase, "running");
        assert_eq!(session.cwd.as_deref(), Some("C:\\Work\\app"));
        assert_eq!((session.turn_started_at, session.owner_prompt_at), (Some(4_000), Some(4_000)));
        assert_eq!(session.host.as_ref().map(|host| host.name.as_str()), Some("Antigravity"));

        let done = summary(
            Row { status: "CASCADE_RUN_STATUS_IDLE".to_string(), title: None, modified_at: 5_000, prompt_at: None, prompt_step: None, cwd: None, id: "c2".to_string() },
            host,
            Transcript::default(),
            9_000,
        );
        assert_eq!(done.phase, "completed");
        assert_eq!(done.title, None);
    }

    #[test]
    fn idle_session_reports_the_latest_turn_completion_even_between_polls() {
        let row = Row {
            id: "c1".to_string(),
            title: None,
            modified_at: 6_000,
            status: "CASCADE_RUN_STATUS_IDLE".to_string(),
            prompt_at: Some(4_200),
            prompt_step: Some(1),
            cwd: None,
        };
        let host = SessionHost { name: "Antigravity".to_string(), exe: None, kind: "editor" };
        let turn = Transcript {
            finished_at: Some(4_000),
            reply: Some("Fixed.".to_string()),
            ..Transcript::default()
        };
        let done = summary(row, host.clone(), turn, 6_000);
        assert_eq!(done.last_completed_at, Some(4_000));
        assert_eq!(done.last_message.as_deref(), Some("Fixed."));

        let row = Row {
            id: done.session_id,
            title: None,
            modified_at: 8_000,
            status: "CASCADE_RUN_STATUS_RUNNING".to_string(),
            prompt_at: Some(7_000),
            prompt_step: Some(3),
            cwd: None,
        };
        let waiting = summary(row, host, Transcript { waiting: true, ..Transcript::default() }, 8_000);
        assert_eq!(waiting.phase, "waiting");
        assert_eq!(waiting.last_completed_at, None);
    }

    #[test]
    fn reads_the_folder_of_a_workspace_uri() {
        assert_eq!(folder_of_uri("file:///d%3A/WeChat%20project/Clean").as_deref(), Some("D:\\WeChat project\\Clean"));
        assert_eq!(folder_of_uri("file:///home/me/app").as_deref(), Some("\\home\\me\\app"));
        assert_eq!(folder_of_uri("vscode-remote://ssh/me/app"), None);
        assert_eq!(workspace_folder("[]"), None);
        assert_eq!(workspace_folder("not json"), None);
    }
}
