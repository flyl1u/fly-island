//! Agent sessions seen running, kept after they stop being listed as running
//! (`agent-sessions-seen.json` in the app data folder): their process, its start time, its Orca
//! terminal and the program hosting it. `/clear` or `/resume` gives a Claude Code session a new id
//! while its process and terminal tab carry on, and an ended session leaves Claude Code's process
//! registry; this is then the only link from the old id back to its window. Kept for two days.

use std::{
    collections::HashMap,
    fs,
    path::Path,
    sync::{Mutex, PoisonError},
};

use serde::{Deserialize, Serialize};

use super::snapshot::current_unix_millis;

pub(super) const FILE_NAME: &str = "agent-sessions-seen.json";
const KEEP_MS: i64 = 48 * 60 * 60 * 1000;
const MAX_KEPT: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SeenSession {
    pub(super) pid: u32,
    /// Start time of `pid` (100 ns ticks since 1601), so a reused id is not taken for it.
    pub(super) started: Option<u64>,
    /// Executable of the program whose window shows the session.
    pub(super) host_exe: Option<String>,
    pub(super) orca_handle: Option<String>,
    /// When this was last worked out, Unix milliseconds.
    pub(super) seen_at: i64,
}

type Sessions = HashMap<String, SeenSession>;

/// `None` until first used; loaded from the app data folder then.
static STORE: Mutex<Option<Sessions>> = Mutex::new(None);

fn load(app_dir: &Path) -> Sessions {
    fs::read_to_string(app_dir.join(FILE_NAME))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(app_dir: &Path, sessions: &Sessions) {
    let Ok(text) = serde_json::to_string(sessions) else {
        return;
    };
    let path = app_dir.join(FILE_NAME);
    let temporary = app_dir.join(format!("{FILE_NAME}.tmp"));
    // Best effort: losing this file only loses the way back to ended sessions' windows.
    if fs::write(&temporary, text).is_ok() {
        let _ = fs::rename(&temporary, &path);
    }
}

/// Drops entries older than KEEP_MS, then the oldest ones past MAX_KEPT.
pub(super) fn prune(sessions: &mut Sessions, now: i64) {
    sessions.retain(|_, seen| now - seen.seen_at <= KEEP_MS);
    if sessions.len() > MAX_KEPT {
        let mut ages: Vec<i64> = sessions.values().map(|seen| seen.seen_at).collect();
        ages.sort_unstable_by(|a, b| b.cmp(a));
        let cutoff = ages[MAX_KEPT - 1];
        sessions.retain(|_, seen| seen.seen_at >= cutoff);
    }
}

fn with_store<T>(app_dir: Option<&Path>, run: impl FnOnce(&mut Sessions) -> T) -> T {
    let mut guard = STORE.lock().unwrap_or_else(PoisonError::into_inner);
    let sessions = guard.get_or_insert_with(|| app_dir.map(load).unwrap_or_default());
    run(sessions)
}

/// What was last seen of `session_id`.
pub(super) fn get(app_dir: Option<&Path>, session_id: &str) -> Option<SeenSession> {
    with_store(app_dir, |sessions| sessions.get(session_id).cloned())
}

/// Records `seen` for `session_id` and writes the file.
pub(super) fn remember(app_dir: Option<&Path>, session_id: &str, seen: SeenSession) {
    with_store(app_dir, |sessions| {
        sessions.insert(session_id.to_string(), seen);
        prune(sessions, current_unix_millis());
        if let Some(app_dir) = app_dir {
            save(app_dir, sessions);
        }
    });
}
