use super::*;

struct TestDirectory(PathBuf);
impl TestDirectory {
    fn new() -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "fly-island-todo-sync-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn file(&self) -> PathBuf {
        self.0.join("2026-11-19.md")
    }
}
impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn paths_reject_empty_relative_and_non_daily_names() {
    for directory in ["", " ", "../notes", "notes"] {
        assert!(daily_path(directory, "2026-11-19").is_err());
    }
    for date in [
        "",
        "../2026-11-19",
        "2026-11-19/other",
        "2026-1-1",
        "2026-02-30",
        "2026-11-19.md",
    ] {
        assert!(daily_path("C:/notes", date).is_err(), "{date}");
    }
    assert_eq!(
        daily_path(" C:/notes ", "2026-11-19").unwrap(),
        PathBuf::from("C:/notes/2026-11-19.md")
    );
}

#[test]
fn reads_missing_empty_unicode_and_rejects_invalid_utf8_or_large_files() {
    let dir = TestDirectory::new();
    let path = dir.file();
    assert!(read_document(&path).unwrap().version.is_none());
    fs::write(&path, "").unwrap();
    assert_eq!(read_document(&path).unwrap().content.as_deref(), Some(""));
    fs::write(&path, "- [x] 中文").unwrap();
    let first = read_document(&path).unwrap();
    assert!(first.modified_at.is_some());
    assert_eq!(first.content.as_deref(), Some("- [x] 中文"));
    assert_eq!(first.version, read_document(&path).unwrap().version);
    fs::write(&path, [0xff, 0xfe]).unwrap();
    assert!(read_document(&path).is_err());
    File::create(&path).unwrap().set_len(MAX_BYTES + 1).unwrap();
    assert!(read_document(&path).is_err());
}

#[test]
fn stale_version_never_overwrites_external_edit_or_deletion() {
    let dir = TestDirectory::new();
    let path = dir.file();
    let saved = conditional_save(&path, "first", None, None).unwrap();
    assert!(saved.saved);
    let version = saved.snapshot.version;
    fs::write(&path, "external").unwrap();
    let rejected = conditional_save(&path, "stale island", version.as_deref(), None).unwrap();
    assert!(!rejected.saved);
    assert_eq!(fs::read_to_string(&path).unwrap(), "external");
    assert_eq!(rejected.snapshot.content.as_deref(), Some("external"));
    assert!(!conditional_save(&path, "stale", None, None).unwrap().saved);
    fs::remove_file(&path).unwrap();
    assert!(
        !conditional_save(&path, "stale", version.as_deref(), None)
            .unwrap()
            .saved
    );
    assert!(!path.exists());
}

#[test]
fn conditional_write_truncates_and_preserves_both_conflict_versions() {
    let dir = TestDirectory::new();
    let path = dir.file();
    fs::write(&path, "long external version").unwrap();
    let before = read_document(&path).unwrap();
    let saved = conditional_save(
        &path,
        "new",
        before.version.as_deref(),
        Some("island conflict"),
    )
    .unwrap();
    assert!(saved.saved);
    assert_eq!(saved.snapshot.content.as_deref(), Some("new"));
    assert_ne!(saved.snapshot.version, before.version);
    let backups: Vec<_> = fs::read_dir(&dir.0)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path != &dir.file())
        .map(|path| fs::read_to_string(path).unwrap())
        .collect();
    assert_eq!(backups.len(), 2);
    assert!(backups.contains(&"long external version".into()));
    assert!(backups.contains(&"island conflict".into()));
}

#[test]
fn writer_lock_excludes_other_writes_and_atomic_replacements() {
    let dir = TestDirectory::new();
    fs::write(dir.file(), "original").unwrap();
    let _locked = OpenOptions::new()
        .read(true)
        .write(true)
        .share_mode(1)
        .open(dir.file())
        .unwrap();
    assert!(fs::write(dir.file(), "other writer").is_err());
    assert!(fs::remove_file(dir.file()).is_err());
    assert!(conditional_save(&dir.file(), "racing writer", None, None).is_err());
}
