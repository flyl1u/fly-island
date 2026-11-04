use serde_json::json;
use std::{fs, path::PathBuf};

use super::model::{is_date, validate, TodosData, TodosFile, FILE_VERSION};
use super::store::{load, save, write_new, LoadError};

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("focusd-todos-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("temp dir");
    dir
}

fn sample() -> TodosFile {
    serde_json::from_value(json!({
        "version": FILE_VERSION,
        "revision": 3,
        "date": "2026-11-05",
        "todos": [{ "id": "a", "title": "写报告", "completed": false, "createdAt": 1762300000000u64 }],
        "scheduled": [{ "id": "s", "title": "later", "date": "2026-11-09", "createdAt": 0 }],
        "archives": [
            { "date": "2026-11-04", "todos": [], "dailyNote": "note", "savedAt": 0, "savedToDisk": false },
            { "date": "2026-11-03", "todos": [], "dailyNote": "", "savedAt": 1.5, "savedToDisk": true, "filePath": "D:\\x.md" }
        ],
        "dailyNote": "今天",
        "activeTodoId": "a"
    }))
    .expect("sample")
}

#[test]
fn todos_json_keeps_the_javascript_shape_and_numbers() {
    let file = sample();
    let text = serde_json::to_string(&file).expect("encode");
    assert!(text.contains("\"createdAt\":1762300000000"), "{text}");
    assert!(text.contains("\"savedAt\":1.5"));
    assert!(text.contains("\"activeTodoId\":\"a\""));
    // An archive without a file path has no filePath key, as in localStorage.
    assert_eq!(text.matches("filePath").count(), 1);
    let back: TodosFile = serde_json::from_str(&text).expect("decode");
    assert_eq!(back, file);
}

#[test]
fn validation_refuses_what_normalize_never_produces() {
    let base = sample().data;
    let broken = |change: fn(&mut TodosData)| {
        let mut data = base.clone();
        change(&mut data);
        validate(&data)
    };
    assert!(validate(&base).is_ok());
    assert!(broken(|data| data.todos[0].title = "  ".into()).is_err());
    assert!(broken(|data| data.todos[0].title = " padded".into()).is_err());
    assert!(broken(|data| data.todos[0].id.clear()).is_err());
    assert!(broken(|data| data.scheduled[0].date = "2026-02-30".into()).is_err());
    assert!(broken(|data| data.archives[0].date.clear()).is_err());
    assert!(broken(|data| data.active_todo_id = Some(String::new())).is_err());
    // The list's own date is kept as stored, whatever it is.
    assert!(broken(|data| data.date = "not a date".into()).is_ok());
}

#[test]
fn dates_are_real_calendar_days() {
    assert!(is_date("2024-02-29"));
    assert!(!is_date("2025-02-29"));
    assert!(is_date("2000-02-29"));
    assert!(!is_date("1900-02-29"));
    assert!(!is_date("2026-13-01"));
    assert!(!is_date("2026-1-01"));
    assert!(!is_date("2026-01-0a"));
}

