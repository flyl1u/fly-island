//! On-disk history: JSON file, PNG images and thumbnails, item ids and previews.

use image::{imageops::FilterType, DynamicImage, ImageFormat, RgbaImage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Cursor,
    path::Path,
};

use super::*;

pub(super) const HISTORY_FILE_NAME: &str = "clipboard-history.json";

pub(super) const IMAGE_DIRECTORY_NAME: &str = "clipboard-images";

pub(super) const MAX_IMAGE_PNG_BYTES: usize = 10 * 1024 * 1024;

pub(super) const THUMBNAIL_MAX_SIDE: u32 = 128;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PersistedClipboardHistory {
    pub(super) settings: ClipboardHistorySettings,
    pub(super) items: Vec<ClipboardHistoryItem>,
}

impl Default for PersistedClipboardHistory {
    fn default() -> Self {
        Self {
            settings: ClipboardHistorySettings::default(),
            items: Vec::new(),
        }
    }
}

pub(super) fn load_history(history_path: &Path) -> PersistedClipboardHistory {
    fs::read_to_string(history_path)
        .ok()
        .and_then(|content| serde_json::from_str::<PersistedClipboardHistory>(&content).ok())
        .map(|mut history| {
            history.settings = history.settings.normalized();
            history.items.retain(|item| match item.kind {
                ClipboardHistoryItemKind::Text => {
                    item.text.as_ref().is_some_and(|text| !text.is_empty())
                }
                ClipboardHistoryItemKind::Image => item.image.is_some(),
            });
            history
        })
        .unwrap_or_default()
}

pub(super) fn encode_png(image: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(image.clone())
        .write_to(&mut bytes, ImageFormat::Png)
        .map_err(|error| format!("Failed to encode clipboard image: {error}"))?;
    Ok(bytes.into_inner())
}

pub(super) fn make_thumbnail(image: &RgbaImage) -> RgbaImage {
    let width = image.width().max(1);
    let height = image.height().max(1);
    let scale = (THUMBNAIL_MAX_SIDE as f32 / width.max(height) as f32).min(1.0);
    let thumbnail_width = ((width as f32 * scale).round() as u32).max(1);
    let thumbnail_height = ((height as f32 * scale).round() as u32).max(1);

    image::imageops::resize(
        image,
        thumbnail_width,
        thumbnail_height,
        FilterType::Lanczos3,
    )
}

pub(super) fn hash_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub(super) fn preview_text(text: &str) -> String {
    const PREVIEW_LIMIT: usize = 140;
    let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");

    if collapsed.chars().count() <= PREVIEW_LIMIT {
        return collapsed;
    }

    let mut preview = collapsed.chars().take(PREVIEW_LIMIT).collect::<String>();
    preview.push_str("...");
    preview
}

pub(super) fn create_item_id(timestamp: i64, hash: &str) -> String {
    let short_hash = hash.chars().take(12).collect::<String>();
    format!("{timestamp}-{short_hash}")
}
