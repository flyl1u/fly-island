use serde_json::json;
use std::{fs, path::PathBuf};

use super::model::{is_date, validate, TodosData, TodosFile, FILE_VERSION};
use super::store::{load, save, write_new};

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
    assert!(load(&path).is_err());
    let mut newer = serde_json::to_value(sample()).expect("value");
    newer["version"] = json!(FILE_VERSION + 1);
    fs::write(&path, newer.to_string()).expect("write");
    assert!(load(&path).expect_err("newer").contains("newer"));
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
