use super::availability::{volume_root, Presence};
use super::store::*;
use super::FileShelfItem;

fn item(id: &str, path: &str) -> FileShelfItem {
    FileShelfItem {
        id: id.to_string(),
        path: path.to_string(),
        name: path.rsplit('\\').next().unwrap_or(path).to_string(),
        is_dir: false,
        size: 1,
        added_at: 0,
        pinned: false,
    }
}

fn ids(items: &[FileShelfItem]) -> Vec<&str> {
    items.iter().map(|item| item.id.as_str()).collect()
}

const DAY: i64 = 24 * 60 * 60 * 1_000;

fn aged(id: &str, path: &str, added_at: i64) -> FileShelfItem {
    FileShelfItem { added_at, ..item(id, path) }
}

#[test]
fn default_options_keep_everything_under_the_cap() {
    let items = vec![aged("a", r"C:\a.txt", 0), aged("b", r"C:\gone.txt", 0)];

    let kept = prune(items, FileShelfOptions::default(), 365 * DAY, |_| Presence::Missing);

    assert_eq!(ids(&kept), ["a", "b"]);
}

#[test]
fn entries_older_than_the_age_limit_are_dropped() {
    let now = 10 * DAY;
    let items = vec![aged("new", r"C:\new.txt", now - DAY), aged("old", r"C:\old.txt", now - 8 * DAY)];
    let options = FileShelfOptions { max_age_days: 7, ..FileShelfOptions::default() };

    assert_eq!(ids(&prune(items, options, now, |_| Presence::Present)), ["new"]);
}

#[test]
fn missing_files_are_dropped_only_when_asked() {
    let items = vec![item("a", r"C:\a.txt"), item("gone", r"C:\gone.txt")];
    let exists = |path: &str| if path.contains("gone") { Presence::Missing } else { Presence::Present };
    let options = FileShelfOptions { remove_missing: true, ..FileShelfOptions::default() };

    assert_eq!(ids(&prune(items.clone(), FileShelfOptions::default(), 0, exists)), ["a", "gone"]);
    assert_eq!(ids(&prune(items, options, 0, exists)), ["a"]);
}

#[test]
fn a_lower_cap_drops_the_oldest_and_the_cap_stays_in_range() {
    let items = (0..30).map(|index| item(&format!("{index}"), &format!(r"C:\{index}.txt"))).collect();
    let options = FileShelfOptions { max_items: 25, ..FileShelfOptions::default() };

    let kept = prune(items, options, 0, |_| Presence::Present);

    assert_eq!(kept.len(), 25);
    assert_eq!(kept[24].id, "24");
    let low = FileShelfOptions { max_items: 1, ..FileShelfOptions::default() }.normalized();
    let high = FileShelfOptions { max_items: 9_999, ..FileShelfOptions::default() }.normalized();
    assert_eq!((low.max_items, high.max_items), (MIN_MAX_ITEMS, MAX_MAX_ITEMS));
}

fn pinned(id: &str, path: &str) -> FileShelfItem {
    FileShelfItem { pinned: true, ..item(id, path) }
}

#[test]
fn pinned_entries_stay_on_top_and_skip_age_cleanup_and_the_cap() {
    let now = 40 * DAY;
    let mut items: Vec<FileShelfItem> = (0..25).map(|index| item(&format!("{index}"), &format!(r"C:\{index}.txt"))).collect();
    items.push(FileShelfItem { added_at: 0, ..pinned("old-pin", r"C:\pin.txt") });
    let options = FileShelfOptions { max_items: 20, max_age_days: 30, ..FileShelfOptions::default() };
    let items = items.into_iter().map(|item| FileShelfItem { added_at: if item.pinned { 0 } else { now }, ..item }).collect();

    let kept = prune(items, options, now, |_| Presence::Present);

    assert_eq!(kept[0].id, "old-pin");
    assert_eq!(kept.len(), 21);
}

