//! Google Antigravity's local conversations, read-only. `conversation_summaries.db` lists them
//! with their run status (read through a private copy, sqlite_snapshot.rs); each conversation's
//! transcript adds the latest turn's details. The quota comes from the language server instead
//! (antigravity_quota.rs). Nothing here writes to Antigravity's files, and titles and replies are
//! never logged.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
};

use rusqlite::{params, Connection};
use serde_json::Value;

use super::{
    antigravity_transcript::{self, Transcript},
    local_agent_files::{directory, entry},
    markers::AGENT_RUNNING_STALE_AFTER_MS,
    session_host::SessionHost,
    sessions::{parse_timestamp_ms, AgentSessionSummary},
    sqlite_snapshot::SnapshotCache,
    title::shorten,
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
const SUMMARIES_FILE: &str = "conversation_summaries.db";
/// Conversations read from the summaries table before the ones outside the window are dropped.
const MAX_ROWS: usize = 64;
const MAX_SESSIONS: usize = 12;
/// The rows last read from each folder's store; read again only when its files change.
static SUMMARIES: Mutex<SnapshotCache<Vec<Row>>> = Mutex::new(SnapshotCache::new());

/// `~/.gemini/antigravity` and its siblings, each step a real folder (no junction or link).
fn app_root(home: &Path, folder: &str) -> Option<PathBuf> {
    folder.split('/').try_fold(home.to_path_buf(), |parent, name| directory(&parent, name))
}

/// The conversations in one folder's store, including what still sits in its WAL.
fn read_summaries(home: &Path, folder: &str) -> Option<Vec<Row>> {
    let root = app_root(home, folder)?;
    SUMMARIES.lock().unwrap_or_else(PoisonError::into_inner).read(&root, SUMMARIES_FILE, summaries)
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
#[derive(Clone, Debug, PartialEq)]
struct Row {
    id: String,
    title: Option<String>,
    modified_at: i64,
    status: String,
    prompt_at: Option<i64>,
    prompt_step: Option<u64>,
    cwd: Option<String>,
}

/// None when the store cannot be read, which is not the same as an empty list.
fn summaries(db: &Connection) -> Option<Vec<Row>> {
    let query = |prompt_step: &str| format!(
        "SELECT conversation_id, title, last_modified_time, workspace_uris, status, last_user_input_time, \
         {prompt_step} FROM conversation_summaries \
         WHERE COALESCE(nesting_depth, 0) <= 0 AND COALESCE(parent_conversation_id, '') = '' \
         ORDER BY last_modified_time DESC LIMIT ?1"
    );
    let mut statement = db.prepare(&query("last_user_input_step_index")).or_else(|_| db.prepare(&query("NULL"))).ok()?;
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
    rows.ok().map(|rows| {
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
        .filter_map(|folder| read_summaries(home, folder).map(|rows| (rows, folder)))
        .flat_map(|(rows, folder)| rows.into_iter().map(move |row| (row, folder)))
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
    read_summaries(home, APP_FOLDER)?.into_iter().next().map(|row| row.id)
}

pub(super) fn cli_session(home: &Path, id: &str) -> bool {
    fn last_modified(home: &Path, folder: &str, id: &str) -> Option<i64> {
        read_summaries(home, folder)?.into_iter().find(|row| row.id == id).map(|row| row.modified_at)
    }
    let Some(cli) = last_modified(home, CLI_FOLDER, id) else { return false };
    [APP_FOLDER, IDE_FOLDER].into_iter()
        .all(|folder| last_modified(home, folder, id).is_none_or(|desktop| cli > desktop))
}

pub(super) fn cli_executable(home: &Path) -> Option<PathBuf> {
    let bin = app_root(home, ".gemini/bin")?;
    let (path, metadata) = entry(&bin, "agy.exe")?;
    metadata.is_file().then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_status::local_agent_files::scratch::tempdir;
    use std::fs;

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

    fn write_summaries(home: &Path, folder: &str, rows: &[(&str, &str, &str)]) {
        let root = home.join(folder);
        fs::create_dir_all(&root).unwrap();
        let db = Connection::open(root.join(SUMMARIES_FILE)).unwrap();
        db.execute_batch(
            "CREATE TABLE conversation_summaries (conversation_id TEXT, title TEXT, last_modified_time TEXT,              workspace_uris TEXT, status TEXT, last_user_input_time TEXT, last_user_input_step_index INTEGER,              nesting_depth INTEGER, parent_conversation_id TEXT);",
        )
        .unwrap();
        for (id, title, status) in rows {
            db.execute(
                "INSERT INTO conversation_summaries VALUES (?1, ?2, '2030-01-01T00:00:10Z', '[]', ?3, NULL, NULL, 0, '')",
                [id, title, status],
            )
            .unwrap();
        }
    }

    #[test]
    fn lists_conversations_without_touching_the_store() {
        let home = tempdir();
        assert!(list_sessions(home.path(), 0, 1).is_empty(), "no Antigravity data is no error");
        write_summaries(home.path(), ".gemini/antigravity", &[("c1", "Fix it", "CASCADE_RUN_STATUS_IDLE")]);
        let now = parse_timestamp_ms("2030-01-01T00:00:20Z").unwrap();
        let sessions = list_sessions(home.path(), now, 60_000);
        assert_eq!(sessions.len(), 1);
        assert_eq!((sessions[0].session_id.as_str(), sessions[0].phase), ("c1", "completed"));
        let names: Vec<_> = fs::read_dir(home.path().join(".gemini/antigravity")).unwrap().flatten().collect();
        assert_eq!(names.len(), 1, "no -wal, -shm or journal file is left behind");
    }

    #[test]
    fn a_finished_turn_still_in_the_wal_is_listed_at_once() {
        let home = tempdir();
        write_summaries(home.path(), APP_FOLDER, &[("c1", "Fix it", "CASCADE_RUN_STATUS_RUNNING")]);
        let ide = Connection::open(home.path().join(APP_FOLDER).join(SUMMARIES_FILE)).unwrap();
        ide.execute_batch("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;").unwrap();
        let now = parse_timestamp_ms("2030-01-01T00:00:20Z").unwrap();
        assert_eq!(list_sessions(home.path(), now, 60_000)[0].phase, "running");
        // Committed, but only into the WAL: the IDE has not merged it into the main file.
        ide.execute("UPDATE conversation_summaries SET status = 'CASCADE_RUN_STATUS_IDLE'", []).unwrap();
        let started = std::time::Instant::now();
        assert_eq!(list_sessions(home.path(), now, 60_000)[0].phase, "completed");
        println!("running to completed was read back in {:?}", started.elapsed());
    }

    #[test]
    fn a_broken_or_oversized_store_is_nothing_to_show() {
        let home = tempdir();
        let root = home.path().join(".gemini/antigravity");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join(SUMMARIES_FILE), "this is not a database").unwrap();
        assert!(list_sessions(home.path(), 0, i64::MAX).is_empty());
        assert!(newest_session_id(home.path()).is_none());
        assert!(!cli_session(home.path(), "c1"));
    }
}
