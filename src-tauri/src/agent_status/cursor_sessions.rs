//! Cursor's agent conversations, read from its global state database without writing to it.
//! `composerHeaders` lists the conversations (name, workspace, last change), each one's
//! `composerData:<id>` row says whether it is generating, and its `bubbleId:<id>:<bubble>` rows
//! hold the messages. Layout observed in Cursor as of 2026-11 (composer data version 18); a
//! reshaped store reads as no sessions rather than wrong ones.

use std::{collections::HashMap, env, fs, path::PathBuf, sync::{Mutex, PoisonError}};

use rusqlite::{params, types::Value as Sql, Connection};
use serde_json::Value;

use super::{markers::AGENT_RUNNING_STALE_AFTER_MS, session_host::SessionHost,
    sessions::{parse_timestamp_ms, AgentSessionSummary}, sqlite_read, title::{folder_title, shorten},
    window_focus::{self, SessionHints}};

/// Cursor.exe, as `window_focus::app_name` spells it.
pub(super) const DESKTOP_APP: &str = "cursor";
const MAX_SESSIONS: i64 = 12;

/// The newest prompt and reply of a conversation, re-read only when it changes.
#[derive(Clone, Default)]
struct Exchange {
    prompt: Option<String>,
    prompt_at: Option<i64>,
    reply: Option<String>,
    newest_at: Option<i64>,
}
static EXCHANGES: Mutex<Option<HashMap<String, (i64, Exchange)>>> = Mutex::new(None);

fn user_dir() -> Option<PathBuf> {
    env::var_os("APPDATA").map(|dir| PathBuf::from(dir).join("Cursor").join("User"))
}

#[derive(Debug, PartialEq)]
struct Header {
    id: String,
    workspace: Option<String>,
    updated_at: i64,
    name: Option<String>,
    subtitle: Option<String>,
    blocking: bool,
}

fn text(value: &Value, maximum: usize) -> Option<String> {
    value.as_str().map(str::trim).filter(|s| !s.is_empty()).and_then(|s| shorten(s, maximum))
}

fn parse_header(id: String, workspace: Option<String>, updated_at: i64, value: Option<&str>) -> Header {
    let value: Value = value.and_then(|value| serde_json::from_str(value).ok()).unwrap_or(Value::Null);
    Header {
        id,
        workspace: workspace.filter(|id| !id.is_empty() && id != "empty-window"),
        updated_at,
        name: text(&value["name"], 80),
        subtitle: text(&value["subtitle"], 80),
        blocking: value["hasBlockingPendingActions"].as_bool().unwrap_or(false),
    }
}

fn headers(db: &Connection, since: i64) -> Vec<Header> {
    let Ok(mut statement) = db.prepare(
        "SELECT composerId, workspaceId, COALESCE(recency, lastUpdatedAt, createdAt) AS changed, value FROM composerHeaders \
         WHERE COALESCE(isArchived, 0) = 0 AND COALESCE(isSubagent, 0) = 0 AND changed >= ?1 ORDER BY changed DESC LIMIT ?2",
    ) else { return Vec::new() };
    let rows = statement.query_map(params![since, MAX_SESSIONS], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, i64>(2)?, row.get::<_, Option<String>>(3)?))
    });
    rows.map(|rows| rows.flatten().map(|(id, workspace, at, value)| parse_header(id, workspace, at, value.as_deref())).collect())
        .unwrap_or_default()
}

/// Status ("generating", "completed", "aborted", "none"), last change, model and reasoning effort.
type Composer = (String, Option<i64>, Option<String>, Option<String>);

fn composer(db: &Connection, id: &str) -> Option<Composer> {
    db.query_row(
        "SELECT json_extract(CAST(value AS TEXT), '$.status'), json_extract(CAST(value AS TEXT), '$.lastUpdatedAt'), \
         json_extract(CAST(value AS TEXT), '$.modelConfig.modelName'), json_extract(CAST(value AS TEXT), '$.modelConfig.selectedModels[0].parameters') \
         FROM cursorDiskKV WHERE key = ?1",
        params![format!("composerData:{id}")],
        |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<i64>>(1)?, row.get::<_, Option<String>>(2)?, row.get::<_, Option<String>>(3)?)),
    ).ok().map(|(status, updated, model, parameters)| {
        let effort = parameters.and_then(|text| serde_json::from_str::<Value>(&text).ok()).and_then(|parameters| {
            parameters.as_array()?.iter().find(|p| p["id"] == "reasoning_effort").and_then(|p| text(&p["value"], 40))
        });
        (status.unwrap_or_default(), updated, model.filter(|m| !m.is_empty() && m != "default"), effort)
    })
}

