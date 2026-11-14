//! History service, clipboard reads and writes, and the clipboard listener window.

use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose, Engine as _};
use image::RgbaImage;
use std::{
    borrow::Cow,
    fs,
    sync::{
        mpsc::{self, SyncSender},
        Mutex, OnceLock,
    },
    thread,
    time::Duration,
};
use tauri::{Emitter, Manager};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{WM_CLIPBOARDUPDATE, WM_HOTKEY},
};

use super::hotkey::{
    refresh_registered_hotkey, request_hotkey_refresh, unregister_current_hotkey,
    CLIPBOARD_HOTKEY_WINDOW, HOTKEY_EVENT, HOTKEY_ID, HOTKEY_REFRESH_MESSAGE,
};
use super::store::{
    create_item_id, encode_png, hash_bytes, make_thumbnail, preview_text,
    PersistedClipboardHistory, MAX_IMAGE_PNG_BYTES,
};
use super::{
    current_unix_millis, service, ClipboardHistoryImage, ClipboardHistoryItem,
    ClipboardHistoryItemKind, ClipboardHistoryService, ClipboardHistorySettings,
    ClipboardHistorySnapshot, ClipboardHistoryState, HISTORY_CHANGED_EVENT, MAIN_WINDOW_LABEL,
    MAX_NOTE_CHARACTERS, SHORT_DUPLICATE_WINDOW_MS,
};
use crate::win32::{
    self,
    message_window::{self, WindowMessages},
};

const POLL_INTERVAL: Duration = Duration::from_secs(2);

const CLIPBOARD_WRITE_RETRY_ATTEMPTS: usize = 8;

const CLIPBOARD_WRITE_RETRY_DELAY: Duration = Duration::from_millis(35);

static CLIPBOARD_NOTIFY_TX: OnceLock<Mutex<Option<SyncSender<()>>>> = OnceLock::new();

enum ClipboardCapture {
    Text {
        hash: String,
        text: String,
        preview: String,
    },
    Image {
        hash: String,
        width: usize,
        height: usize,
        rgba: Vec<u8>,
    },
}

impl ClipboardHistoryService {
    pub(super) fn snapshot(&self) -> Result<ClipboardHistorySnapshot, String> {
        let state = self.state.lock().map_err(|error| error.to_string())?;
        Ok(Self::snapshot_locked(&state))
    }

    pub(super) fn set_settings(
        &self,
        settings: ClipboardHistorySettings,
    ) -> Result<ClipboardHistorySnapshot, String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        state.settings = settings.normalized();
        self.enforce_limit_locked(&mut state);
        self.persist_locked(&state)?;
        let snapshot = Self::snapshot_locked(&state);
        drop(state);

