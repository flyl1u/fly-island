//! Hermes Agent (NousResearch) sessions, read from its `state.db` without writing to it. The
//! `sessions` table gives each conversation's title, folder, model and whether it ended; the
//! newest rows of `messages` tell a turn still working from one that has answered. Hermes keeps
//! adding columns, so the query falls back to the oldest known shape before giving up.

use std::{env, path::{Path, PathBuf}};

use rusqlite::{params, Connection};

use super::{markers::AGENT_RUNNING_STALE_AFTER_MS, session_host::SessionHost, sessions::AgentSessionSummary,
    sqlite_read, title::{folder_title, shorten}};

const MAX_SESSIONS: i64 = 12;

/// `HERMES_HOME`, Hermes' Windows default (`%LOCALAPPDATA%\hermes`) and the POSIX-style `~/.hermes`.
fn homes(home: &Path) -> Vec<PathBuf> {
    let mut homes: Vec<PathBuf> = env::var_os("HERMES_HOME").map(PathBuf::from).into_iter().collect();
    homes.extend(env::var_os("LOCALAPPDATA").map(|dir| PathBuf::from(dir).join("hermes")));
    homes.push(home.join(".hermes"));
    homes.dedup();
    homes
}

struct Row {
    id: String,
    title: Option<String>,
    model: Option<String>,
    cwd: Option<String>,
    ended: bool,
    active_at: i64,
}

const QUERIES: [&str; 2] = [
    "SELECT id, COALESCE(title, display_name), model, cwd, ended_at, COALESCE(last_activity_at, started_at) AS active FROM sessions \
     WHERE parent_session_id IS NULL AND COALESCE(archived, 0) = 0 AND COALESCE(hidden, 0) = 0 AND active >= ?1 ORDER BY active DESC LIMIT ?2",
    "SELECT id, title, model, NULL, ended_at, started_at AS active FROM sessions WHERE active >= ?1 ORDER BY active DESC LIMIT ?2",
];

fn rows(db: &Connection, since: i64) -> Vec<Row> {
    let since = since as f64 / 1000.0;
    QUERIES.iter().find_map(|query| {
        let mut statement = db.prepare(query).ok()?;
        let rows = statement.query_map(params![since, MAX_SESSIONS], |row| Ok(Row {
            id: row.get(0)?,
            title: row.get::<_, Option<String>>(1)?.as_deref().map(str::trim).and_then(|s| shorten(s, 80)),
            model: row.get::<_, Option<String>>(2)?.filter(|s| !s.is_empty()),
            cwd: row.get::<_, Option<String>>(3)?.filter(|s| !s.is_empty()),
            ended: row.get::<_, Option<f64>>(4)?.is_some(),
            active_at: (row.get::<_, f64>(5)? * 1000.0) as i64,
        })).ok()?;
        Some(rows.flatten().collect())
    }).unwrap_or_default()
}

/// A message as `(role, text, calls a tool, unix ms)`, newest first.
type Message = (String, Option<String>, bool, i64);

fn messages(db: &Connection, id: &str) -> Vec<Message> {
    db.prepare(
        "SELECT role, content, COALESCE(tool_calls, '') NOT IN ('', '[]', 'null'), timestamp FROM messages \
         WHERE session_id = ?1 ORDER BY id DESC LIMIT 40",
    ).and_then(|mut statement| {
        statement.query_map(params![id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, bool>(2)?, (row.get::<_, f64>(3)? * 1000.0) as i64))
        }).map(|rows| rows.flatten().collect())
    }).unwrap_or_default()
}

/// Whether the newest turn is still going: the last word is the user's, a tool result, or a
/// reply that calls a tool; a plain reply ends the turn.
fn working(messages: &[Message]) -> bool {
    messages.first().is_some_and(|(role, _, calls_tool, _)| match role.as_str() {
        "assistant" => *calls_tool,
        "user" | "tool" => true,
        _ => false,
    })
}