fn millis(value: &Sql) -> Option<i64> {
    match value {
        Sql::Integer(at) => Some(*at),
        Sql::Real(at) => Some(*at as i64),
        Sql::Text(at) => parse_timestamp_ms(at),
        _ => None,
    }
}

/// Bubbles are `(type, text, createdAt)`: type 1 is the user's, 2 the agent's (a reply or a tool step).
fn exchange_of(bubbles: Vec<(i64, Option<String>, Option<i64>)>) -> Exchange {
    let mut bubbles = bubbles;
    bubbles.sort_by_key(|(_, _, at)| *at);
    let mut exchange = Exchange { newest_at: bubbles.iter().filter_map(|(_, _, at)| *at).max(), ..Exchange::default() };
    for (kind, body, at) in bubbles.iter().rev() {
        let body = body.as_deref().map(str::trim).filter(|s| !s.is_empty());
        match kind {
            1 if exchange.prompt.is_none() => {
                exchange.prompt = body.and_then(|s| shorten(s, 80));
                exchange.prompt_at = *at;
            }
            2 if exchange.reply.is_none() && exchange.prompt.is_none() => exchange.reply = body.and_then(|s| shorten(s, 200)),
            _ => {}
        }
        if exchange.prompt.is_some() {
            break;
        }
    }
    exchange
}

fn exchange(db: &Connection, id: &str, stamp: i64) -> Exchange {
    let mut cache = EXCHANGES.lock().unwrap_or_else(PoisonError::into_inner);
    let entries = cache.get_or_insert_with(HashMap::new);
    if let Some((_, known)) = entries.get(id).filter(|(at, _)| *at == stamp) {
        return known.clone();
    }
    let bubbles = db.prepare(
        "SELECT json_extract(CAST(value AS TEXT), '$.type'), json_extract(CAST(value AS TEXT), '$.text'), json_extract(CAST(value AS TEXT), '$.createdAt') \
         FROM cursorDiskKV WHERE key >= ?1 AND key < ?2",
    ).and_then(|mut statement| {
        statement.query_map(params![format!("bubbleId:{id}:"), format!("bubbleId:{id};")], |row| {
            Ok((row.get::<_, Option<i64>>(0)?.unwrap_or(0), row.get::<_, Option<String>>(1)?, millis(&row.get::<_, Sql>(2)?)))
        }).map(|rows| rows.flatten().collect::<Vec<_>>())
    }).unwrap_or_default();
    let found = exchange_of(bubbles);
    if entries.len() >= 64 {
        entries.clear();
    }
    entries.insert(id.to_string(), (stamp, found.clone()));
    found
}

/// `file:///d%3A/Work/app` → `D:\Work\app`; remote and other schemes have no local folder.
fn folder_of_uri(uri: &str) -> Option<String> {
    let path = uri.strip_prefix("file:///")?;
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = |at: usize| bytes.get(at).and_then(|c| (*c as char).to_digit(16));
        match (bytes[i], hex(i + 1), hex(i + 2)) {
            (b'%', Some(high), Some(low)) => { decoded.push((high * 16 + low) as u8); i += 3; }
            (c, _, _) => { decoded.push(c); i += 1; }
        }
    }
    let mut path = String::from_utf8(decoded).ok()?.replace('/', "\\");
    if path.as_bytes().get(1) == Some(&b':') {
        path[..1].make_ascii_uppercase();
    }
    Some(path)
}

fn workspace_folder(user: &std::path::Path, workspace: &str) -> Option<String> {
    let text = fs::read_to_string(user.join("workspaceStorage").join(workspace).join("workspace.json")).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value["folder"].as_str().and_then(folder_of_uri)
}

fn phase(open: bool, blocking: bool, status: &str, quiet_for: i64) -> &'static str {
    match (open, blocking, status) {
        (false, _, _) => "completed",
        (_, true, _) => "waiting",
        (_, _, "generating") if quiet_for > AGENT_RUNNING_STALE_AFTER_MS => "stale",
        (_, _, "generating") => "running",
        _ => "completed",
    }
}

