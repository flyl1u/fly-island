use std::{
    ffi::OsStr,
    fs::{self, File, Metadata},
    io::Read,
    os::windows::fs::MetadataExt,
    path::{Component, Path, PathBuf},
};

const REPARSE_POINT: u32 = 0x400;

pub(super) fn entry(parent: &Path, name: impl AsRef<OsStr>) -> Option<(PathBuf, Metadata)> {
    let mut components = Path::new(name.as_ref()).components();
    let Some(Component::Normal(name)) = components.next() else {
        return None;
    };
    if components.next().is_some() {
        return None;
    }
    let path = parent.join(name);
    let metadata = fs::symlink_metadata(&path).ok()?;
    (metadata.file_attributes() & REPARSE_POINT == 0).then_some((path, metadata))
}

pub(super) fn directory(parent: &Path, name: impl AsRef<OsStr>) -> Option<PathBuf> {
    let (path, metadata) = entry(parent, name)?;
    metadata.is_dir().then_some(path)
}

pub(super) fn read_small_text(
    parent: &Path,
    name: impl AsRef<OsStr>,
    maximum: u64,
) -> Option<String> {
    let (path, metadata) = entry(parent, name)?;
    if !metadata.is_file() || metadata.len() > maximum {
        return None;
    }
    let mut text = String::new();
    File::open(path)
        .ok()?
        .take(maximum + 1)
        .read_to_string(&mut text)
        .ok()?;
    ((text.len() as u64) <= maximum).then_some(text)
}

/// A throwaway directory for the tests of the optional local sources.
#[cfg(test)]
pub(super) mod scratch {
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::atomic::{AtomicUsize, Ordering},
    };

    static NEXT: AtomicUsize = AtomicUsize::new(0);

    pub(in crate::agent_status) struct TempDir(PathBuf);

    pub(in crate::agent_status) fn tempdir() -> TempDir {
        let path = std::env::temp_dir().join(format!(
            "fly-island-local-agent-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).expect("create a scratch folder");
        TempDir(path)
    }

    impl TempDir {
        pub(in crate::agent_status) fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            // A junction made by a test must be removed as a link, not followed.
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::scratch::tempdir;
    use super::*;

    #[test]
    fn refuses_non_children_and_limits_small_file_reads() {
        let parent = tempdir();
        fs::create_dir(parent.path().join("sessions")).unwrap();
        fs::write(parent.path().join("session.json"), "12345").unwrap();
        assert!(directory(parent.path(), "sessions").is_some());
        for name in [
            "..",
            "",
            "sessions/../session.json",
            "C:\\Windows",
            "missing",
        ] {
            assert!(entry(parent.path(), name).is_none(), "{name}");
        }
        assert_eq!(
            read_small_text(parent.path(), "session.json", 5).as_deref(),
            Some("12345")
        );
        assert!(read_small_text(parent.path(), "session.json", 4).is_none());
        assert!(read_small_text(parent.path(), "sessions", 32).is_none());
    }

    #[test]
    fn refuses_junctions() {
        let parent = tempdir();
        let target = parent.path().join("target");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("a.json"), "{}").unwrap();
        let link = parent.path().join("link");
        let made = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(&target)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false);
        if !made {
            return; // junction creation is unavailable here
        }
        assert!(directory(parent.path(), "target").is_some());
        assert!(directory(parent.path(), "link").is_none());
        assert!(entry(parent.path(), "link").is_none());
        let _ = fs::remove_dir(&link);
    }
}
