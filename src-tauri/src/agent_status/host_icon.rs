//! Icons of the programs agent sessions run in, as PNG data URLs, cached by executable path.

use std::{
    collections::HashMap,
    io::Cursor,
    path::Path,
    sync::{Mutex, PoisonError},
};

use base64::{engine::general_purpose, Engine as _};
use image::{ImageFormat, RgbaImage};

use crate::win32;

static ICONS: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);
/// Distinct executables cached at most; the cache is dropped as a whole past this.
const MAX_CACHED: usize = 64;

/// Whether `path` may be asked for an icon: an existing absolute `.exe` file. The page only
/// passes paths the island itself reported as session hosts.
pub(super) fn is_icon_source(path: &str) -> bool {
    let path = Path::new(path);
    path.is_absolute()
        && path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        && path.is_file()
}

/// The icon of the executable at `path` as a PNG data URL, or `None` when it has none.
pub(super) fn icon_data_url(path: &str) -> Option<String> {
    if !is_icon_source(path) {
        return None;
    }
    let key = path.to_lowercase();
    if let Some(cached) = ICONS
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_ref()
        .and_then(|icons| icons.get(&key))
    {
        return cached.clone();
    }
    let url = win32::icon::exe_icon(path).and_then(|icon| {
        let image = RgbaImage::from_raw(icon.width, icon.height, icon.rgba)?;
        let mut png = Cursor::new(Vec::new());
        image.write_to(&mut png, ImageFormat::Png).ok()?;
        Some(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(png.into_inner())))
    });
    let mut guard = ICONS.lock().unwrap_or_else(PoisonError::into_inner);
    let icons = guard.get_or_insert_with(HashMap::new);
    if icons.len() >= MAX_CACHED {
        icons.clear();
    }
    icons.insert(key, url.clone());
    url
}
