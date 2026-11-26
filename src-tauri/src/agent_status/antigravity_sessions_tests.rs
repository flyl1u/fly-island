use rusqlite::Connection;

use super::*;

const COLUMNS: &str = "conversation_id TEXT PRIMARY KEY, title TEXT, preview TEXT, step_count INTEGER,
    last_modified_time TEXT, workspace_uris TEXT, status TEXT, killed INTEGER, not_fully_idle INTEGER,
    last_user_input_time TEXT";

const NOW_TEXT: &str = "2026-11-25 02:08:14.3478495+00:00";

fn database() -> Connection {
    let db = Connection::open_in_memory().expect("open an in-memory database");
    db.execute_batch(&format!("CREATE TABLE conversation_summaries ({COLUMNS})")).expect("create the table");
    db
}

struct Row<'a> {
    id: &'a str,
    title: &'a str,
    steps: i64,
    changed: &'a str,
    status: &'a str,
    killed: i64,
    not_idle: i64,
    uris: &'a str,
}

fn insert(db: &Connection, row: Row<'_>) {
    db.execute(
        "INSERT INTO conversation_summaries VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            row.id,
            row.title,
            row.title,
            row.steps,
            row.changed,
            row.uris,
            row.status,
            row.killed,
            row.not_idle,
            row.changed,
        ],
    )
    .expect("insert a conversation");
}

fn now() -> i64 {
    parse_timestamp_ms(NOW_TEXT).expect("parse the sample time")
}

#[test]
fn reads_titles_folders_and_phases() {
    let db = database();
    let two_hours = 2 * 60 * 60 * 1000;
    insert(&db, Row {
        id: "idle-one",
        title: "Fix the build",
        steps: 14,
        changed: NOW_TEXT,
        status: "CASCADE_RUN_STATUS_IDLE",
        killed: 0,
        not_idle: 0,
        uris: r#"["file:///d%3A/Project/A-tsq/business"]"#,
    });
    insert(&db, Row {
        id: "killed-one",
        title: "Migrate the schema",
        steps: 8,
        changed: NOW_TEXT,
        status: "CASCADE_RUN_STATUS_IDLE",
        killed: 1,
        not_idle: 0,
        uris: "",
    });
    insert(&db, Row {
        id: "running-one",
        title: "Write the docs",
        steps: 5,
        changed: NOW_TEXT,
        status: "CASCADE_RUN_STATUS_RUNNING",
        killed: 0,
        not_idle: 1,
        uris: "",
    });

    let sessions = read(&db, now(), two_hours, Some("Antigravity.exe".to_string()));
    assert_eq!(sessions.len(), 3);

    let idle = sessions.iter().find(|session| session.session_id == "idle-one").expect("the idle conversation");
    assert_eq!(idle.phase, "completed");
    assert_eq!(idle.title.as_deref(), Some("Fix the build"));
    assert_eq!(idle.cwd.as_deref(), Some(r"D:\Project\A-tsq\business"));
    assert!(idle.turn_started_at.is_some());

    let killed = sessions.iter().find(|session| session.session_id == "killed-one").expect("the killed conversation");
    assert_eq!(killed.phase, "failed");

    let running = sessions.iter().find(|session| session.session_id == "running-one").expect("the running conversation");
    assert_eq!(running.phase, "running");
    assert_eq!(running.cwd, None, "no workspace reads as no folder");
}

#[test]
fn skips_conversations_outside_the_window_and_untouched_ones() {
    let db = database();
    let two_hours = 2 * 60 * 60 * 1000;
    insert(&db, Row {
        id: "too-old",
        title: "Old work",
        steps: 3,
        changed: "2026-11-20 02:00:00+00:00",
        status: "CASCADE_RUN_STATUS_IDLE",
        killed: 0,
        not_idle: 0,
        uris: "",
    });
    insert(&db, Row {
        id: "never-used",
        title: "",
        steps: 0,
        changed: NOW_TEXT,
        status: "CASCADE_RUN_STATUS_IDLE",
        killed: 0,
        not_idle: 0,
        uris: "",
    });

    assert!(read(&db, now(), two_hours, None).is_empty());
}

#[test]
fn a_silent_run_goes_stale() {
    let db = database();
    let two_hours = 2 * 60 * 60 * 1000;
    insert(&db, Row {
        id: "quiet",
        title: "Long task",
        steps: 20,
        changed: NOW_TEXT,
        status: "CASCADE_RUN_STATUS_RUNNING",
        killed: 0,
        not_idle: 1,
        uris: "",
    });

    let later = now() + AGENT_RUNNING_STALE_AFTER_MS + 60_000;
    let sessions = read(&db, later, two_hours, None);
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].phase, "stale");
}
