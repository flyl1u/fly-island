//! Reads a SQLite store its owner keeps writing in WAL mode (Antigravity's conversation list)
//! without touching it. `immutable=1` would ignore the `-wal` file, so new writes stayed unseen
//! until SQLite merged them into the main file (by default after about 4 MB of WAL), and an
//! ordinary connection would lock the store and may create `-shm` beside it. Instead the main
//! file and its `-wal` are copied into a temporary folder of our own and read there; SQLite
//! rebuilds the `-shm` index from the WAL, so that file is not copied. The originals are only
//! ever opened for reading, with sharing that lets the owner go on writing, renaming and deleting.
//!
//! A read is cached under both files' size and change time: while they stay the same nothing is
//! copied or parsed again.

use std::{
    collections::BTreeMap,
    fs::{self, File, Metadata},
    io::{self, Read},
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, SystemTime},
};

use rusqlite::{Connection, OpenFlags};

use super::local_agent_files::entry;

/// A store or WAL beyond this is not the small list expected here; it is not worth copying.
const MAX_BYTES: u64 = 64 * 1024 * 1024;
/// Tries again when the owner merges its WAL into the main file while it is being copied.
const COPY_ATTEMPTS: usize = 3;

type FileStamp = (u64, Option<SystemTime>);

#[derive(Clone, Copy, PartialEq)]
struct Stamp {
    db: FileStamp,
    wal: Option<FileStamp>,
}

/// One store's files as found now. Links and junctions are not followed (local_agent_files).
struct Store {
    db: PathBuf,
    wal: Option<PathBuf>,
    stamp: Stamp,
}

fn stamp(metadata: &Metadata) -> Option<FileStamp> {
    (metadata.is_file() && metadata.len() <= MAX_BYTES).then(|| (metadata.len(), metadata.modified().ok()))
}

impl Store {
    fn find(root: &Path, name: &str) -> Option<Self> {
        let (db, metadata) = entry(root, name)?;
        let db_stamp = stamp(&metadata)?;
        let wal = match entry(root, format!("{name}-wal")) {
            Some((path, metadata)) => Some((path, stamp(&metadata)?)),
            None => None,
        };
        let wal_stamp = wal.as_ref().map(|(_, stamp)| *stamp);
        Some(Self { db, wal: wal.map(|(path, _)| path), stamp: Stamp { db: db_stamp, wal: wal_stamp } })
    }
}

/// A folder under the temporary directory that goes away with this value.
struct Scratch(PathBuf);

