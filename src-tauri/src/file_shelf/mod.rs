//! File shelf: files dropped on the island, kept as path references (never copied)
//! so they can be dragged out, copied, opened or shown in Explorer later.

mod store;
#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Mutex, MutexGuard, OnceLock, PoisonError,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, WebviewWindow};

use crate::win32;
use store::*;

static FILE_SHELF: OnceLock<FileShelfService> = OnceLock::new();

static NEXT_ID: AtomicU64 = AtomicU64::new(0);

/// One stored entry. Mirrored by `FileShelfItem` in src/features/file-shelf/api.ts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileShelfItem {
    id: String,
    path: String,
    name: String,
    #[serde(default)]
    is_dir: bool,
    /// Bytes for a file; 0 for a folder, whose contents are not walked.
    #[serde(default)]
    size: u64,
    #[serde(default)]
    added_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileShelfEntry {
    #[serde(flatten)]
    item: FileShelfItem,
    /// The path no longer exists (moved, renamed or deleted). Worked out on each
    /// snapshot, never stored.
    missing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileShelfSnapshot {
    items: Vec<FileShelfEntry>,
}

struct FileShelfService {
    path: PathBuf,
    items: Mutex<Vec<FileShelfItem>>,
}

impl FileShelfService {
    fn items(&self) -> MutexGuard<'_, Vec<FileShelfItem>> {
        self.items.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn snapshot(&self) -> FileShelfSnapshot {
        snapshot_of(&self.items())
    }

    /// Applies `change`, saves the result and only then keeps it in memory.
    fn update(
        &self,
        change: impl FnOnce(Vec<FileShelfItem>) -> Vec<FileShelfItem>,
    ) -> Result<FileShelfSnapshot, String> {
        let mut items = self.items();
        let next = change(items.clone());
        save_items(&self.path, &next)?;
        *items = next;
        Ok(snapshot_of(&items))
    }

    fn path_of(&self, id: &str) -> Result<String, String> {
        self.items()
            .iter()
            .find(|item| item.id == id)
            .map(|item| item.path.clone())
            .ok_or_else(|| "This item is no longer on the shelf.".to_string())
    }

    /// Paths of `ids` that still exist, in shelf order. Only paths already on the
    /// shelf are ever handed to the shell.
    fn existing_paths(&self, ids: &[String]) -> Result<Vec<String>, String> {
        let paths: Vec<String> = self
            .items()
            .iter()
            .filter(|item| ids.contains(&item.id))
            .map(|item| item.path.clone())
            .filter(|path| Path::new(path).exists())
            .collect();
        if paths.is_empty() {
            return Err("These files no longer exist.".to_string());
        }
        Ok(paths)
    }
}

fn snapshot_of(items: &[FileShelfItem]) -> FileShelfSnapshot {
    FileShelfSnapshot {
        items: items
            .iter()
            .map(|item| FileShelfEntry {
                missing: !Path::new(&item.path).exists(),
                item: item.clone(),
            })
            .collect(),
    }
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if FILE_SHELF.get().is_some() {
        return Ok(());
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?
        .join(FILE_SHELF_FILE_NAME);
    let items = Mutex::new(load_items(&path));
    let _ = FILE_SHELF.set(FileShelfService { path, items });
    Ok(())
}

fn service() -> Result<&'static FileShelfService, String> {
    FILE_SHELF
        .get()
        .ok_or_else(|| "The file shelf is not initialized.".to_string())
}

fn current_unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

/// A new entry for an existing absolute path; `None` for anything else.
fn describe(path: &str, now: i64) -> Option<FileShelfItem> {
    let file_path = Path::new(path);
    if !file_path.is_absolute() {
        return None;
    }
    let metadata = fs::metadata(file_path).ok()?;
    let name = file_path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    Some(FileShelfItem {
        id: format!("{now:x}-{id:x}"),
        path: path.to_string(),
        name,
        is_dir: metadata.is_dir(),
        size: if metadata.is_dir() { 0 } else { metadata.len() },
        added_at: now,
    })
}

#[tauri::command]
pub async fn get_file_shelf() -> Result<FileShelfSnapshot, String> {
    Ok(service()?.snapshot())
}

#[tauri::command]
pub async fn add_file_shelf_paths(paths: Vec<String>) -> Result<FileShelfSnapshot, String> {
    let now = current_unix_millis();
    let added: Vec<FileShelfItem> = paths.iter().filter_map(|path| describe(path, now)).collect();
    service()?.update(|items| insert_items(items, added))
}

#[tauri::command]
pub async fn remove_file_shelf_item(id: String) -> Result<FileShelfSnapshot, String> {
    service()?.update(|mut items| {
        items.retain(|item| item.id != id);
        items
    })
}

#[tauri::command]
pub async fn clear_file_shelf() -> Result<FileShelfSnapshot, String> {
    service()?.update(|_| Vec::new())
}

/// Puts the files on the clipboard the way Explorer's Copy does, ready for Ctrl+V.
#[tauri::command]
pub async fn copy_file_shelf_items(ids: Vec<String>) -> Result<(), String> {
    let paths = service()?.existing_paths(&ids)?;
    let _clipboard = clipboard_win::Clipboard::new_attempts(10)
        .map_err(|error| format!("Failed to open the clipboard: {error}"))?;
    clipboard_win::raw::set_file_list_with(&paths, clipboard_win::options::DoClear)
        .map_err(|error| format!("Failed to copy the files: {error}"))
}

#[tauri::command]
pub async fn open_file_shelf_item(id: String) -> Result<(), String> {
    let path = service()?.path_of(&id)?;
    tauri_plugin_opener::open_path(&path, None::<&str>)
        .map_err(|error| format!("Failed to open {path}: {error}"))
}

#[tauri::command]
pub async fn reveal_file_shelf_item(id: String) -> Result<(), String> {
    let path = service()?.path_of(&id)?;
    tauri_plugin_opener::reveal_item_in_dir(&path)
        .map_err(|error| format!("Failed to show {path} in its folder: {error}"))
}

/// Drags the files out of the island; resolves once they are dropped or the drag
/// is cancelled, with a fresh snapshot (a Shift-drag may have moved them).
#[tauri::command]
pub async fn start_file_shelf_drag(
    window: WebviewWindow,
    ids: Vec<String>,
) -> Result<FileShelfSnapshot, String> {
    let paths = service()?.existing_paths(&ids)?;
    let (sender, receiver) = mpsc::channel();
    let target = window.clone();
    // The OLE drag loop has to run on the window's UI thread.
    window
        .run_on_main_thread(move || {
            let result = target
                .hwnd()
                .map_err(|error| error.to_string())
                .and_then(|hwnd| win32::ole::drag_files(hwnd, &paths));
            let _ = sender.send(result);
        })
        .map_err(|error| format!("Failed to start the drag: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || receiver.recv())
        .await
        .map_err(|error| format!("Failed to finish the drag: {error}"))?
        .map_err(|_| "The drag ended unexpectedly.".to_string())??;
    Ok(service()?.snapshot())
}
