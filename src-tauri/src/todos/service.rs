//! Where the todos live right now, and saving changes to them.
//!
//! Until the island window has run the migration the source is `Pending`, and
//! callers that need the todos wait (see `wait_until_decided`). After it, the
//! todos are in `todos.json` (`File`), or, if the migration failed, still in
//! the window's localStorage (`Local`), as in older versions.

use serde::{Deserialize, Deserializer, Serialize};
use std::{
    path::PathBuf,
    sync::{Condvar, Mutex, MutexGuard, OnceLock, PoisonError},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

use super::{
    migration::{self, LocalTodoKeys, TodosSnapshot, FILE_NAME},
    model::{ScheduledTodo, TodoArchive, TodoItem, TodosData, TodosFile},
    store::{self, LoadError},
};

enum Source {
    Pending,
    File(Box<TodosFile>),
    Local,
}

struct TodosHost {
    dir: PathBuf,
    app_version: String,
    source: Mutex<Source>,
    decided: Condvar,
}

static HOST: OnceLock<TodosHost> = OnceLock::new();

pub(crate) fn init(app: &AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let host = TodosHost {
        dir,
        app_version: app.package_info().version.to_string(),
        source: Mutex::new(Source::Pending),
        decided: Condvar::new(),
    };
    HOST.set(host).map_err(|_| "The todo store was initialized twice.".to_string())
}

fn host() -> Result<&'static TodosHost, String> {
    HOST.get().ok_or_else(|| "The todo store is not initialized.".to_string())
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Waits (at most `timeout`) until the island window has decided where the
/// todos live. True if they are in todos.json.
pub(crate) fn wait_until_decided(timeout: Duration) -> bool {
    let Ok(host) = host() else { return false };
    let deadline = Instant::now() + timeout;
    let mut source = lock(&host.source);
    while matches!(*source, Source::Pending) {
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return false;
        }
        source = host.decided.wait_timeout(source, left).unwrap_or_else(PoisonError::into_inner).0;
    }
    matches!(*source, Source::File(_))
}

/// The island window's start-up handoff. On error the todos stay in localStorage.
pub(crate) fn migrate(keys: LocalTodoKeys, normalized: TodosData) -> Result<TodosSnapshot, String> {
    let host = host()?;
    let mut source = lock(&host.source);
    // The window was reloaded: what is in memory is what is on disk.
    if let Source::File(file) = &*source {
        return Ok(snapshot(file, None));
    }
    let result = migrate_with_retry(host, &keys, normalized);
    let answer = match result {
        Ok((file, notice)) => {
            let answer = Ok(snapshot(&file, notice));
            *source = Source::File(Box::new(file));
            answer
        }
        Err(error) => {
            *source = Source::Local;
            Err(error)
        }
    };
    host.decided.notify_all();
    answer
}

/// A file another program has open (backup, antivirus) is often readable a moment later.
fn migrate_with_retry(host: &TodosHost, keys: &LocalTodoKeys, normalized: TodosData) -> Result<(TodosFile, Option<&'static str>), String> {
    for _ in 0..3 {
        if !matches!(store::load(&host.dir.join(FILE_NAME)), Err(LoadError::Unreadable(_))) {
            break;
        }
        thread::sleep(Duration::from_millis(300));
    }
    migration::migrate(&host.dir, keys, normalized, &host.app_version)
}

fn snapshot(file: &TodosFile, notice: Option<&'static str>) -> TodosSnapshot {
    TodosSnapshot { revision: file.revision, data: file.data.clone(), notice }
}

pub(crate) fn current() -> Result<TodosSnapshot, String> {
    match &*lock(&host()?.source) {
        Source::File(file) => Ok(snapshot(file, None)),
        Source::Pending => Err("The todos are not loaded yet.".into()),
        Source::Local => Err("The todos are kept by the island window (todos.json could not be used).".into()),
    }
}

/// Fields the island window replaces; missing ones stay as they are.
/// Mirrored by `TodosChange` in src/features/todos/api.ts.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodosChange {
    pub date: Option<String>,
    pub todos: Option<Vec<TodoItem>>,
    pub scheduled: Option<Vec<ScheduledTodo>>,
    pub archives: Option<Vec<TodoArchive>>,
    pub daily_note: Option<String>,
    /// Missing: unchanged; null: no active todo.
    #[serde(default, deserialize_with = "present")]
    pub active_todo_id: Option<Option<String>>,
}

fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(deserializer: D) -> Result<Option<T>, D::Error> {
    T::deserialize(deserializer).map(Some)
}

/// `data` with the fields of `change` replaced.
pub(crate) fn patched(data: &TodosData, change: &TodosChange) -> TodosData {
    let mut next = data.clone();
    if let Some(date) = &change.date {
        next.date = date.clone();
    }
    if let Some(todos) = &change.todos {
        next.todos = todos.clone();
    }
    if let Some(scheduled) = &change.scheduled {
        next.scheduled = scheduled.clone();
    }
    if let Some(archives) = &change.archives {
        next.archives = archives.clone();
    }
    if let Some(note) = &change.daily_note {
        next.daily_note = note.clone();
    }
    if let Some(active) = &change.active_todo_id {
        next.active_todo_id = active.clone();
    }
    next
}

/// Mirrored by `AppliedTodosChange` in src/features/todos/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedTodosChange {
    pub revision: u64,
}

/// Saves a change from the island window.
pub(crate) fn apply(change: &TodosChange) -> Result<AppliedTodosChange, String> {
    let host = host()?;
    let mut source = lock(&host.source);
    let Source::File(file) = &mut *source else {
        return Err("The todos are not kept in todos.json right now.".into());
    };
    let data = patched(&file.data, change);
    if data == file.data {
        return Ok(AppliedTodosChange { revision: file.revision });
    }
    let next = TodosFile { revision: file.revision + 1, data, ..(**file).clone() };
    store::save(&host.dir.join(FILE_NAME), &next)?;
    **file = next;
    Ok(AppliedTodosChange { revision: file.revision })
}
