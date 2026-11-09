//! Explorer's icon for each shelf entry, so a PDF looks like a PDF and a program like itself.

use std::{
    collections::HashMap,
    path::Path,
    sync::{Mutex, MutexGuard, PoisonError},
};

use image::{DynamicImage, RgbaImage};

use super::thumbnail::png_data_url;
use crate::win32::icon::{shell_icon, ShellIconSource};

/// Types whose icon is the file's own (a program's, a shortcut's target's), not its type's.
const OWN_ICON_EXTENSIONS: [&str; 8] = ["exe", "lnk", "ico", "url", "appref-ms", "msc", "cpl", "scr"];
/// Cached icons; the cache is dropped as a whole once it grows past this.
const MAX_CACHED: usize = 256;

/// What an entry's icon is looked up by: most share their type's icon, so it is fetched once.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub(super) enum IconKey {
    Folder,
    /// A lowercase extension, or "" for a file without one.
    FileType(String),
    /// A lowercase path, for types whose files each have their own icon.
    Item(String),
}

/// The key `path` looks its icon up by.
pub(super) fn icon_key(path: &str, is_dir: bool) -> IconKey {
    if is_dir {
        return IconKey::Folder;
    }
    let extension = Path::new(path)
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if OWN_ICON_EXTENSIONS.contains(&extension.as_str()) {
        IconKey::Item(path.to_lowercase())
    } else {
        IconKey::FileType(extension)
    }
}

#[derive(Default)]
pub(super) struct FileIcons {
    cache: Mutex<HashMap<IconKey, Option<String>>>,
}

impl FileIcons {
    /// A PNG data URL of the entry's Explorer icon, or `None` when the shell has none. Only
    /// programs and shortcuts read the disk, and only while `available`; any other entry is
    /// looked up by its type, so an unreachable drive never stalls it.
    pub(super) fn icon(&self, path: &str, is_dir: bool, available: bool) -> Option<String> {
        let key = icon_key(path, is_dir);
        if let Some(url) = self.lock().get(&key) {
            return url.clone();
        }
        let pixels = match &key {
            IconKey::Folder => shell_icon("folder", ShellIconSource::Folder),
            IconKey::FileType(extension) => shell_icon(&format!("file.{extension}"), ShellIconSource::FileType),
            IconKey::Item(_) if available => shell_icon(path, ShellIconSource::Item),
            IconKey::Item(_) => return None,
        };
        let url = pixels.and_then(|icon| {
            let image = RgbaImage::from_raw(icon.width, icon.height, icon.rgba)?;
            png_data_url(&DynamicImage::ImageRgba8(image))
        });
        let mut cache = self.lock();
        if cache.len() >= MAX_CACHED {
            cache.clear();
        }
        cache.insert(key, url.clone());
        url
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<IconKey, Option<String>>> {
        self.cache.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
