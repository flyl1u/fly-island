//! Clipboard history: commands, item types and the background capture service.

mod hotkey;
mod service;
mod store;

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Manager};

use service::{notify_clipboard_changed, start_workers};
use store::{load_history, HISTORY_FILE_NAME, IMAGE_DIRECTORY_NAME};

pub(crate) use hotkey::parse_shortcut_binding;

const HISTORY_CHANGED_EVENT: &str = "clipboard-history-changed";

const MAIN_WINDOW_LABEL: &str = "main";

const DEFAULT_MAX_ITEMS: usize = 30;

const DEFAULT_SHORTCUT: &str = "Ctrl+Shift+W";

// The default before Ctrl+Shift+W. Saved settings still holding it move to the new
// default; it also took over Cut (Ctrl+X) in every other program.
const LEGACY_DEFAULT_SHORTCUT: &str = "Ctrl+X";

const MIN_MAX_ITEMS: usize = 5;

const MAX_MAX_ITEMS: usize = 200;

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistoryImage {
    width: usize,
    height: usize,
    byte_size: u64,
    original_path: String,
    thumbnail_path: String,
    thumbnail_data_url: Option<String>,
}

struct ClipboardHistoryState {
    settings: ClipboardHistorySettings,
    items: Vec<ClipboardHistoryItem>,
    last_capture_hash: Option<String>,
}

struct ClipboardHistoryService {
    app: AppHandle,
    history_path: PathBuf,
    image_dir: PathBuf,
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

#[tauri::command]
pub fn copy_clipboard_history_item(id: String) -> Result<ClipboardHistorySnapshot, String> {
    service()?.copy_item(&id)
}

#[tauri::command]
pub fn toggle_clipboard_history_favorite(id: String) -> Result<ClipboardHistorySnapshot, String> {
    service()?.toggle_favorite(&id)
}

#[tauri::command]
pub fn set_clipboard_history_item_note(
    id: String,
    note: String,
) -> Result<ClipboardHistorySnapshot, String> {
    service()?.set_note(&id, &note)
}

#[tauri::command]
pub fn delete_clipboard_history_item(id: String) -> Result<ClipboardHistorySnapshot, String> {
    service()?.delete_item(&id)
}

#[tauri::command]
pub fn clear_clipboard_history() -> Result<ClipboardHistorySnapshot, String> {
    service()?.clear()
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    if CLIPBOARD_HISTORY.get().is_some() {
        return Ok(());
    }

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    let history_path = app_dir.join(HISTORY_FILE_NAME);
    let image_dir = app_dir.join(IMAGE_DIRECTORY_NAME);

    fs::create_dir_all(&image_dir)
        .map_err(|error| format!("Failed to create clipboard history directory: {error}"))?;

    let persisted = load_history(&history_path);
    let service = ClipboardHistoryService {
        app: app.clone(),
        history_path,
        image_dir,
        state: Mutex::new(ClipboardHistoryState {
            settings: persisted.settings.normalized(),
            items: persisted.items,
            last_capture_hash: None,
        }),
    };

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
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
