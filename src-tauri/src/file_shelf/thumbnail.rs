//! Small previews for image files on the shelf, decoded from the file itself.

use base64::{engine::general_purpose, Engine as _};
use image::{DynamicImage, ImageFormat, ImageReader};
use std::{
    collections::HashMap,
    fs,
    io::Cursor,
    path::Path,
    sync::{Mutex, PoisonError},
    time::SystemTime,
};

/// Longest side of a preview, in pixels; the row shows it at 38 css px, so this stays
/// sharp at up to 250% scaling.
const THUMBNAIL_SIDE: u32 = 96;
/// Larger files are not decoded: the preview is not worth the memory and time.
const MAX_SOURCE_BYTES: u64 = 40 * 1024 * 1024;
/// Cached previews; the cache is dropped as a whole once it grows past this.
const MAX_CACHED: usize = 256;

const IMAGE_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

/// Whether `path` looks like an image this module can preview, by extension.
pub(super) fn is_previewable(path: &str) -> bool {
    Path::new(path)
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .is_some_and(|extension| IMAGE_EXTENSIONS.contains(&extension.as_str()))
}

#[derive(Default)]
pub(super) struct Thumbnails {
    // Keyed by path and modification time, so an edited image gets a new preview.
    cache: Mutex<HashMap<(String, SystemTime), String>>,
}

impl Thumbnails {
    /// A PNG data URL previewing the image at `path`, or `None` when it is not an
    /// image, too large, or cannot be read or decoded.
    pub(super) fn preview(&self, path: &str) -> Option<String> {
        if !is_previewable(path) {
            return None;
        }
        let metadata = fs::metadata(path).ok()?;
        if !metadata.is_file() || metadata.len() > MAX_SOURCE_BYTES {
            return None;
        }
        let key = (path.to_lowercase(), metadata.modified().ok()?);
        if let Some(url) = self.lock().get(&key) {
            return Some(url.clone());
        }

        let url = render(path)?;
        let mut cache = self.lock();
        if cache.len() >= MAX_CACHED {
            cache.clear();
        }
        cache.insert(key, url.clone());
        Some(url)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<(String, SystemTime), String>> {
        self.cache.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

fn render(path: &str) -> Option<String> {
    let image = ImageReader::open(path).ok()?.with_guessed_format().ok()?.decode().ok()?;
    png_data_url(&image.thumbnail(THUMBNAIL_SIDE, THUMBNAIL_SIDE))
}

/// `image` as a PNG data URL.
pub(super) fn png_data_url(image: &DynamicImage) -> Option<String> {
    let mut bytes = Cursor::new(Vec::new());
    image.write_to(&mut bytes, ImageFormat::Png).ok()?;
    Some(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(bytes.into_inner())
    ))
}
