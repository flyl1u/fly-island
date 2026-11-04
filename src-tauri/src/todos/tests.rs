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

mod call_tests {
    use serde_json::{json, Value};

    use super::super::calls::{new_todo_id, run, todos_reason};
    use super::super::model::TodosData;
    use super::super::service::{changed_fields, without_conflicts, OutsideChanges, TodosChange};

    fn data() -> TodosData {
        serde_json::from_value(json!({
            "date": "2026-11-05",
            "todos": [
                { "id": "a", "title": "first", "completed": false, "createdAt": 1 },
                { "id": "b", "title": "second", "completed": false, "createdAt": 2 }
            ],
            "scheduled": [{ "id": "s", "title": "later", "date": "2026-11-20", "createdAt": 5 }],
            "archives": [], "dailyNote": "", "activeTodoId": "a"
        }))
        .expect("data")
    }

    fn call(method: &str, params: Value) -> Result<(Value, Option<TodosData>), (u16, String)> {
        run(method, &params, &data(), "new-id", 99).map(|outcome| (outcome.result, outcome.next))
    }

    #[test]
    fn list_and_get_change_nothing() {
        let (list, next) = call("todos.list", Value::Null).expect("list");
        assert_eq!(next, None);
        assert_eq!(list["activeTodoId"], "a");
        assert_eq!(list["scheduled"][0]["id"], "s");
        assert_eq!(call("note.get", json!({})).expect("note").0, json!({ "date": "2026-11-05", "note": "" }));
    }

    #[test]
    fn add_puts_todos_on_top_or_on_a_later_day() {
        let (todo, next) = call("todos.add", json!({ "title": "  new  " })).expect("add");
        assert_eq!(todo, json!({ "id": "new-id", "title": "new", "completed": false, "createdAt": 99 }));
        assert_eq!(next.expect("next").todos[0].id, "new-id");
        let (later, next) = call("todos.add", json!({ "title": "x", "date": "2026-11-10" })).expect("later");
        assert_eq!(later["date"], "2026-11-10");
        let next = next.expect("next");
        assert_eq!(next.scheduled.iter().map(|todo| todo.id.as_str()).collect::<Vec<_>>(), vec!["new-id", "s"]);
        assert_eq!(next.todos.len(), 2);
        let today = call("todos.add", json!({ "title": "x", "date": "2026-11-05" })).expect("today").1.expect("next");
        assert_eq!(today.todos.len(), 3);
    }

    #[test]
    fn add_refuses_bad_titles_and_dates() {
        for params in [json!({}), json!({ "title": "   " }), json!({ "title": 5 }), json!({ "title": "x".repeat(501) })] {
            assert!(call("todos.add", params).expect_err("title").1.contains("title"));
        }
        // 500 characters is fine, counted like JavaScript (an emoji is two).
        assert!(call("todos.add", json!({ "title": "x".repeat(500) })).is_ok());
        assert!(call("todos.add", json!({ "title": "😀".repeat(251) })).is_err());
        assert_eq!(call("todos.add", json!({ "title": "x", "date": "2026-1-5" })).expect_err("date").0, 400);
        assert_eq!(call("todos.add", json!({ "title": "x", "date": "2026-02-30" })).expect_err("date").0, 400);
        assert!(call("todos.add", json!({ "title": "x", "date": "2026-11-01" })).expect_err("past").1.contains("2026-11-05"));
    }

    #[test]
    fn update_and_remove_find_the_todo_and_clear_the_active_one() {
        assert_eq!(call("todos.update", json!({ "id": "zzz" })).expect_err("missing").0, 404);
        assert_eq!(call("todos.update", json!({ "id": 1 })).expect_err("number id").0, 404);
        assert_eq!(call("todos.update", json!({ "id": "a", "title": "" })).expect_err("title").0, 400);
        assert_eq!(call("todos.update", json!({ "id": "a", "completed": "yes" })).expect_err("bool").0, 400);
        let (todo, next) = call("todos.update", json!({ "id": "a", "title": " renamed ", "completed": true })).expect("update");
        assert_eq!((todo["title"].clone(), todo["completed"].clone()), (json!("renamed"), json!(true)));
        assert_eq!(next.expect("next").active_todo_id, None);
        let (_, next) = call("todos.update", json!({ "id": "b", "completed": true })).expect("other");
        assert_eq!(next.expect("next").active_todo_id.as_deref(), Some("a"));

        assert_eq!(call("todos.remove", json!({ "id": "zzz" })).expect_err("missing").0, 404);
        let (removed, next) = call("todos.remove", json!({ "id": "a" })).expect("remove");
        assert_eq!(removed, json!({ "id": "a" }));
        let next = next.expect("next");
        assert_eq!((next.todos.len(), next.active_todo_id), (1, None));
    }

