//! Clipboard history: commands, item types and the background capture service.

mod hotkey;
mod image_access;
mod location;
mod selection;
mod service;
mod store;
mod thumbnails;

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Manager};

use service::{notify_clipboard_changed, start_workers};
pub(crate) use service::copy_transient_text;
use location::{custom_directory, ClipboardStorageInfo, StorageLocation};
use store::load_history;

pub(crate) use hotkey::parse_shortcut_binding;

const HISTORY_CHANGED_EVENT: &str = "clipboard-history-changed";

const MAIN_WINDOW_LABEL: &str = "main";

const DEFAULT_MAX_ITEMS: usize = 30;

const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+W";

// The default before Ctrl+Shift+W. Saved settings still holding it move to the new
// default; it also took over Cut (Ctrl+X) in every other program.
const LEGACY_DEFAULT_SHORTCUT: &str = "Ctrl+X";

const MIN_MAX_ITEMS: usize = 5;

const MAX_MAX_ITEMS: usize = 500;

const SHORT_DUPLICATE_WINDOW_MS: i64 = 2_000;

const MAX_NOTE_CHARACTERS: usize = 80;

static CLIPBOARD_HISTORY: OnceLock<ClipboardHistoryService> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistorySnapshot {
    settings: ClipboardHistorySettings,
    items: Vec<ClipboardHistoryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistorySettings {
    enabled: bool,
    capture_images: bool,
    max_items: usize,
    #[serde(default = "default_clipboard_shortcut")]
    shortcut: String,
    #[serde(default = "default_true")]
    shortcut_enabled: bool,
}

impl Default for ClipboardHistorySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            capture_images: true,
            max_items: DEFAULT_MAX_ITEMS,
            shortcut: default_clipboard_shortcut(),
            shortcut_enabled: true,
        }
    }
}

impl ClipboardHistorySettings {
    fn normalized(mut self) -> Self {
        self.max_items = self.max_items.clamp(MIN_MAX_ITEMS, MAX_MAX_ITEMS);
        // The default parses to its own label (see hotkey tests), so falling back
        // to the constant matches falling back to its parsed binding.
        self.shortcut = parse_shortcut_binding(&self.shortcut)
            .filter(|binding| binding.label != LEGACY_DEFAULT_SHORTCUT)
            .map_or_else(default_clipboard_shortcut, |binding| binding.label);
        self
    }
}

#[derive(Clone)]
pub(crate) struct ShortcutBinding {
    pub(crate) label: String,
    pub(crate) modifiers: u32,
    pub(crate) key_code: u32,
}

fn default_true() -> bool {
    true
}

fn default_clipboard_shortcut() -> String {
    DEFAULT_SHORTCUT.to_string()
}

/// Always `Some`: the constant is a valid shortcut (checked by a hotkey test).
fn default_shortcut_binding() -> Option<ShortcutBinding> {
    parse_shortcut_binding(DEFAULT_SHORTCUT)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ClipboardHistoryItemKind {
    Text,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistoryItem {
    id: String,
    kind: ClipboardHistoryItemKind,
    hash: String,
    created_at: i64,
    copied_at: i64,
    #[serde(default)]
    favorite: bool,
    #[serde(default)]
    note: String,
    preview: String,
    text: Option<String>,
    image: Option<ClipboardHistoryImage>,
    /// Files copied in Explorer (CF_HDROP). Such an item is kept as a text item whose text is
    /// the paths, one per line, so an older version that does not know files still reads
    /// the history (and pastes the paths) instead of discarding the whole file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    files: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistoryImage {
    width: usize,
    height: usize,
    byte_size: u64,
    original_path: String,
    thumbnail_path: String,
    /// Only in history files from before 3.1.0, until the first load moves it to its file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    thumbnail_data_url: Option<String>,
}

struct ClipboardHistoryState {
    settings: ClipboardHistorySettings,
    items: Vec<ClipboardHistoryItem>,
    last_capture_hash: Option<String>,
}

struct ClipboardHistoryService {
    app: AppHandle,
    /// The app data folder: the default location, and where the pointer to another one lives.
    app_dir: PathBuf,
    /// Changes when the user moves the history (location.rs); lock after `state`.
    location: Mutex<StorageLocation>,
    state: Mutex<ClipboardHistoryState>,
}

#[tauri::command]
pub fn get_clipboard_history() -> Result<ClipboardHistorySnapshot, String> {
    service()?.snapshot()
}

/// Why the clipboard shortcut could not be registered, or null when it is fine or off.
#[tauri::command]
pub fn get_clipboard_shortcut_error() -> Option<String> {
    hotkey::hotkey_error()
}

#[tauri::command]
pub fn set_clipboard_history_settings(
    settings: ClipboardHistorySettings,
) -> Result<ClipboardHistorySnapshot, String> {
    service()?.set_settings(settings)
}

/// Runs a history change off the main thread. These open the system clipboard (retrying
/// while another app holds it), decode images and write the history file; as plain commands
/// they ran on the main thread, and a clipboard or disk slow to answer (just after waking from
/// sleep) froze every island window with them (#76).
async fn off_main_thread(
    work: impl FnOnce(&ClipboardHistoryService) -> Result<ClipboardHistorySnapshot, String> + Send + 'static,
) -> Result<ClipboardHistorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || work(service()?))
        .await
        .map_err(|error| format!("Failed to join the clipboard history task: {error}"))?
}

