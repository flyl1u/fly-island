//! Thumbnails live only as PNG files next to the originals. The history JSON, rewritten on
//! every change, and the snapshot sent to every window used to carry each one inline as a
//! data URL, which reached tens of MB with 500 images; windows now read them one by one.

use base64::{engine::general_purpose, Engine as _};
use std::{fs, path::Path};

use super::ClipboardHistoryItem;

const PNG_DATA_URL_PREFIX: &str = "data:image/png;base64,";
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// Moves thumbnails that older versions kept inline in the history JSON out to their file,
/// returning whether any item changed. One that cannot be written stays inline, so it still shows.
pub(super) fn externalize_inline_thumbnails(items: &mut [ClipboardHistoryItem], image_dir: &Path) -> bool {
    let mut changed = false;
    for image in items.iter_mut().filter_map(|item| item.image.as_mut()) {
        let Some(data_url) = image.thumbnail_data_url.as_deref() else {
            continue;
        };
        if super::image_access::managed_path(image_dir, &image.thumbnail_path).is_ok() {
            image.thumbnail_data_url = None;
            changed = true;
            continue;
        }
        // The file is gone: write it back inside the image folder under its own name.
        let Some(name) = Path::new(&image.thumbnail_path).file_name().filter(|name| {
            Path::new(name).extension().is_some_and(|extension| extension == "png")
        }) else {
            continue;
        };
        let Some(bytes) = data_url
            .strip_prefix(PNG_DATA_URL_PREFIX)
            .and_then(|encoded| general_purpose::STANDARD.decode(encoded).ok())
            .filter(|bytes| bytes.starts_with(PNG_SIGNATURE))
        else {
            continue;
        };
        let path = image_dir.join(name);
        if fs::write(&path, bytes).is_ok() {
            image.thumbnail_path = path.to_string_lossy().to_string();
            image.thumbnail_data_url = None;
            changed = true;
        }
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard_history::{ClipboardHistoryImage, ClipboardHistoryItemKind};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn image_item(thumbnail_path: &Path, data_url: Option<String>) -> ClipboardHistoryItem {
        ClipboardHistoryItem {
            id: "id".into(),
            hash: "hash".into(),
            kind: ClipboardHistoryItemKind::Image,
            created_at: 0,
            copied_at: 0,
            favorite: false,
            note: String::new(),
            preview: String::new(),
            text: None,
            image: Some(ClipboardHistoryImage {
                width: 1,
                height: 1,
                byte_size: 1,
                original_path: String::new(),
                thumbnail_path: thumbnail_path.to_string_lossy().to_string(),
                thumbnail_data_url: data_url,
            }),
        }
    }

    #[test]
    fn inline_thumbnails_move_to_files_and_unwritable_ones_stay_inline() {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|time| time.as_nanos()).unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("clipboard-thumbs-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let png = [PNG_SIGNATURE, b"thumb"].concat();
        let inline = Some(format!("{PNG_DATA_URL_PREFIX}{}", general_purpose::STANDARD.encode(&png)));

        // Already on disk: just drop the inline copy.
        let existing = dir.join("a-thumb.png");
        fs::write(&existing, &png).unwrap();
        // Missing: written back from the inline copy, even when the old path pointed elsewhere.
        let moved = dir.join("elsewhere").join("b-thumb.png");
        let mut items = vec![
            image_item(&existing, inline.clone()),
            image_item(&moved, inline.clone()),
            image_item(&dir.join("c-thumb.png"), Some("data:image/png;base64,not-base64".into())),
            image_item(&dir.join("d-thumb.png"), None),
        ];
        assert!(externalize_inline_thumbnails(&mut items, &dir));
        let image = |items: &[ClipboardHistoryItem], index: usize| items[index].image.clone().unwrap();
        assert!(image(&items, 0).thumbnail_data_url.is_none());
        assert!(image(&items, 1).thumbnail_data_url.is_none());
        assert_eq!(fs::read(dir.join("b-thumb.png")).unwrap(), png);
        assert_eq!(Path::new(&image(&items, 1).thumbnail_path), dir.join("b-thumb.png"));
        assert!(image(&items, 2).thumbnail_data_url.is_some(), "a broken inline thumbnail is kept, not lost");
        assert!(!externalize_inline_thumbnails(&mut items[..2], &dir), "a second run changes nothing");

        // New history files leave the field out; files without it still load.
        let json = serde_json::to_string(&image(&items, 3)).unwrap();
        assert!(!json.contains("thumbnailDataUrl"));
        let back: ClipboardHistoryImage = serde_json::from_str(&json).unwrap();
        assert!(back.thumbnail_data_url.is_none());
        fs::remove_dir_all(dir).unwrap();
    }
}
