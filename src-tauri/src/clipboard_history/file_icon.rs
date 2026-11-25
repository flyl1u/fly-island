//! The Explorer icon of a file entry in the history, read on demand like its thumbnail. The
//! history JSON never carries it: a row asks once it is on screen, and the icon cache is the one
//! the file shelf uses (file_icons.rs).

use std::{fs, sync::OnceLock};

use super::{service, ClipboardHistoryService};
use crate::file_icons::FileIcons;

static ICONS: OnceLock<FileIcons> = OnceLock::new();

impl ClipboardHistoryService {
    /// The first file of an entry that holds files.
    fn first_file(&self, id: &str) -> Result<Option<String>, String> {
        let state = self.state.lock().map_err(|error| error.to_string())?;
        Ok(state
            .items
            .iter()
            .find(|item| item.id == id)
            .and_then(|item| item.files.as_ref())
            .and_then(|files| files.first().cloned()))
    }
}

/// The icon of `path` as a PNG data URL, or `None` when it is gone (the row keeps its generic
/// icon) or the shell has none. Whether it is a folder is read from the disk, which is also how
/// a moved or deleted file is told.
pub(super) fn icon_of(icons: &FileIcons, path: &str) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    icons.icon(path, metadata.is_dir(), true)
}

/// Explorer's icon for a file entry of the history, for its first file.
#[tauri::command]
pub async fn read_clipboard_history_file_icon(id: String) -> Result<Option<String>, String> {
    let Some(path) = service()?.first_file(&id)? else { return Ok(None) };
    tauri::async_runtime::spawn_blocking(move || icon_of(ICONS.get_or_init(FileIcons::default), &path))
        .await
        .map_err(|error| format!("Failed to read the file icon: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_has_no_icon_so_the_row_keeps_its_generic_one() {
        assert_eq!(icon_of(&FileIcons::default(), r"Z:\definitely\not\here\a.pdf"), None);
    }

    #[test]
    fn an_existing_file_and_folder_get_an_icon() {
        let icons = FileIcons::default();
        let dir = std::env::temp_dir();
        assert!(icon_of(&icons, &dir.to_string_lossy()).is_some_and(|url| url.starts_with("data:image/png;base64,")));
        let file = dir.join(format!("fly-island-icon-{}.txt", std::process::id()));
        std::fs::write(&file, "x").unwrap();
        let icon = icon_of(&icons, &file.to_string_lossy());
        let _ = std::fs::remove_file(&file);
        assert!(icon.is_some_and(|url| url.starts_with("data:image/png;base64,")));
    }
}