fn summary(row: Row, messages: &[Message], now: i64) -> AgentSessionSummary {
    let text = |message: Option<&Message>, maximum| message.and_then(|(_, body, _, _)| body.as_deref()).map(str::trim).and_then(|s| shorten(s, maximum));
    let prompt = messages.iter().find(|(role, body, _, _)| role == "user" && body.as_deref().is_some_and(|s| !s.trim().is_empty()));
    let reply = messages.iter().take_while(|(role, ..)| role != "user")
        .find(|(role, body, _, _)| role == "assistant" && body.as_deref().is_some_and(|s| !s.trim().is_empty()));
    let updated_at = row.active_at.max(messages.first().map_or(0, |(.., at)| *at));
    let phase = match (row.ended, working(messages)) {
        (false, true) if now.saturating_sub(updated_at) > AGENT_RUNNING_STALE_AFTER_MS => "stale",
        (false, true) => "running",
        _ => "completed",
    };
    AgentSessionSummary {
        title: row.title.or_else(|| text(prompt, 80)).or_else(|| row.cwd.as_deref().and_then(folder_title)),
        last_prompt: text(prompt, 80),
        last_message: text(reply, 200),
        turn_started_at: prompt.map(|(.., at)| *at),
        owner_prompt_at: prompt.map(|(.., at)| *at),
        host: Some(SessionHost { name: "Hermes".to_string(), exe: None, kind: "terminal" }),
        model: row.model, cwd: row.cwd, closed: row.ended, phase, updated_at,
        ..AgentSessionSummary::blank("hermes", row.id)
    }
}

pub(super) fn list_sessions(home: &Path, now: i64, window_ms: i64) -> Vec<AgentSessionSummary> {
    homes(home).iter().filter_map(|dir| sqlite_read::open(&dir.join("state.db"))).flat_map(|db| {
        rows(&db, now.saturating_sub(window_ms)).into_iter()
            .map(|row| { let messages = messages(&db, &row.id); summary(row, &messages, now) })
            .collect::<Vec<_>>()
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: &str, body: &str, calls_tool: bool, at: i64) -> Message {
        (role.to_string(), Some(body.to_string()), calls_tool, at)
    }

    fn row(ended: bool) -> Row {
        Row { id: "s1".into(), title: None, model: Some("hermes-4".into()), cwd: Some("D:\\work\\app".into()), ended, active_at: 1_000 }
    }

    #[test]
    fn a_tool_call_keeps_the_turn_running() {
        let newest_first = [message("assistant", "", true, 3_000), message("user", "fix the build", false, 2_000)];
        let session = summary(row(false), &newest_first, 4_000);
        assert_eq!(session.phase, "running");
        assert_eq!(session.title.as_deref(), Some("fix the build"));
        assert_eq!(session.turn_started_at, Some(2_000));
        assert_eq!(session.updated_at, 3_000);
    }

    #[test]
    fn a_plain_reply_or_an_ended_session_is_done() {
        let newest_first = [message("assistant", "Done, the build passes.", false, 3_000), message("user", "fix", false, 2_000)];
        let session = summary(row(false), &newest_first, 4_000);
        assert_eq!(session.phase, "completed");
        assert_eq!(session.last_message.as_deref(), Some("Done, the build passes."));
        let ended = summary(row(true), &[message("user", "fix", false, 2_000)], 4_000);
        assert_eq!(ended.phase, "completed");
        assert!(ended.closed);
    }

    #[test]
    fn reads_a_real_database_shape() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE sessions (id TEXT, title TEXT, display_name TEXT, model TEXT, cwd TEXT, started_at REAL, ended_at REAL, \
            last_activity_at REAL, parent_session_id TEXT, archived INTEGER, hidden INTEGER); \
            CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, tool_calls TEXT, timestamp REAL); \
            INSERT INTO sessions VALUES ('a', 'Port the parser', NULL, 'm', 'D:\\x', 100, NULL, 160, NULL, 0, 0); \
            INSERT INTO sessions VALUES ('child', 'sub', NULL, 'm', NULL, 100, NULL, 160, 'a', 0, 0); \
            INSERT INTO messages (session_id, role, content, tool_calls, timestamp) VALUES ('a', 'user', 'go', NULL, 150), ('a', 'assistant', NULL, '[{}]', 160);").unwrap();
        let found = rows(&db, 0);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].active_at, 160_000);
        assert!(working(&messages(&db, "a")));
    }
}