#[tauri::command]
pub async fn copy_clipboard_history_item(id: String) -> Result<ClipboardHistorySnapshot, String> {
    off_main_thread(move |service| service.copy_item(&id)).await
}

#[tauri::command]
pub async fn toggle_clipboard_history_favorite(id: String) -> Result<ClipboardHistorySnapshot, String> {
    off_main_thread(move |service| service.toggle_favorite(&id)).await
}

#[tauri::command]
pub async fn set_clipboard_history_item_note(
    id: String,
    note: String,
) -> Result<ClipboardHistorySnapshot, String> {
    off_main_thread(move |service| service.set_note(&id, &note)).await
}

#[tauri::command]
pub async fn delete_clipboard_history_item(id: String) -> Result<ClipboardHistorySnapshot, String> {
    off_main_thread(move |service| service.delete_item(&id)).await
}

#[tauri::command]
pub async fn clear_clipboard_history() -> Result<ClipboardHistorySnapshot, String> {
    off_main_thread(|service| service.clear()).await
}

#[tauri::command]
pub async fn delete_clipboard_history_items(ids: Vec<String>) -> Result<ClipboardHistorySnapshot, String> {
    service()?.delete_items(&ids)
}

/// Where the history is stored, and the default (the app data folder).
#[tauri::command]
pub fn get_clipboard_storage_directory() -> Result<ClipboardStorageInfo, String> {
    service()?.storage_info()
}

/// Moves the history and its images to `directory`; empty moves them back to the default.
#[tauri::command]
pub async fn set_clipboard_storage_directory(directory: String) -> Result<ClipboardStorageInfo, String> {
    service()?.move_storage(&directory)
}

#[tauri::command]
pub async fn read_clipboard_history_image(id: String) -> Result<String, String> {
    service()?.read_image(&id)
}

#[tauri::command]
pub async fn read_clipboard_history_thumbnail(id: String) -> Result<String, String> {
    service()?.read_thumbnail(&id)
}

/// Keeps the shortcut's focus restoration while routing is decided by the main frontend.
#[tauri::command]
pub async fn show_clipboard_history_island(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Main island window was not found.".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    crate::island::focus::focus_island_for_shortcut(&window);
    Ok(())
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if CLIPBOARD_HISTORY.get().is_some() {
        return Ok(());
    }

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    // A folder the user picked that is gone (an unplugged drive) falls back to the app data
    // folder for this run, without forgetting the choice.
    let location = StorageLocation::in_dir(&custom_directory(&app_dir).unwrap_or_else(|| app_dir.clone()));

    fs::create_dir_all(&location.image_dir)
        .map_err(|error| format!("Failed to create clipboard history directory: {error}"))?;

    let mut persisted = load_history(&location.history_path);
    let moved_thumbnails = thumbnails::externalize_inline_thumbnails(&mut persisted.items, &location.image_dir);
    let service = ClipboardHistoryService {
        app: app.clone(),
        app_dir,
        location: Mutex::new(location),
        state: Mutex::new(ClipboardHistoryState {
            settings: persisted.settings.normalized(),
            items: persisted.items,
            last_capture_hash: None,
        }),
    };

    if moved_thumbnails {
        if let Err(error) = service.persist() {
            eprintln!("failed to save clipboard history without inline thumbnails: {error}");
        }
    }
    let _ = CLIPBOARD_HISTORY.set(service);
    start_workers();
    notify_clipboard_changed();
    Ok(())
}

fn service() -> Result<&'static ClipboardHistoryService, String> {
    CLIPBOARD_HISTORY
        .get()
        .ok_or_else(|| "Clipboard history service is not initialized.".to_string())
}

fn current_unix_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::clipboard_history::get_clipboard_history,
            crate::clipboard_history::set_clipboard_history_settings,
            crate::clipboard_history::get_clipboard_shortcut_error,
            crate::clipboard_history::copy_clipboard_history_item,
            crate::clipboard_history::toggle_clipboard_history_favorite,
            crate::clipboard_history::set_clipboard_history_item_note,
            crate::clipboard_history::delete_clipboard_history_item,
            crate::clipboard_history::clear_clipboard_history,
            crate::clipboard_history::delete_clipboard_history_items,
            crate::clipboard_history::read_clipboard_history_image,
            crate::clipboard_history::get_clipboard_storage_directory,
            crate::clipboard_history::set_clipboard_storage_directory,
            crate::clipboard_history::read_clipboard_history_thumbnail,
            crate::clipboard_history::show_clipboard_history_island,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::ClipboardHistorySettings;

    #[test]
    fn history_limit_keeps_default_and_accepts_five_hundred() {
        assert_eq!(ClipboardHistorySettings::default().max_items, 30);
        for (input, expected) in [(0, 5), (200, 200), (500, 500), (999, 500)] {
            let settings = ClipboardHistorySettings { max_items: input, ..Default::default() };
            assert_eq!(settings.normalized().max_items, expected);
        }
    }
}