#[test]
fn dropping_a_pinned_file_again_keeps_it_pinned() {
    let existing = vec![item("a", r"C:\a.txt"), pinned("p", r"C:\pin.txt")];
    let added = vec![item("p2", r"c:\PIN.txt"), item("n", r"C:\new.txt")];

    let items = insert_items(existing, added, MAX_ITEMS);

    assert_eq!(ids(&items), ["p2", "n", "a"]);
    assert!(items[0].pinned);
}

#[test]
fn unreachable_files_are_kept_even_when_missing_ones_are_removed() {
    let items = vec![item("share", r"\\nas\files\a.txt"), item("gone", r"C:\gone.txt")];
    let presence = |path: &str| if path.starts_with(r"\\") { Presence::Unreachable } else { Presence::Missing };
    let options = FileShelfOptions { remove_missing: true, ..FileShelfOptions::default() };

    assert_eq!(ids(&prune(items, options, 0, presence)), ["share"]);
}

#[test]
fn volume_roots_cover_drive_letters_and_shares() {
    assert_eq!(volume_root(r"C:\Users\Me\a.txt").as_deref(), Some(r"c:\"));
    assert_eq!(volume_root("d:/x/y").as_deref(), Some(r"d:\"));
    assert_eq!(volume_root(r"\\NAS\Files\docs\a.txt").as_deref(), Some(r"\\nas\files\"));
    assert_eq!(volume_root(r"\\nas"), None);
    assert_eq!(volume_root("relative.txt"), None);
}

#[test]
fn added_items_go_on_top_and_a_repeated_path_moves_up() {
    let existing = vec![item("a", r"C:\a.txt"), item("b", r"C:\b.txt")];
    let added = vec![item("c", r"C:\c.txt"), item("b2", r"c:/B.TXT")];

    let items = insert_items(existing, added, MAX_ITEMS);

    assert_eq!(ids(&items), ["c", "b2", "a"]);
}

#[test]
fn the_shelf_keeps_at_most_max_items_and_drops_the_oldest() {
    let existing = (0..MAX_ITEMS)
        .map(|index| item(&format!("old{index}"), &format!(r"C:\{index}.txt")))
        .collect();

    let items = insert_items(existing, vec![item("new", r"C:\new.txt")], MAX_ITEMS);

    assert_eq!(items.len(), MAX_ITEMS);
    assert_eq!(items[0].id, "new");
    assert!(!items.iter().any(|item| item.id == format!("old{}", MAX_ITEMS - 1)));
}

#[test]
fn stored_lists_skip_bad_entries_and_tolerate_older_fields() {
    let content = r#"{
        "items": [
            { "id": "a", "path": "C:\\a.txt", "name": "a.txt" },
            { "id": "b", "path": 42, "name": "broken" },
            { "id": "", "path": "C:\\empty-id.txt", "name": "x" },
            { "id": "c", "path": "C:\\A.txt", "name": "duplicate" }
        ]
    }"#;

    let items = parse_items(content);

    assert_eq!(ids(&items), ["a"]);
    assert_eq!(items[0].size, 0);
    assert!(!items[0].is_dir);
}

#[test]
fn unreadable_files_read_as_an_empty_shelf() {
    assert!(parse_items("not json").is_empty());
    assert!(parse_items("[]").is_empty());
    assert!(parse_items("{}").is_empty());
    assert!(load_items(std::path::Path::new(r"Z:\definitely\missing\file-shelf.json")).is_empty());
}

#[test]
fn saved_items_load_back_unchanged() {
    let directory = std::env::temp_dir().join(format!("fly-island-shelf-test-{}", std::process::id()));
    let path = directory.join(FILE_SHELF_FILE_NAME);
    let items = vec![item("a", r"C:\a.txt"), item("b", r"D:\folder")];

    save_items(&path, &items).expect("saving to a temp directory should work");
    let loaded = load_items(&path);
    let _ = std::fs::remove_dir_all(&directory);

    assert_eq!(loaded, items);
}

#[test]
fn path_keys_ignore_case_and_slash_style() {
    assert_eq!(path_key(r"C:\Users\Me\File.TXT"), path_key("c:/users/me/file.txt"));
}