        self.emit_changed();
        request_hotkey_refresh();
        Ok(snapshot)
    }

    pub(super) fn copy_item(&self, id: &str) -> Result<ClipboardHistorySnapshot, String> {
        let item = {
            let state = self.state.lock().map_err(|error| error.to_string())?;
            state
                .items
                .iter()
                .find(|item| item.id == id)
                .cloned()
                .ok_or_else(|| "Clipboard history item was not found.".to_string())?
        };

        match item.kind {
            ClipboardHistoryItemKind::Text => {
                let text = item
                    .text
                    .clone()
                    .ok_or_else(|| "Clipboard text item has no text.".to_string())?;
                write_clipboard_text(&text)?;
            }
            ClipboardHistoryItemKind::Image => {
                let image = item
                    .image
                    .as_ref()
                    .ok_or_else(|| "Clipboard image item has no image.".to_string())?;
                let rgba = image::open(&image.original_path)
                    .map_err(|error| format!("Failed to load clipboard image: {error}"))?
                    .to_rgba8();
                write_clipboard_image(rgba.width() as usize, rgba.height() as usize, &rgba)?;
            }
        }

        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        state.last_capture_hash = Some(item.hash.clone());
        if let Some(index) = state
            .items
            .iter()
            .position(|history_item| history_item.hash == item.hash)
        {
            let mut moved_item = state.items.remove(index);
            moved_item.copied_at = current_unix_millis();
            state.items.insert(0, moved_item);
            self.persist_locked(&state)?;
        }
        let snapshot = Self::snapshot_locked(&state);
        drop(state);

        self.emit_changed();
        Ok(snapshot)
    }

    pub(super) fn toggle_favorite(&self, id: &str) -> Result<ClipboardHistorySnapshot, String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        let item = state
            .items
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| "Clipboard history item was not found.".to_string())?;
        item.favorite = !item.favorite;
        self.persist_locked(&state)?;
        let snapshot = Self::snapshot_locked(&state);
        drop(state);

        self.emit_changed();
        Ok(snapshot)
    }

    pub(super) fn set_note(
        &self,
        id: &str,
        note: &str,
    ) -> Result<ClipboardHistorySnapshot, String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        let item = state
            .items
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| "Clipboard history item was not found.".to_string())?;
        item.note = note.trim().chars().take(MAX_NOTE_CHARACTERS).collect();
        self.persist_locked(&state)?;
        let snapshot = Self::snapshot_locked(&state);
        drop(state);

        self.emit_changed();
        Ok(snapshot)
    }

    pub(super) fn delete_item(&self, id: &str) -> Result<ClipboardHistorySnapshot, String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        if let Some(index) = state.items.iter().position(|item| item.id == id) {
            let item = state.items.remove(index);
            self.remove_item_files(&item);
            self.persist_locked(&state)?;
        }
        let snapshot = Self::snapshot_locked(&state);
        drop(state);

        self.emit_changed();
        Ok(snapshot)
    }

    pub(super) fn clear(&self) -> Result<ClipboardHistorySnapshot, String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        for item in state.items.iter().filter(|item| !item.favorite) {
            self.remove_item_files(item);
        }
        state.items.retain(|item| item.favorite);
        self.persist_locked(&state)?;
        let snapshot = Self::snapshot_locked(&state);
        drop(state);

        self.emit_changed();
        Ok(snapshot)
    }

    pub(super) fn delete_items(&self, ids: &[String]) -> Result<ClipboardHistorySnapshot, String> {
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        let original_order: Vec<String> = state.items.iter().map(|item| item.id.clone()).collect();
        let removed = super::selection::take_selected(&mut state.items, ids);
        if removed.is_empty() {
            return Ok(Self::snapshot_locked(&state));
        }
        if let Err(error) = self.persist_locked(&state) {
            state.items.extend(removed);
            state.items.sort_by_key(|item| original_order.iter().position(|id| id == &item.id));
            return Err(error);
        }
        for item in removed { self.remove_item_files(&item); }
        let snapshot = Self::snapshot_locked(&state);
        drop(state);
        self.emit_changed();
        Ok(snapshot)
    }

    pub(super) fn read_image(&self, id: &str) -> Result<String, String> {
        let path = {
            let state = self.state.lock().map_err(|error| error.to_string())?;
            state.items.iter().find(|item| item.id == id).and_then(|item| item.image.as_ref())
                .map(|image| image.original_path.clone())
                .ok_or_else(|| "Clipboard image was not found.".to_string())?
        };
        super::image_access::read_image(&self.image_dir, &path)
    }

    fn capture_current_clipboard(&self) {
        let settings = match self.state.lock() {
            Ok(state) => state.settings.clone(),
            Err(error) => {
                eprintln!("failed to lock clipboard history state: {error}");
                return;
            }
        };

        if !settings.enabled {
            return;
        }

        let capture = match read_clipboard_capture(settings.capture_images) {
            Ok(Some(capture)) => capture,
            Ok(None) => return,
            Err(error) => {
                eprintln!("failed to read clipboard: {error}");
                return;
            }
        };

        if let Err(error) = self.insert_capture(capture) {
            eprintln!("failed to store clipboard history item: {error}");
        }
    }

    fn insert_capture(&self, capture: ClipboardCapture) -> Result<(), String> {
        let now = current_unix_millis();
        let hash = capture.hash().to_string();
        let mut state = self.state.lock().map_err(|error| error.to_string())?;

        if state.last_capture_hash.as_deref() == Some(hash.as_str()) {
            return Ok(());
        }
        state.last_capture_hash = Some(hash.clone());

        if let Some(first) = state.items.first() {
            if first.hash == hash
                && now.saturating_sub(first.copied_at) <= SHORT_DUPLICATE_WINDOW_MS
            {
                return Ok(());
            }
        }

        if let Some(index) = state.items.iter().position(|item| item.hash == hash) {
            let mut item = state.items.remove(index);
            item.copied_at = now;
            state.items.insert(0, item);
            self.persist_locked(&state)?;
            drop(state);
            self.emit_changed();
            return Ok(());
        }

        let item = match capture {
            ClipboardCapture::Text {
                hash,
                text,
                preview,
            } => ClipboardHistoryItem {
                id: create_item_id(now, &hash),
                kind: ClipboardHistoryItemKind::Text,
                hash,
                created_at: now,
                copied_at: now,
                favorite: false,
                note: String::new(),
                preview,
                text: Some(text),
                image: None,
            },
            ClipboardCapture::Image {
                hash,
                width,
                height,
                rgba,
            } => {
                let image = self.persist_image(&hash, width, height, rgba)?;
                ClipboardHistoryItem {
                    id: create_item_id(now, &hash),
                    kind: ClipboardHistoryItemKind::Image,
                    hash,
                    created_at: now,
                    copied_at: now,
                    favorite: false,
                    note: String::new(),
                    preview: format!("{width} x {height} image"),
                    text: None,
                    image: Some(image),
                }
            }
        };

        state.items.insert(0, item);
        self.enforce_limit_locked(&mut state);
        self.persist_locked(&state)?;
        drop(state);

        self.emit_changed();
        Ok(())
    }

    fn persist_image(
        &self,
        hash: &str,
        width: usize,
        height: usize,
        rgba: Vec<u8>,
    ) -> Result<ClipboardHistoryImage, String> {
        let rgba_image = RgbaImage::from_raw(width as u32, height as u32, rgba)
            .ok_or_else(|| "Clipboard image data is invalid.".to_string())?;
        let original_bytes = encode_png(&rgba_image)?;

        if original_bytes.len() > MAX_IMAGE_PNG_BYTES {
            return Err("Clipboard image is larger than the history limit.".to_string());
        }

        let thumbnail = make_thumbnail(&rgba_image);
        let thumbnail_bytes = encode_png(&thumbnail)?;
        let safe_hash = hash.chars().take(24).collect::<String>();
        let original_path = self.image_dir.join(format!("{safe_hash}.png"));
        let thumbnail_path = self.image_dir.join(format!("{safe_hash}-thumb.png"));

        fs::write(&original_path, &original_bytes)
            .map_err(|error| format!("Failed to write clipboard image: {error}"))?;
        fs::write(&thumbnail_path, &thumbnail_bytes)
            .map_err(|error| format!("Failed to write clipboard image thumbnail: {error}"))?;

        Ok(ClipboardHistoryImage {
            width,
            height,
            byte_size: original_bytes.len() as u64,
            original_path: original_path.to_string_lossy().to_string(),
            thumbnail_path: thumbnail_path.to_string_lossy().to_string(),
            thumbnail_data_url: Some(format!(
                "data:image/png;base64,{}",
                general_purpose::STANDARD.encode(thumbnail_bytes)
            )),
        })
    }

    fn enforce_limit_locked(&self, state: &mut ClipboardHistoryState) {
        while state.items.len() > state.settings.max_items {
            let removal_index = state
                .items
                .iter()
                .rposition(|item| !item.favorite)
                .or_else(|| state.items.len().checked_sub(1));
            let Some(removal_index) = removal_index else {
                break;
            };

            let item = state.items.remove(removal_index);
            self.remove_item_files(&item);
        }
    }

    fn persist_locked(&self, state: &ClipboardHistoryState) -> Result<(), String> {
        let history = PersistedClipboardHistory {
            settings: state.settings.clone(),
            items: state.items.clone(),
        };
        let content = serde_json::to_string_pretty(&history)
            .map_err(|error| format!("Failed to serialize clipboard history: {error}"))?;
        fs::write(&self.history_path, content)
            .map_err(|error| format!("Failed to write clipboard history: {error}"))
    }

    fn remove_item_files(&self, item: &ClipboardHistoryItem) {
        if let Some(image) = &item.image {
            for path in [&image.original_path, &image.thumbnail_path] {
                if let Ok(path) = super::image_access::managed_path(&self.image_dir, path) {
                    let _ = fs::remove_file(path);
                }
            }
        }
    }

    fn snapshot_locked(state: &ClipboardHistoryState) -> ClipboardHistorySnapshot {
        ClipboardHistorySnapshot {
            settings: state.settings.clone(),
            items: state.items.clone(),
        }
    }

    /// Called after the state lock is released.
    fn emit_changed(&self) {
        let _ = self.app.emit(HISTORY_CHANGED_EVENT, ());
    }

    fn emit_shortcut(&self) {
        if let Some(window) = self.app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = window.show();
            crate::island::focus::focus_island_for_shortcut(&window);
        }

        let _ = self.app.emit(HOTKEY_EVENT, ());
    }
}

