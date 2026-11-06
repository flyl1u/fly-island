//! Finds the Claude Code and Codex sessions active in the last two hours and summarizes them,
//! re-reading a session file only when its size or modification time changed.

use std::{
    collections::HashMap,
    fs::{self, File},
    io::{BufRead, BufReader, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

use super::markers::AGENT_RUNNING_STALE_AFTER_MS;
use super::notifications::{is_waiting, WaitingNotifications};
use super::session_host::codex_host;
use super::sessions::{
    codex_originator, codex_user_prompt, parse_claude_tail, parse_codex_meta, parse_codex_tail, record_cwd,
    session_phase, AgentSessionSummary, SessionTail, TurnState,
};
use super::snapshot::{current_unix_millis, system_time_to_unix_millis};
use super::title::{codex_thread_name, folder_title, user_prompt_in_record};

/// Sessions untouched for longer are left out of the list.
pub(super) const ACTIVE_WINDOW_MS: i64 = 2 * 60 * 60 * 1000;
/// The list shows at most this many sessions, running ones first.
const MAX_SESSIONS: usize = 12;
/// Session files and the Codex index are read this far from the end for the state, model, latest
/// reply and thread names.
const TAIL_BYTES: u64 = 256 * 1024;
/// Session files are scanned this far from the start for the first prompt.
const HEAD_BYTES: u64 = 4 * 1024 * 1024;

static SESSION_CACHE: Mutex<SessionCache> = Mutex::new(SessionCache::new());

/// `waiting` names the Claude Code sessions that asked the user something (notifications.rs).
/// `window_ms`: how far back a session file may have last changed (ACTIVE_WINDOW_MS by default).
pub(super) fn list_sessions(
    home_dir: &Path,
    waiting: &WaitingNotifications,
    window_ms: i64,
) -> Vec<AgentSessionSummary> {
    let now = current_unix_millis();
    let mut cache = SESSION_CACHE.lock().unwrap_or_else(PoisonError::into_inner);
    let mut sessions = Vec::new();

    let codex_index = read_tail(&home_dir.join(".codex").join("session_index.jsonl"));
    for (provider, path, modified) in recent_session_files(home_dir, now, window_ms) {
        // The phase is worked out here, because a working session turns stale, or stops
        // waiting, without its file changing.
        if let Some((mut summary, state)) =
            cache.summary(provider, &path, modified, codex_index.as_deref())
        {
            let asked_user = is_waiting(waiting, &summary.session_id, summary.updated_at);
            summary.phase = if state == TurnState::Working && asked_user {
                // Waiting on the user is not a stall, however long it takes.
                "waiting"
            } else {
                session_phase(
                    state,
                    now - summary.updated_at,
                    AGENT_RUNNING_STALE_AFTER_MS,
                )
            };
            sessions.push(summary);
        }
    }
    cache.forget_missing(&sessions);

    let is_active = |phase: &str| matches!(phase, "running" | "waiting");
    sessions.sort_by_key(|session| (!is_active(session.phase), -session.updated_at));
    sessions.truncate(MAX_SESSIONS);
    sessions
}

type SessionFile = (&'static str, PathBuf, i64);

fn recent_session_files(home_dir: &Path, now: i64, window_ms: i64) -> Vec<SessionFile> {
    let mut files = Vec::new();
    let mut push_recent = |provider: &'static str, path: PathBuf| {
        let modified = fs::metadata(&path)
            .ok()
            .filter(|metadata| metadata.is_file())
            .and_then(|metadata| metadata.modified().ok())
            .and_then(system_time_to_unix_millis);
        if let Some(modified) = modified.filter(|modified| now - modified <= window_ms) {
            files.push((provider, path, modified));
        }
    };

    // ~/.claude/projects/<project>/<session>.jsonl; subagent transcripts live in subfolders.
    for project in read_dir_paths(&home_dir.join(".claude").join("projects")) {
        for path in read_dir_paths(&project) {
            if path
                .extension()
                .is_some_and(|extension| extension == "jsonl")
            {
                push_recent("claudeCode", path);
            }
        }
    }

    // ~/.codex/sessions/<year>/<month>/<day>/rollout-*.jsonl; the newest two days cover up to a day.
    let mut days = Vec::new();
    for year in read_dir_paths(&home_dir.join(".codex").join("sessions")) {
        for month in read_dir_paths(&year) {
            days.extend(read_dir_paths(&month));
        }
    }
    days.sort();
    for day in days.iter().rev().take(2) {
        for path in read_dir_paths(day) {
            if path
                .extension()
                .is_some_and(|extension| extension == "jsonl")
            {
                push_recent("codex", path);
            }
        }
    }
    files
}

fn read_dir_paths(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .map(|entries| entries.flatten().map(|entry| entry.path()).collect())
        .unwrap_or_default()
}

struct CachedSession {
    stamp: (u64, Option<SystemTime>),
    summary: AgentSessionSummary,
    state: TurnState,
    /// What the start of the file says, kept once found: later reads skip the head scan.
    head: SessionHead,
}

/// The first prompt and the folder the session started in. A Claude Code record carries the
/// shell's current folder, which moves when the agent runs `cd`; the project is where it began.
#[derive(Clone, Default)]
struct SessionHead {
    first_prompt: Option<String>,
    first_cwd: Option<String>,
}

struct SessionCache {
    sessions: Option<HashMap<PathBuf, CachedSession>>,
}

impl SessionCache {
    const fn new() -> Self {
        Self { sessions: None }
    }

    fn summary(
        &mut self,
        provider: &'static str,
        path: &Path,
        modified: i64,
        codex_index: Option<&str>,
    ) -> Option<(AgentSessionSummary, TurnState)> {
        let metadata = fs::metadata(path).ok()?;
        let stamp = (metadata.len(), metadata.modified().ok());
        let sessions = self.sessions.get_or_insert_with(HashMap::new);
        if let Some(cached) = sessions.get(path).filter(|cached| cached.stamp == stamp) {
            let mut summary = cached.summary.clone();
            // The Codex index gains a thread name later than the session file changes.
            if provider == "codex" {
                if let Some(name) =
                    codex_index.and_then(|index| codex_thread_name(index, &summary.session_id))
                {
                    summary.title = Some(name);
                }
            }
            return Some((summary, cached.state));
        }

        // A long turn can push its prompt out of the tail read; keep the start and prompt found before.
        let known_turn_start = sessions.get(path).and_then(|cached| cached.summary.turn_started_at);
        let known_prompt = sessions.get(path).and_then(|cached| cached.summary.last_prompt.clone());
        let known_head = sessions
            .get(path)
            .map(|cached| cached.head.clone())
            .filter(|head| head.first_prompt.is_some());
        let tail = read_tail(path)?;
        let mut host = None;
        let (mut parsed, session_id, cwd) = if provider == "codex" {
            let first_line = read_first_line(path)?;
            let (id, cwd) = parse_codex_meta(&first_line)?;
            host = codex_originator(&first_line).map(|origin| codex_host(&origin));
            (parse_codex_tail(&tail), id, cwd)
        } else {
            let parsed = parse_claude_tail(&tail);
            let id = parsed.session_id.clone().or_else(|| {
                path.file_stem()
                    .map(|stem| stem.to_string_lossy().to_string())
            })?;
            (parsed, id, None)
        };
        let head = known_head.unwrap_or_else(|| scan_head(path, provider));
        let cwd = cwd
            .or_else(|| head.first_cwd.clone())
            .or_else(|| parsed.cwd.take());
        let first_prompt = head.first_prompt.clone();
        let title = match provider {
            "codex" => codex_index.and_then(|index| codex_thread_name(index, &session_id)),
            _ => parsed.title.take(),
        }
        .or_else(|| first_prompt.clone())
        .or_else(|| cwd.as_deref().and_then(folder_title));

        let state = parsed.state;
        let turn_started_at = parsed.turn_started_at.or(known_turn_start);
        let mut summary = summary_from(provider, session_id, cwd, title, parsed, modified);
        summary.turn_started_at = turn_started_at;
        summary.last_prompt = summary.last_prompt.take().or(known_prompt);
        summary.host = host;
        sessions.insert(
            path.to_path_buf(),
            CachedSession {
                stamp,
                summary: summary.clone(),
                state,
                head,
            },
        );
        Some((summary, state))
    }

    /// Drops files that left the two-hour window so the cache does not grow for ever.
    fn forget_missing(&mut self, listed: &[AgentSessionSummary]) {
        if let Some(sessions) = &mut self.sessions {
            sessions.retain(|_, cached| {
                listed
                    .iter()
                    .any(|session| session.session_id == cached.summary.session_id)
            });
        }
    }
}

fn summary_from(
    provider: &'static str,
    session_id: String,
    cwd: Option<String>,
    title: Option<String>,
    parsed: SessionTail,
    updated_at: i64,
) -> AgentSessionSummary {
    AgentSessionSummary {
        provider,
        session_id,
        cwd,
        title,
        model: parsed.model,
        effort: parsed.effort,
        // Set by `list_sessions` for the current time.
        phase: "completed",
        last_message: parsed.last_message,
        updated_at,
        host: None,
        turn_started_at: None,
        last_prompt: parsed.last_prompt,
        current_tool: parsed.current_tool,
    }
}

/// Scans whole lines from the start (a first message with a screenshot is one line of several
/// hundred KiB) until the first prompt and, for Claude Code, the starting folder are found.
fn scan_head(path: &Path, provider: &str) -> SessionHead {
    let mut head = SessionHead::default();
    let Ok(file) = File::open(path) else {
        return head;
    };
    let is_codex = provider == "codex";
    let prompt_in_line = if is_codex {
        codex_user_prompt
    } else {
        user_prompt_in_record
    };
    for line in BufReader::new(file.take(HEAD_BYTES))
        .split(b'\n')
        .map_while(Result::ok)
    {
        let line = String::from_utf8_lossy(&line);
        if head.first_cwd.is_none() && !is_codex {
            head.first_cwd = record_cwd(&line);
        }
        if head.first_prompt.is_none() {
            head.first_prompt = prompt_in_line(&line);
        }
        if head.first_prompt.is_some() && (is_codex || head.first_cwd.is_some()) {
            break;
        }
    }
    head
}

fn read_first_line(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let mut line = Vec::new();
    BufReader::new(file.take(HEAD_BYTES))
        .read_until(b'\n', &mut line)
        .ok()?;
    Some(String::from_utf8_lossy(&line).into_owned())
}

/// The last `TAIL_BYTES` of a file, starting at a whole line.
fn read_tail(path: &Path) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(TAIL_BYTES);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes).ok()?;
    if start > 0 {
        let first_newline = bytes.iter().position(|&byte| byte == b'\n')?;
        bytes.drain(..=first_newline);
    }
    Some(String::from_utf8_lossy(&bytes).into_owned())
}
