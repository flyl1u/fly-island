//! Antigravity's agent conversations, read from its summary database without writing to it.
//! `%USERPROFILE%\.gemini\antigravity\conversation_summaries.db` keeps one row per conversation:
//! title, preview, step count, last change, run status and workspace. Layout observed in
//! Antigravity 2.0 as of 2026-11; a reshaped store reads as no sessions rather than wrong ones.

use std::{env, path::PathBuf};

use rusqlite::params;
use serde_json::Value;

use super::{markers::AGENT_RUNNING_STALE_AFTER_MS, session_host::SessionHost,
    sessions::{parse_timestamp_ms, AgentSessionSummary}, sqlite_read, title::{folder_title, shorten},
    window_focus::{self, SessionHints}};

/// Antigravity.exe, as `window_focus::app_name` spells it.
pub(super) const DESKTOP_APP: &str = "antigravity";
const MAX_SESSIONS: i64 = 12;

fn db_path() -> Option<PathBuf> {
    env::var_os("USERPROFILE").map(|dir| {
        PathBuf::from(dir).join(".gemini").join("antigravity").join("conversation_summaries.db")
    })
}

/// `["file:///d%3A/Project/x"]` -> `D:\Project\x`. The first entry is the folder the run opened.
fn first_folder(uris: &str) -> Option<String> {
    let value: Value = serde_json::from_str(uris).ok()?;
    let uri = value.as_array()?.first()?.as_str()?.strip_prefix("file:///")?;
    let bytes = uri.as_bytes();
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
    let mut path = String::from_utf8(decoded).ok()?.replace('/', "\\");
    if path.as_bytes().get(1) == Some(&b':') {
        path[..1].make_ascii_uppercase();
    }
    Some(path)
}

/// `killed` wins, then the run status. Only `CASCADE_RUN_STATUS_IDLE` has been observed at rest
/// (2026-11); anything else is treated as a turn in progress, and a silent one goes stale.
fn phase(killed: bool, status: &str, not_idle: bool, quiet_for: i64) -> &'static str {
    if killed {
        return "failed";
    }
    if !not_idle && status.contains("IDLE") {
        return "completed";
    }
    if quiet_for > AGENT_RUNNING_STALE_AFTER_MS { "stale" } else { "running" }
}

pub(super) fn list_sessions(now: i64, window_ms: i64) -> Vec<AgentSessionSummary> {
    let Some(db) = db_path().and_then(|path| sqlite_read::open(&path)) else { return Vec::new() };
    read(&db, now, window_ms, window_focus::open_app_exe(DESKTOP_APP))
}

fn read(db: &rusqlite::Connection, now: i64, window_ms: i64, exe: Option<String>) -> Vec<AgentSessionSummary> {
    let Ok(mut statement) = db.prepare(
        "SELECT conversation_id, title, preview, step_count, last_modified_time, workspace_uris,
                status, killed, not_fully_idle, last_user_input_time
         FROM conversation_summaries
         ORDER BY last_modified_time DESC
         LIMIT ?1",
    ) else {
        return Vec::new();
    };
    let rows = statement.query_map(params![MAX_SESSIONS], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, i64>(7)? != 0,
            row.get::<_, i64>(8)? != 0,
            row.get::<_, String>(9)?,
        ))
    });
    let Ok(rows) = rows else { return Vec::new() };
    let earliest = now.saturating_sub(window_ms);

    rows.filter_map(|row| row.ok())
        .filter_map(|(id, title, preview, steps, changed, uris, status, killed, not_idle, last_input)| {
            let updated_at = parse_timestamp_ms(&changed)?;
            // A conversation that was opened but never used has nothing to show.
            if updated_at < earliest || (title.trim().is_empty() && steps == 0) {
                return None;
            }
            let cwd = first_folder(&uris);
            let prompt_at = parse_timestamp_ms(&last_input);
            let quiet_for = now.saturating_sub(updated_at);
            Some(AgentSessionSummary {
                title: shorten(title.trim(), 80)
                    .or_else(|| shorten(preview.trim(), 80))
                    .or_else(|| cwd.as_deref().and_then(folder_title)),
                host: Some(SessionHost { name: "Antigravity".to_string(), exe: exe.clone(), kind: "editor" }),
                turn_started_at: prompt_at,
                owner_prompt_at: prompt_at,
                last_message: shorten(preview.trim(), 160),
                closed: exe.is_none(),
                phase: phase(killed, &status, not_idle, quiet_for),
                updated_at,
                cwd,
                ..AgentSessionSummary::blank("antigravity", id)
            })
        })
        .collect()
}

/// Antigravity's window for the session's folder, else its frontmost window.
pub(super) fn focus(cwd: Option<&str>) -> bool {
    let (folder, ancestors) = cwd.map(super::focus::folder_names).unwrap_or_default();
    let hints = SessionHints { folder: folder.as_deref(), ancestors: &ancestors, title: None, is_codex: false };
    window_focus::focus_session_window(&hints, &[], Some(DESKTOP_APP)).is_some()
}

#[path = "antigravity_sessions_tests.rs"]
#[cfg(test)]
mod tests;
