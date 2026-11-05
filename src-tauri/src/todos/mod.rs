//! Todos, the daily note and archives, kept by Rust in `todos.json` under the
//! app data folder. They used to live in the island window's localStorage; the
//! window moves them over at start-up (migration.rs). Design and migration
//! rules: docs/architecture/plugin-platform.md, P6.
//!
//! - model.rs: the data and its checks
//! - store.rs: atomic, read-back-checked writes of `todos.json`
//! - migration.rs: the one-time move out of localStorage, and re-imports
//! - service.rs: where the todos live now, and saving changes
//! - calls.rs: todo and note calls of plugins and the local API

mod calls;
mod migration;
mod model;
mod service;
mod store;
#[cfg(test)]
mod tests;

pub use migration::{LocalTodoKeys, TodosSnapshot};
pub use model::TodosData;
pub use service::{AppliedTodosChange, TodosChange};
pub(crate) use service::{call, init, wait_until_decided};

/// Moves the todo keys the island window read from localStorage into
/// todos.json (or confirms it is already done) and returns the data in use.
/// An error means the todos stay in localStorage for this run.
#[tauri::command]
pub async fn migrate_todos(keys: LocalTodoKeys, normalized: TodosData) -> Result<TodosSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || service::migrate(keys, normalized))
        .await
        .map_err(|error| format!("The migration task failed: {error}"))?
}

#[tauri::command]
pub fn get_todos_state() -> Result<TodosSnapshot, String> {
    service::current()
}

/// Saves fields the island window changed.
#[tauri::command]
pub async fn apply_todos_change(change: TodosChange) -> Result<AppliedTodosChange, String> {
    tauri::async_runtime::spawn_blocking(move || service::apply(&change))
        .await
        .map_err(|error| format!("The save task failed: {error}"))?
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::todos::migrate_todos,
            crate::todos::get_todos_state,
            crate::todos::apply_todos_change,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