impl ClipboardCapture {
    fn hash(&self) -> &str {
        match self {
            Self::Text { hash, .. } | Self::Image { hash, .. } => hash,
        }
    }
}

fn read_clipboard_capture(capture_images: bool) -> Result<Option<ClipboardCapture>, String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;

    if let Ok(text) = clipboard.get_text() {
        if !text.trim().is_empty() {
            let hash = hash_bytes([b"text:", text.as_bytes()].concat().as_slice());
            return Ok(Some(ClipboardCapture::Text {
                hash,
                preview: preview_text(&text),
                text,
            }));
        }
    }

    if capture_images {
        if let Ok(image) = clipboard.get_image() {
            let mut hash_input = Vec::with_capacity(16 + image.bytes.len());
            hash_input.extend_from_slice(&image.width.to_le_bytes());
            hash_input.extend_from_slice(&image.height.to_le_bytes());
            hash_input.extend_from_slice(&image.bytes);
            let hash = hash_bytes(&hash_input);

            return Ok(Some(ClipboardCapture::Image {
                hash,
                width: image.width,
                height: image.height,
                rgba: image.bytes.into_owned(),
            }));
        }
    }

    Ok(None)
}

fn write_clipboard_text(text: &str) -> Result<(), String> {
    retry_clipboard_write("set clipboard text", || {
        Clipboard::new()
            .map_err(|error| format!("Failed to open clipboard: {error}"))?
            .set_text(text.to_owned())
            .map_err(|error| format!("Failed to set clipboard text: {error}"))
    })
}

