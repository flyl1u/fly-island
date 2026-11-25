//! Opens another program's SQLite store (Cursor's state.vscdb, Hermes' state.db) for reading
//! only. The owner keeps writing it in WAL mode; a read-only connection never blocks it, and a
//! short busy timeout gives up rather than waiting on a checkpoint.

use std::{path::Path, time::Duration};

use rusqlite::{Connection, OpenFlags};

pub(super) fn open(path: &Path) -> Option<Connection> {
    if !path.is_file() {
        return None;
    }
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let connection = Connection::open_with_flags(path, flags).ok()?;
    connection.busy_timeout(Duration::from_millis(200)).ok()?;
    Some(connection)
}

/// `file:` URI of an absolute Windows path, percent-encoding what SQLite would read as syntax.
fn immutable_uri(path: &Path) -> String {
    let mut uri = String::from("file:///");
    for byte in path.to_string_lossy().replace('\\', "/").trim_start_matches('/').bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b':' | b'-' | b'_' | b'.' | b'~' => uri.push(char::from(byte)),
            _ => uri.push_str(&format!("%{byte:02X}")),
        }
    }
    uri.push_str("?immutable=1");
    uri
}

/// Like `open`, for a store whose owner may be writing it: `immutable=1` makes SQLite take no
/// locks and create no `-wal` / `-shm` files, and never checkpoint. What the owner has not yet
/// merged into the main file stays unseen, and a read that hits a half-written page fails quietly.
pub(super) fn open_immutable(path: &Path) -> Option<Connection> {
    if !path.is_file() {
        return None;
    }
    let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX | OpenFlags::SQLITE_OPEN_URI;
    let connection = Connection::open_with_flags(immutable_uri(path), flags).ok()?;
    connection.busy_timeout(Duration::from_millis(200)).ok()?;
    Some(connection)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_status::local_agent_files::scratch::tempdir;

    #[test]
    fn reads_without_creating_sidecar_files() {
        let dir = tempdir();
        let path = dir.path().join("a b#c.db");
        {
            let db = Connection::open(&path).unwrap();
            db.execute_batch("CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (7);").unwrap();
        }
        let db = open_immutable(&path).unwrap();
        assert_eq!(db.query_row("SELECT x FROM t", [], |row| row.get::<_, i64>(0)).unwrap(), 7);
        assert!(db.execute("INSERT INTO t VALUES (8)", []).is_err());
        drop(db);
        let names: Vec<_> = std::fs::read_dir(dir.path()).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(names.len(), 1, "{names:?}");
        assert!(open_immutable(&dir.path().join("missing.db")).is_none());
    }
}
