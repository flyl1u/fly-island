//! The shelf list on disk (`file-shelf.json`) and the rules that keep it tidy.

use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

use super::{availability::Presence, FileShelfItem};

pub(super) const FILE_SHELF_FILE_NAME: &str = "file-shelf.json";

/// Default cap; the oldest entries drop off once the shelf holds more.
pub(super) const MAX_ITEMS: usize = 100;
/// Range of the item cap setting; matches MIN / MAX_SHELF_ITEMS in
/// src/features/appearance/settings.ts.
pub(super) const MIN_MAX_ITEMS: usize = 20;
pub(super) const MAX_MAX_ITEMS: usize = 200;

const DAY_MILLIS: i64 = 24 * 60 * 60 * 1_000;

/// Cleanup rules from the shelf's settings page. Mirrored by `FileShelfOptions` in
/// src/features/file-shelf/api.ts. Not stored here: the island sends them on start.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileShelfOptions {
    pub(super) max_items: usize,
    /// Entries added more than this many days ago are dropped; 0 keeps them.
    pub(super) max_age_days: u32,
    /// Entries whose file no longer exists are dropped instead of shown as missing.
    pub(super) remove_missing: bool,
}

impl Default for FileShelfOptions {
    fn default() -> Self {
        Self {
            max_items: MAX_ITEMS,
            max_age_days: 0,
            remove_missing: false,
        }
    }
}

impl FileShelfOptions {
    pub(super) fn normalized(mut self) -> Self {
        self.max_items = self.max_items.clamp(MIN_MAX_ITEMS, MAX_MAX_ITEMS);
        self
    }
}

#[derive(Deserialize)]
struct StoredFileShelf {
    #[serde(default)]
    items: Vec<serde_json::Value>,
}

#[derive(Serialize)]
struct StoredFileShelfRef<'a> {
    items: &'a [FileShelfItem],
}

/// The saved list, or an empty one when the file is missing or unreadable.
pub(super) fn load_items(path: &Path) -> Vec<FileShelfItem> {
    fs::read_to_string(path)
        .map(|content| parse_items(&content))
        .unwrap_or_default()
}

/// Entries that fail to parse are skipped one by one, so a single bad entry does
/// not empty the whole shelf. The user's cap is applied later, by `prune`.
pub(super) fn parse_items(content: &str) -> Vec<FileShelfItem> {
    let Ok(stored) = serde_json::from_str::<StoredFileShelf>(content) else {
        return Vec::new();
    };
    let items = stored
        .items
        .into_iter()
        .filter_map(|value| serde_json::from_value::<FileShelfItem>(value).ok())
        .filter(|item| !item.id.is_empty() && !item.path.is_empty())
        .collect();
    normalize(items, MAX_MAX_ITEMS)
}

/// `added` goes on top in the given order (below pinned entries). A path already on
/// the shelf moves up instead of appearing twice, and stays pinned if it was.
pub(super) fn insert_items(
    existing: Vec<FileShelfItem>,
    added: Vec<FileShelfItem>,
    max_items: usize,
) -> Vec<FileShelfItem> {
    let pinned: HashSet<String> = existing
        .iter()
        .filter(|item| item.pinned)
        .map(|item| path_key(&item.path))
        .collect();
    let added = added.into_iter().map(|mut item| {
        item.pinned = pinned.contains(&path_key(&item.path));
        item
    });
    normalize(added.chain(existing).collect(), max_items)
}

/// Applies the cleanup options: drops entries past the age limit, entries whose
/// file is known to be gone (when asked to; `presence` checks a path), and the
/// oldest ones over the cap. Pinned entries never age out or count toward the cap.
pub(super) fn prune(
    items: Vec<FileShelfItem>,
    options: FileShelfOptions,
    now: i64,
    presence: impl Fn(&str) -> Presence,
) -> Vec<FileShelfItem> {
    let max_age = i64::from(options.max_age_days) * DAY_MILLIS;
    let kept = items
        .into_iter()
        .filter(|item| item.pinned || max_age == 0 || now - item.added_at <= max_age)
        // An unreachable share or unplugged drive is not proof the file is gone.
        .filter(|item| !options.remove_missing || presence(&item.path) != Presence::Missing)
        .collect();
    normalize(kept, options.max_items)
}

/// Pinned entries first, then the rest, each in their own order; keeps the first
/// entry for each path and at most `max_items` unpinned entries.
fn normalize(items: Vec<FileShelfItem>, max_items: usize) -> Vec<FileShelfItem> {
    let mut seen = HashSet::new();
    let (pinned, rest): (Vec<_>, Vec<_>) = items
        .into_iter()
        .filter(|item| seen.insert(path_key(&item.path)))
        .partition(|item| item.pinned);
    pinned.into_iter().chain(rest.into_iter().take(max_items)).collect()
}

/// Windows paths are case-insensitive and accept either slash.
pub(super) fn path_key(path: &str) -> String {
    path.replace('/', "\\").to_lowercase()
}

pub(super) fn save_items(path: &Path, items: &[FileShelfItem]) -> Result<(), String> {
    let content = serde_json::to_string_pretty(&StoredFileShelfRef { items })
        .map_err(|error| format!("Failed to encode the file shelf: {error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }

    // Write beside the target and rename, so a crash never leaves half a file.
    let temporary_path = path.with_extension("tmp");
    fs::write(&temporary_path, content)
        .map_err(|error| format!("Failed to write {}: {error}", temporary_path.display()))?;
    fs::rename(&temporary_path, path)
        .or_else(|_| {
            fs::remove_file(path).ok();
            fs::rename(&temporary_path, path)
        })
        .map_err(|error| format!("Failed to replace {}: {error}", path.display()))
}
