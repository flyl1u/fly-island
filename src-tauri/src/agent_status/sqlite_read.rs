//! Opens another program's SQLite store (Cursor's state.vscdb, Hermes' state.db) for reading
//! only. The owner keeps writing it in WAL mode; a read-only connection never blocks it, and a
//! short busy timeout gives up rather than waiting on a checkpoint. A store that must not even
//! be locked is copied instead (sqlite_snapshot.rs).

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