impl Scratch {
    fn new() -> io::Result<Self> {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let nanos = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap_or(Duration::ZERO).as_nanos();
        let path = std::env::temp_dir().join(format!(
            "fly-island-sqlite-{}-{nanos}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        // Not `create_dir_all`: a folder that already exists is not ours to fill.
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        // Best effort: the copy holds conversation titles and is not kept.
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn copy(from: &Path, to: &Path) -> io::Result<()> {
    let copied = io::copy(&mut File::open(from)?.take(MAX_BYTES + 1), &mut File::create_new(to)?)?;
    if copied > MAX_BYTES {
        return Err(io::Error::other("the store grew past the size limit"));
    }
    Ok(())
}

/// Copies the store and reads the copy. A WAL that is appended to meanwhile is fine (SQLite
/// ignores a half-written tail); a main file that changed means a checkpoint ran, so the two
/// copies may not match.
fn read_copy<T>(root: &Path, name: &str, store: &Store, load: &mut impl FnMut(&Connection) -> Option<T>) -> Option<T> {
    let scratch = Scratch::new().ok()?;
    let db = scratch.0.join("store.db");
    copy(&store.db, &db).ok()?;
    if let Some(wal) = &store.wal {
        copy(wal, &scratch.0.join("store.db-wal")).ok()?;
    }
    if Store::find(root, name)?.stamp.db != store.stamp.db {
        return None;
    }
    // Read-write on our own copy, so SQLite can build the index the WAL needs.
    let flags = OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let connection = Connection::open_with_flags(&db, flags).ok()?;
    load(&connection)
}

/// What was last read from each store.
pub(super) struct SnapshotCache<T>(BTreeMap<PathBuf, (Stamp, T)>);

impl<T: Clone> SnapshotCache<T> {
    pub(super) const fn new() -> Self {
        Self(BTreeMap::new())
    }

    /// `load` applied to the current content of `root/name`; None when there is no such store.
    /// When it cannot be read right now, the last good result stands and the next call retries.
    pub(super) fn read(&mut self, root: &Path, name: &str, mut load: impl FnMut(&Connection) -> Option<T>) -> Option<T> {
        let key = root.join(name);
        for _ in 0..COPY_ATTEMPTS {
            let Some(store) = Store::find(root, name) else {
                self.0.remove(&key);
                return None;
            };
            if let Some((_, value)) = self.0.get(&key).filter(|(stamp, _)| *stamp == store.stamp) {
                return Some(value.clone());
            }
            if let Some(value) = read_copy(root, name, &store, &mut load) {
                // Kept under the stamp from before the copy: a later write reads it again.
                self.0.insert(key, (store.stamp, value.clone()));
                return Some(value);
            }
        }
        self.0.get(&key).map(|(_, value)| value.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_status::local_agent_files::scratch::tempdir;

    /// A store as its owner leaves it while working: `merged` in the main file, then later
    /// writes that stay in the WAL because nothing checkpoints.
    fn live_store(dir: &Path) -> Connection {
        let writer = Connection::open(dir.join("s.db")).unwrap();
        writer
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE t(x TEXT); \
                 INSERT INTO t VALUES ('merged'); PRAGMA wal_checkpoint(TRUNCATE);",
            )
            .unwrap();
        writer
    }

    fn value(db: &Connection) -> Option<String> {
        db.query_row("SELECT x FROM t", [], |row| row.get(0)).ok()
    }

    /// Each file's name, size and change time: any write by a reader would show.
    fn files(dir: &Path) -> Vec<(String, u64, SystemTime)> {
        let mut files: Vec<_> = fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|file| {
                let metadata = fs::metadata(file.path()).unwrap();
                (file.file_name().to_string_lossy().into_owned(), metadata.len(), metadata.modified().unwrap())
            })
            .collect();
        files.sort();
        files
    }

    #[test]
    fn sees_writes_still_in_the_wal_that_an_immutable_read_misses() {
        let dir = tempdir();
        let writer = live_store(dir.path());
        writer.execute("UPDATE t SET x = 'in the wal'", []).unwrap();

        let uri = format!("file:///{}?immutable=1", dir.path().join("s.db").to_string_lossy().replace('\\', "/"));
        let flags = OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI;
        let immutable = Connection::open_with_flags(uri, flags).unwrap();
        assert_eq!(value(&immutable).as_deref(), Some("merged"), "the old way of reading is stale");
        drop(immutable);

        let before = files(dir.path());
        let mut cache = SnapshotCache::new();
        let started = std::time::Instant::now();
        assert_eq!(cache.read(dir.path(), "s.db", value).as_deref(), Some("in the wal"));
        println!("a committed write was read back in {:?}", started.elapsed());
        assert_eq!(files(dir.path()), before, "the owner's files are not written and none are added");
    }

    #[test]
    fn copies_and_parses_again_only_after_the_files_change() {
        let dir = tempdir();
        let writer = live_store(dir.path());
        let mut cache = SnapshotCache::new();
        let mut loads = 0;
        let mut read = |cache: &mut SnapshotCache<String>| {
            cache.read(dir.path(), "s.db", |db| {
                loads += 1;
                value(db)
            })
        };
        assert_eq!(read(&mut cache).as_deref(), Some("merged"));
        assert_eq!(read(&mut cache).as_deref(), Some("merged"));
        writer.execute("UPDATE t SET x = 'second'", []).unwrap();
        assert_eq!(read(&mut cache).as_deref(), Some("second"));
        assert_eq!(read(&mut cache).as_deref(), Some("second"));
        assert_eq!(loads, 2);
    }

    #[test]
    fn a_store_closed_by_its_owner_reads_without_a_wal_and_a_broken_one_keeps_the_last_read() {
        let dir = tempdir();
        drop(live_store(dir.path()));
        let mut cache = SnapshotCache::new();
        assert_eq!(cache.read(dir.path(), "s.db", value).as_deref(), Some("merged"));
        fs::write(dir.path().join("s.db"), "half a page").unwrap();
        assert_eq!(cache.read(dir.path(), "s.db", value).as_deref(), Some("merged"));
        assert_eq!(SnapshotCache::new().read(dir.path(), "s.db", value), None);
        fs::remove_file(dir.path().join("s.db")).unwrap();
        assert_eq!(cache.read(dir.path(), "s.db", value), None);
    }
}