    #[test]
    fn notes_are_replaced_or_appended_line_by_line() {
        let note = |params: Value| call("note.set", params).map(|(result, next)| (result["note"].clone(), next.expect("next").daily_note));
        assert_eq!(note(json!({ "note": "a\nb" })).expect("set").1, "a\nb");
        assert_eq!(note(json!({ "append": "line" })).expect("append").1, "line");
        for bad in [json!({}), json!({ "note": "a", "append": "b" }), json!({ "note": 1 })] {
            assert_eq!(call("note.set", bad).expect_err("bad").0, 400);
        }
        let mut with_note = data();
        with_note.daily_note = "first".into();
        let next = run("note.set", &json!({ "append": "second" }), &with_note, "", 0).expect("append").next.expect("next");
        assert_eq!(next.daily_note, "first\nsecond");
        let next = run("note.set", &json!({ "append": "" }), &with_note, "", 0).expect("empty").next.expect("next");
        assert_eq!(next.daily_note, "first");
    }

    #[test]
    fn the_reason_says_what_happened_to_the_todos() {
        let old = data();
        let changed = |change: fn(&mut TodosData)| {
            let mut new = data();
            change(&mut new);
            todos_reason(&old, &new)
        };
        assert_eq!(changed(|_| {}), None);
        assert_eq!(changed(|d| d.daily_note = "x".into()), None);
        assert_eq!(changed(|d| d.date = "2026-11-06".into()), Some("dayChanged"));
        assert_eq!(
            changed(|d| {
                let mut todo = d.todos[0].clone();
                todo.id = "c".into();
                d.todos.push(todo);
            }),
            Some("add")
        );
        assert_eq!(changed(|d| { d.todos.remove(0); }), Some("remove"));
        assert_eq!(changed(|d| d.todos.swap(0, 1)), Some("reorder"));
        assert_eq!(changed(|d| d.todos[0].completed = true), Some("update"));
        assert_eq!(changed(|d| d.active_todo_id = None), Some("update"));
        assert_eq!(changed(|d| d.scheduled.clear()), Some("remove"));
    }

    #[test]
    fn island_saves_keep_fields_a_plugin_changed_after_the_window_saw_them() {
        let outside = OutsideChanges { todos: 7, scheduled: 0, daily_note: 3, active_todo_id: 0 };
        let change = |base: Option<u64>| TodosChange {
            base_revision: base,
            todos: Some(vec![]),
            daily_note: Some("n".into()),
            date: Some("2026-11-06".into()),
            ..Default::default()
        };
        let (kept, conflicts) = without_conflicts(&change(Some(5)), &outside);
        assert_eq!(conflicts, vec!["todos"]);
        assert!(kept.todos.is_none() && kept.daily_note.is_some() && kept.date.is_some());
        let (kept, conflicts) = without_conflicts(&change(Some(2)), &outside);
        assert_eq!(conflicts, vec!["todos", "dailyNote"]);
        assert!(kept.daily_note.is_none());
        let (kept, conflicts) = without_conflicts(&change(Some(7)), &outside);
        assert!(conflicts.is_empty() && kept.todos.is_some());
        assert!(without_conflicts(&change(None), &outside).1.is_empty());
        let mut later = super::super::model::TodosData { daily_note: "x".into(), ..data() };
        later.todos.clear();
        assert_eq!(changed_fields(&data(), &later), vec!["todos", "dailyNote"]);
    }

    #[test]
    fn new_ids_look_like_crypto_random_uuid() {
        let id = new_todo_id().expect("id");
        assert_eq!(id.len(), 36);
        assert_eq!(&id[14..15], "4");
        assert!("89ab".contains(&id[19..20]));
        assert_ne!(id, new_todo_id().expect("id"));
    }
}