fn write_clipboard_image(width: usize, height: usize, image: &RgbaImage) -> Result<(), String> {
    retry_clipboard_write("set clipboard image", || {
        Clipboard::new()
            .map_err(|error| format!("Failed to open clipboard: {error}"))?
            .set_image(ImageData {
                width,
                height,
                bytes: Cow::Owned(image.as_raw().clone()),
            })
            .map_err(|error| format!("Failed to set clipboard image: {error}"))
    })
}

fn retry_clipboard_write(
    action: &str,
    mut write: impl FnMut() -> Result<(), String>,
) -> Result<(), String> {
    let mut last_error = None;

    for attempt in 0..CLIPBOARD_WRITE_RETRY_ATTEMPTS {
        match write() {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);

                if attempt + 1 < CLIPBOARD_WRITE_RETRY_ATTEMPTS {
                    thread::sleep(CLIPBOARD_WRITE_RETRY_DELAY);
                }
            }
        }
    }

    Err(format!(
        "Failed to {action} after {CLIPBOARD_WRITE_RETRY_ATTEMPTS} attempts: {}",
        last_error.unwrap_or_else(|| "unknown error".to_string())
    ))
}

pub(super) fn start_workers() {
    // Clipboard reads can block while another process owns the clipboard. Keep at most one
    // pending read so a busy clipboard cannot build an unbounded backlog of work.
    let (tx, rx) = mpsc::sync_channel::<()>(1);
    let _ = CLIPBOARD_NOTIFY_TX.set(Mutex::new(Some(tx)));

    thread::spawn(move || {
        while rx.recv().is_ok() {
            if let Ok(service) = service() {
                service.capture_current_clipboard();
            }
        }
    });

    thread::spawn(|| {
        if let Err(error) = run_windows_clipboard_listener() {
            eprintln!("clipboard listener fell back to polling only: {error}");

            loop {
                thread::sleep(POLL_INTERVAL);
                notify_clipboard_changed();
            }
        }
    });
}

pub(super) fn notify_clipboard_changed() {
    if let Some(sender) = CLIPBOARD_NOTIFY_TX
        .get()
        .and_then(|sender| sender.lock().ok())
        .and_then(|sender| sender.as_ref().cloned())
    {
        let _ = sender.try_send(());
    }
}

fn run_windows_clipboard_listener() -> Result<(), String> {
    let class_name = "FocuSDClipboardHistoryListener";
    let instance = message_window::module_instance().map_err(|error| error.to_string())?;

    if message_window::register_class::<ClipboardWindow>(instance, class_name).is_err() {
        return Err("Failed to register clipboard listener window class.".to_string());
    }

    let hwnd = message_window::create_message_only_window(
        instance,
        class_name,
        "FocuSD Clipboard History Listener",
    )
    .map_err(|error| error.to_string())?;

    win32::clipboard::add_format_listener(hwnd).map_err(|error| error.to_string())?;
    if let Some(window) = CLIPBOARD_HOTKEY_WINDOW.get() {
        if let Ok(mut stored_window) = window.lock() {
            *stored_window = Some(hwnd.0 as isize);
        }
    } else {
        let _ = CLIPBOARD_HOTKEY_WINDOW.set(Mutex::new(Some(hwnd.0 as isize)));
    }
    refresh_registered_hotkey(hwnd);

    message_window::run_message_loop();

    unregister_current_hotkey(hwnd);
    let _ = win32::clipboard::remove_format_listener(hwnd);

    Ok(())
}

struct ClipboardWindow;

impl WindowMessages for ClipboardWindow {
    fn handle(hwnd: HWND, message: u32, wparam: WPARAM, _: LPARAM) -> Option<LRESULT> {
        if message == WM_CLIPBOARDUPDATE {
            notify_clipboard_changed();
            return Some(LRESULT(0));
        }

        if message == WM_HOTKEY && wparam.0 == HOTKEY_ID as usize {
            if let Ok(service) = service() {
                service.emit_shortcut();
            }
            return Some(LRESULT(0));
        }

        if message == HOTKEY_REFRESH_MESSAGE {
            refresh_registered_hotkey(hwnd);
            return Some(LRESULT(0));
        }

        None
    }
}
