//! Where the clipboard history lives: the app data folder, or a folder the user picked in
//! Settings → Clipboard. A small pointer file in the app data folder names the picked one,
//! since the history file itself moves with it.
//!
//! Moving copies first and switches last: the history and its images are copied and the
//! pointer written before anything old is removed, so a failure at any step leaves the
//! history where it was, whole.

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

use super::image_access::managed_path;
use super::store::{PersistedClipboardHistory, HISTORY_FILE_NAME, IMAGE_DIRECTORY_NAME};
use super::ClipboardHistoryService;

/// In the app data folder; listed in docs/architecture/contracts.md.
pub(super) const POINTER_FILE_NAME: &str = "clipboard-location.json";

#[derive(Serialize, Deserialize)]
struct Pointer {
    directory: String,
}

pub(super) struct StorageLocation {
    pub(super) history_path: PathBuf,
    pub(super) image_dir: PathBuf,
}

impl StorageLocation {
    pub(super) fn in_dir(directory: &Path) -> Self {
        Self { history_path: directory.join(HISTORY_FILE_NAME), image_dir: directory.join(IMAGE_DIRECTORY_NAME) }
    }

    fn directory(&self) -> PathBuf {
        self.history_path.parent().map(Path::to_path_buf).unwrap_or_default()
    }
}

/// Matches ClipboardStorageInfo in src/features/clipboard/api.ts.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardStorageInfo {
    directory: String,
    default_directory: String,
    is_default: bool,
}

/// The folder the pointer names, if it is still a usable absolute folder; otherwise the
/// history stays in (or falls back to) the app data folder.
pub(super) fn custom_directory(app_dir: &Path) -> Option<PathBuf> {
    let content = fs::read_to_string(app_dir.join(POINTER_FILE_NAME)).ok()?;
    let pointer: Pointer = serde_json::from_str(&content).ok()?;
    let directory = PathBuf::from(pointer.directory.trim());
    (directory.is_absolute() && fs::create_dir_all(directory.join(IMAGE_DIRECTORY_NAME)).is_ok()).then_some(directory)
}

fn write_pointer(app_dir: &Path, directory: Option<&Path>) -> Result<(), String> {
    let path = app_dir.join(POINTER_FILE_NAME);
    match directory {
        None => match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("无法更新剪贴板存储位置：{error}")),
        },
        Some(directory) => {
            let content = serde_json::to_string(&Pointer { directory: directory.to_string_lossy().to_string() })
                .map_err(|error| error.to_string())?;
            fs::write(&path, content).map_err(|error| format!("无法保存剪贴板存储位置：{error}"))
        }
    }
}

fn same_directory(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

impl ClipboardHistoryService {
    pub(super) fn history_path(&self) -> PathBuf {
        self.location.lock().map(|location| location.history_path.clone()).unwrap_or_default()
    }

    pub(super) fn image_dir(&self) -> PathBuf {
        self.location.lock().map(|location| location.image_dir.clone()).unwrap_or_default()
    }

    pub(super) fn storage_info(&self) -> Result<ClipboardStorageInfo, String> {
        let directory = self.location.lock().map_err(|error| error.to_string())?.directory();
        Ok(ClipboardStorageInfo {
            is_default: same_directory(&directory, &self.app_dir),
            directory: directory.to_string_lossy().to_string(),
            default_directory: self.app_dir.to_string_lossy().to_string(),
        })
    }

    /// Moves the history and its images to `target` (empty: back to the app data folder).
    pub(super) fn move_storage(&self, target: &str) -> Result<ClipboardStorageInfo, String> {
        let target = target.trim();
        let target = if target.is_empty() { self.app_dir.clone() } else { PathBuf::from(target) };
        if !target.is_absolute() {
            return Err("请填写完整的文件夹路径，例如 D:\\Fly Island\\Clipboard。".to_string());
        }
        // Lock order as everywhere else: the state, then the location.
        let mut state = self.state.lock().map_err(|error| error.to_string())?;
        let mut location = self.location.lock().map_err(|error| error.to_string())?;
        if same_directory(&target, &location.directory()) {
            drop((state, location));
            return self.storage_info();
        }
        let next = StorageLocation::in_dir(&target);
        fs::create_dir_all(&next.image_dir).map_err(|error| format!("无法创建剪贴板存储文件夹：{error}"))?;

        let mut items = state.items.clone();
        let mut copied: Vec<PathBuf> = Vec::new();
        let mut sources: Vec<PathBuf> = Vec::new();
        let undo = |copied: &[PathBuf]| copied.iter().for_each(|path| { let _ = fs::remove_file(path); });
        for image in items.iter_mut().filter_map(|item| item.image.as_mut()) {
            for stored in [&mut image.original_path, &mut image.thumbnail_path] {
                // An image already gone stays as it is; the history row shows it as unavailable.
                let Ok(source) = managed_path(&location.image_dir, stored) else { continue };
                let Some(name) = source.file_name() else { continue };
                let destination = next.image_dir.join(name);
                if let Err(error) = fs::copy(&source, &destination) {
                    undo(&copied);
                    return Err(format!("无法复制剪贴板图片：{error}"));
                }
                copied.push(destination.clone());
                sources.push(source);
                *stored = destination.to_string_lossy().to_string();
            }
        }
        let history = PersistedClipboardHistory { settings: state.settings.clone(), items: items.clone() };
        let written = serde_json::to_string_pretty(&history)
            .map_err(|error| error.to_string())
            .and_then(|content| fs::write(&next.history_path, content).map_err(|error| format!("无法写入新的剪贴板文件夹：{error}")));
        if let Err(error) = written {
            undo(&copied);
            return Err(error);
        }
        let pointed = if same_directory(&target, &self.app_dir) { None } else { Some(target.as_path()) };
        if let Err(error) = write_pointer(&self.app_dir, pointed) {
            undo(&copied);
            let _ = fs::remove_file(&next.history_path);
            return Err(error);
        }

        // Switched: the new copies are the history now; the old files can go.
        state.items = items;
        let previous = std::mem::replace(&mut *location, next);
        drop((state, location));
        let _ = fs::remove_file(&previous.history_path);
        sources.iter().for_each(|path| { let _ = fs::remove_file(path); });
        // Only removes the folder when nothing else is left in it.
        let _ = fs::remove_dir(&previous.image_dir);
        self.storage_info()
    }
}
