//! Sessions waiting for the user mid-turn (a tool permission prompt or an MCP input request).
//! The Notification and PermissionRequest hooks of Claude Code, and PermissionRequest of Codex,
//! save their input to a file per agent; a session counts as waiting while its transcript has not
//! changed since then, because answering the prompt makes the tool run and the transcript grow.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

use serde_json::Value;

use super::markers::{CLAUDE_CODE_NOTIFICATION_FILE_NAME, CODEX_NOTIFICATION_FILE_NAME};
use super::snapshot::system_time_to_unix_millis;

/// Notification types that mean the user has to answer before the turn goes on.
const WAITING_TYPES: [&str; 3] = ["permission_prompt", "elicitation_dialog", "agent_needs_input"];
/// Sessions remembered, oldest dropped first; only the newest notification is on disk at a time.
const REMEMBERED_SESSIONS: usize = 16;
/// Claude Code may finish writing the transcript just after the notification fires.
const TRANSCRIPT_WRITE_SLACK_MS: i64 = 2000;

/// When each session last asked the user something, Unix milliseconds.
pub(super) type WaitingNotifications = HashMap<String, i64>;

static NOTIFICATIONS: Mutex<NotificationLog> = Mutex::new(NotificationLog::new());

/// The session id of a saved notification, if it is one that waits for the user.
pub(super) fn waiting_session_id(input: &str) -> Option<String> {
    let input = serde_json::from_str::<Value>(input.trim_start_matches('\u{feff}').trim()).ok()?;
    let asks_permission = input["hook_event_name"] == "PermissionRequest";
    let waiting_notification = input["notification_type"]
        .as_str()
        .is_some_and(|kind| WAITING_TYPES.contains(&kind));
    if !asks_permission && !waiting_notification {
        return None;
    }
    input["session_id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

/// Whether a session whose transcript last changed at `updated_at` is still waiting.
pub(super) fn is_waiting(
    notifications: &WaitingNotifications,
    session_id: &str,
    updated_at: i64,
) -> bool {
    notifications
        .get(session_id)
        .is_some_and(|notified_at| *notified_at + TRANSCRIPT_WRITE_SLACK_MS >= updated_at)
}

/// Reads the saved notification when it changed and returns every session seen waiting.
pub(super) fn waiting_notifications(app_dir: &Path) -> WaitingNotifications {
    let mut log = NOTIFICATIONS.lock().unwrap_or_else(PoisonError::into_inner);
    log.refresh(&app_dir.join(CLAUDE_CODE_NOTIFICATION_FILE_NAME));
    log.refresh(&app_dir.join(CODEX_NOTIFICATION_FILE_NAME));
    log.sessions.iter().cloned().collect()
}

struct NotificationLog {
    /// Size and time of each file when last read.
    stamps: Vec<(PathBuf, (u64, Option<SystemTime>))>,
    /// `(session id, notified at)`, oldest first.
    sessions: Vec<(String, i64)>,
}

impl NotificationLog {
    const fn new() -> Self {
        Self {
            stamps: Vec::new(),
            sessions: Vec::new(),
        }
    }

    fn refresh(&mut self, path: &Path) {
        let Ok(metadata) = fs::metadata(path) else {
            return;
        };
        let stamp = (metadata.len(), metadata.modified().ok());
        match self.stamps.iter_mut().find(|(known, _)| known == path) {
            Some((_, known)) if *known == stamp => return,
            Some((_, known)) => *known = stamp,
            None => self.stamps.push((path.to_path_buf(), stamp)),
        }
        let Some(notified_at) = stamp.1.and_then(system_time_to_unix_millis) else {
            return;
        };
        let Some(session_id) = fs::read(path)
            .ok()
            .and_then(|bytes| waiting_session_id(&String::from_utf8_lossy(&bytes)))
        else {
            return;
        };
        self.remember(session_id, notified_at);
    }

    fn remember(&mut self, session_id: String, notified_at: i64) {
        self.sessions.retain(|(known, _)| *known != session_id);
        if self.sessions.len() >= REMEMBERED_SESSIONS {
            self.sessions.remove(0);
        }
        self.sessions.push((session_id, notified_at));
    }
}