pub(super) fn list_sessions(now: i64, window_ms: i64) -> Vec<AgentSessionSummary> {
    let Some(user) = user_dir() else { return Vec::new() };
    let Some(db) = sqlite_read::open(&user.join("globalStorage").join("state.vscdb")) else { return Vec::new() };
    let exe = window_focus::open_app_exe(DESKTOP_APP);
    headers(&db, now.saturating_sub(window_ms)).into_iter().filter_map(|header| {
        let (status, changed, model, effort) = composer(&db, &header.id)?;
        let stamp = header.updated_at.max(changed.unwrap_or(0));
        let exchange = exchange(&db, &header.id, stamp);
        // A new chat that was never sent anything.
        if header.name.is_none() && exchange.prompt.is_none() {
            return None;
        }
        let updated_at = stamp.max(exchange.newest_at.unwrap_or(0));
        let cwd = header.workspace.as_deref().and_then(|id| workspace_folder(&user, id));
        let phase = phase(exe.is_some(), header.blocking, &status, now.saturating_sub(updated_at));
        Some(AgentSessionSummary {
            title: header.name.or_else(|| exchange.prompt.clone()).or(header.subtitle).or_else(|| cwd.as_deref().and_then(folder_title)),
            host: Some(SessionHost { name: "Cursor".to_string(), exe: exe.clone(), kind: "editor" }),
            turn_started_at: exchange.prompt_at,
            owner_prompt_at: exchange.prompt_at,
            last_prompt: exchange.prompt,
            last_message: exchange.reply,
            closed: exe.is_none(),
            model, effort, cwd, phase, updated_at,
            ..AgentSessionSummary::blank("cursor", header.id)
        })
    }).collect()
}

/// Cursor's window for the session's folder, else its frontmost window.
pub(super) fn focus(cwd: Option<&str>) -> bool {
    let (folder, ancestors) = cwd.map(super::focus::folder_names).unwrap_or_default();
    let hints = SessionHints { folder: folder.as_deref(), ancestors: &ancestors, title: None, is_codex: false };
    window_focus::focus_session_window(&hints, &[], Some(DESKTOP_APP)).is_some()
}

/// Cursor does not say which conversation its window shows: with it in front, the one changed
/// last counts as the one looked at.
pub(super) fn newest_session_id() -> Option<String> {
    let db = sqlite_read::open(&user_dir()?.join("globalStorage").join("state.vscdb"))?;
    headers(&db, 0).into_iter().next().map(|header| header.id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_workspace_folders() {
        assert_eq!(folder_of_uri("file:///d%3A/WeChat%20project/Clean").as_deref(), Some("D:\\WeChat project\\Clean"));
        assert_eq!(folder_of_uri("vscode-remote://ssh-remote%2Bbox/home/me"), None);
    }

    #[test]
    fn reads_the_newest_prompt_and_reply() {
        let bubbles = vec![
            (1, Some("first".into()), Some(1)), (2, Some("old reply".into()), Some(2)),
            (1, Some("second".into()), Some(3)), (2, Some("".into()), Some(5)), (2, Some("answer".into()), Some(4)),
        ];
        let exchange = exchange_of(bubbles);
        assert_eq!(exchange.prompt.as_deref(), Some("second"));
        assert_eq!(exchange.prompt_at, Some(3));
        assert_eq!(exchange.reply.as_deref(), Some("answer"));
        assert_eq!(exchange.newest_at, Some(5));
    }

    #[test]
    fn header_skips_the_empty_window() {
        let header = parse_header("a".into(), Some("empty-window".into()), 9, Some(r#"{"name":"Fix","hasBlockingPendingActions":true}"#));
        assert_eq!(header.workspace, None);
        assert_eq!(header.name.as_deref(), Some("Fix"));
        assert!(header.blocking);
    }

    #[test]
    fn phases() {
        assert_eq!(phase(false, true, "generating", 0), "completed");
        assert_eq!(phase(true, true, "completed", 0), "waiting");
        assert_eq!(phase(true, false, "generating", 0), "running");
        assert_eq!(phase(true, false, "generating", AGENT_RUNNING_STALE_AFTER_MS + 1), "stale");
        assert_eq!(phase(true, false, "aborted", 0), "completed");
    }
}