#[test]
fn save_replaces_the_file_atomically_and_reads_it_back() {
    let dir = temp_dir("save");
    let path = dir.join("todos.json");
    assert_eq!(load(&path).expect("missing is fine"), None);
    let mut file = sample();
    save(&path, &file).expect("first save");
    file.revision += 1;
    file.data.daily_note = "changed".into();
    save(&path, &file).expect("second save");
    assert_eq!(load(&path).expect("load"), Some(file));
    assert!(!dir.join("todos.json.tmp").exists());
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn damaged_newer_or_invalid_files_are_errors_not_empty_data() {
    let dir = temp_dir("damaged");
    let path = dir.join("todos.json");
    fs::write(&path, "{ not json").expect("write");
    assert!(matches!(load(&path), Err(LoadError::Damaged(_))));
    let mut newer = serde_json::to_value(sample()).expect("value");
    newer["version"] = json!(FILE_VERSION + 1);
    // A newer format may change anything, even the shape of todos.
    newer["todos"] = json!({ "byId": {} });
    fs::write(&path, newer.to_string()).expect("write");
    assert!(matches!(load(&path), Err(LoadError::Newer(_))));
    let mut empty_title = serde_json::to_value(sample()).expect("value");
    empty_title["todos"][0]["title"] = json!("");
    fs::write(&path, empty_title.to_string()).expect("write");
    assert!(matches!(load(&path), Err(LoadError::Damaged(_))));
    let mut bad = sample();
    bad.data.todos[0].title = String::new();
    assert!(save(&path, &bad).is_err());
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn large_archives_round_trip() {
    let dir = temp_dir("large");
    let path = dir.join("todos.json");
    let mut file = sample();
    file.data.archives = (0..3000)
        .map(|day| {
            serde_json::from_value(json!({
                "date": format!("day-{day}"),
                "todos": (0..10).map(|n| json!({ "id": format!("{day}-{n}"), "title": format!("todo {n}"), "completed": n % 2 == 0, "createdAt": day * 10 + n })).collect::<Vec<_>>(),
                "dailyNote": "x".repeat(200),
                "savedAt": day,
                "savedToDisk": false
            }))
            .expect("archive")
        })
        .collect();
    save(&path, &file).expect("save");
    assert_eq!(load(&path).expect("load"), Some(file));
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn backups_never_overwrite() {
    let dir = temp_dir("backup");
    let path = dir.join("todos-migration-backup.json");
    write_new(&path, b"first").expect("first");
    assert!(write_new(&path, b"second").is_err());
    assert_eq!(fs::read_to_string(&path).expect("read"), "first");
    let _ = fs::remove_dir_all(dir);
}

mod migration_tests {
    use serde_json::json;
    use std::fs;

    use super::super::migration::{migrate, plan, source_hash, LocalTodoKeys, Plan};
    use super::super::model::TodosData;
    use super::super::service::{patched, TodosChange};
    use super::super::store::{load, LoadError};
    use super::{sample, temp_dir};

    fn keys(todos: &str) -> LocalTodoKeys {
        LocalTodoKeys { todos: Some(todos.into()), current_date: Some("2026-11-05".into()), ..Default::default() }
    }

    fn data(title: &str) -> TodosData {
        serde_json::from_value(json!({
            "date": "2026-11-05",
            "todos": [{ "id": "a", "title": title, "completed": false, "createdAt": 1 }],
            "scheduled": [], "archives": [], "dailyNote": "", "activeTodoId": null
        }))
        .expect("data")
    }

    fn backups(dir: &std::path::Path, prefix: &str) -> usize {
        fs::read_dir(dir).expect("list").filter(|entry| entry.as_ref().expect("entry").file_name().to_string_lossy().starts_with(prefix)).count()
    }

    #[test]
    fn the_plan_never_replaces_a_file_it_cannot_read_or_with_empty_storage() {
        let mut file = sample();
        file.migration = Some(serde_json::from_value(json!({ "version": 1, "fromAppVersion": "x", "at": 0, "sourceHash": "h" })).expect("migration"));
        let some = Ok(Some(file));
        assert_eq!(plan(&some, "h", false), Ok(Plan::UseFile));
        assert_eq!(plan(&some, "other", true), Ok(Plan::UseFile));
        assert_eq!(plan(&some, "other", false), Ok(Plan::Import { keep_old: true, reimport: true }));
        assert_eq!(plan(&Ok(None), "h", true), Ok(Plan::Import { keep_old: false, reimport: false }));
        assert_eq!(plan(&Err(LoadError::Damaged("x".into())), "h", false), Ok(Plan::Import { keep_old: true, reimport: false }));
        assert!(plan(&Err(LoadError::Newer("x".into())), "h", false).is_err());
        assert!(plan(&Err(LoadError::Unreadable("x".into())), "h", false).is_err());
    }

    #[test]
    fn the_source_hash_changes_with_any_key_and_tells_missing_from_empty() {
        let base = keys("[]");
        assert_eq!(source_hash(&base), source_hash(&keys("[]")));
        assert_ne!(source_hash(&base), source_hash(&keys("[ ]")));
        let mut note = base.clone();
        note.daily_note = Some(String::new());
        assert_ne!(source_hash(&base), source_hash(&note));
    }

    #[test]
    fn first_run_imports_and_backs_up_then_later_runs_keep_the_file() {
        let dir = temp_dir("migrate-first");
        let (file, notice) = migrate(&dir, &keys("[raw]"), data("one"), "0.3.0").expect("migrate");
        assert_eq!(notice, None);
        assert_eq!(file.revision, 0);
        assert_eq!(file.migration.as_ref().map(|m| m.from_app_version.as_str()), Some("0.3.0"));
        let backup: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("todos-migration-backup.json")).expect("backup")).expect("json");
        assert_eq!(backup["keys"]["focusd-island-todos"], "[raw]");
        assert_eq!(backup["keys"]["focusd-island-daily-note"], serde_json::Value::Null);

        // Same localStorage again (restart, or crash before the marker): the file wins,
        // even if the window would now normalize differently.
        let (again, notice) = migrate(&dir, &keys("[raw]"), data("ignored"), "0.3.0").expect("again");
        assert_eq!((again.data.todos[0].title.as_str(), notice), ("one", None));
        // Cleared localStorage keeps the file too.
        let (cleared, _) = migrate(&dir, &LocalTodoKeys::default(), data("ignored"), "0.3.0").expect("cleared");
        assert_eq!(cleared.data.todos[0].title, "one");
        assert_eq!(backups(&dir, "todos.before-reimport-"), 0);
        assert_eq!(backups(&dir, "todos-migration-backup"), 1);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn changes_from_an_older_version_are_reimported_after_a_backup() {
        let dir = temp_dir("migrate-reimport");
        migrate(&dir, &keys("[v1]"), data("one"), "0.3.0").expect("migrate");
        let before = fs::read_to_string(dir.join("todos.json")).expect("file");
        let (file, notice) = migrate(&dir, &keys("[changed in 0.2.14]"), data("two"), "0.3.0").expect("reimport");
        assert_eq!((file.data.todos[0].title.as_str(), file.revision, notice), ("two", 1, Some("reimported")));
        let copies: Vec<_> = fs::read_dir(&dir).expect("list").map(|e| e.expect("entry").path()).filter(|p| p.to_string_lossy().contains("before-reimport")).collect();
        assert_eq!(copies.len(), 1);
        assert_eq!(fs::read_to_string(&copies[0]).expect("copy"), before);
        // The first backup keeps its name and text; the new text gets its own file.
        assert_eq!(backups(&dir, "todos-migration-backup"), 2);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn damaged_files_are_kept_and_newer_or_bad_data_change_nothing() {
        let dir = temp_dir("migrate-damaged");
        fs::write(dir.join("todos.json"), "{ half").expect("write");
        let (file, notice) = migrate(&dir, &keys("[]"), data("one"), "0.3.0").expect("migrate");
        assert_eq!((file.data.todos.len(), notice), (1, None));
        assert_eq!(backups(&dir, "todos.before-reimport-"), 1);

        let newer = json!({ "version": 99, "anything": true }).to_string();
        fs::write(dir.join("todos.json"), &newer).expect("write");
        assert!(migrate(&dir, &keys("[x]"), data("two"), "0.3.0").is_err());
        assert_eq!(fs::read_to_string(dir.join("todos.json")).expect("file"), newer);

        let other = temp_dir("migrate-invalid");
        assert!(migrate(&other, &keys("[x]"), data(""), "0.3.0").is_err());
        assert!(matches!(load(&other.join("todos.json")), Ok(None)));
        let _ = fs::remove_dir_all(dir);
        let _ = fs::remove_dir_all(other);
    }

    #[test]
    fn changes_replace_only_the_fields_they_carry() {
        let base = data("one");
        let change: TodosChange = serde_json::from_value(json!({ "dailyNote": "n" })).expect("change");
        let next = patched(&base, &change);
        assert_eq!((next.daily_note.as_str(), next.todos.len()), ("n", 1));
        let mut active = base.clone();
        active.active_todo_id = Some("a".into());
        let cleared: TodosChange = serde_json::from_value(json!({ "activeTodoId": null })).expect("change");
        assert_eq!(patched(&active, &cleared).active_todo_id, None);
        let untouched: TodosChange = serde_json::from_value(json!({})).expect("change");
        assert_eq!(patched(&active, &untouched).active_todo_id.as_deref(), Some("a"));
    }
}
