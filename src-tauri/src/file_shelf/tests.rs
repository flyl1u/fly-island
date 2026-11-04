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
    }
}

fn ids(items: &[FileShelfItem]) -> Vec<&str> {
    items.iter().map(|item| item.id.as_str()).collect()
}

#[test]
fn added_items_go_on_top_and_a_repeated_path_moves_up() {
    let existing = vec![item("a", r"C:\a.txt"), item("b", r"C:\b.txt")];
    let added = vec![item("c", r"C:\c.txt"), item("b2", r"c:/B.TXT")];

    let items = insert_items(existing, added);

    assert_eq!(ids(&items), ["c", "b2", "a"]);
}

#[test]
fn the_shelf_keeps_at_most_max_items_and_drops_the_oldest() {
    let existing = (0..MAX_ITEMS)
        .map(|index| item(&format!("old{index}"), &format!(r"C:\{index}.txt")))
        .collect();

    let items = insert_items(existing, vec![item("new", r"C:\new.txt")]);

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
