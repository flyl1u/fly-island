//! A durable undo journal remains until the frontend confirms its localStorage write.
use std::{collections::BTreeMap, fs, io::Read, path::{Path, PathBuf}};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

const JOURNAL: &str = "config-transfer-rollback.json";
pub(super) type FilePlan = BTreeMap<PathBuf, Option<Vec<u8>>>;

pub(super) fn check_path(path: &Path) -> Result<(), String> {
    for ancestor in path.ancestors() {
        match fs::symlink_metadata(ancestor) {
            Ok(metadata) => {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 { return Err("Configuration path contains a link or junction".into()); }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

pub(super) fn read_limited(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    check_path(path)?;
    let mut bytes = Vec::new();
    fs::File::open(path).map_err(|e| e.to_string())?.take(limit as u64 + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() > limit { return Err("configTransfer:tooLarge".into()); }
    Ok(bytes)
}

pub(super) fn write(path: &Path, bytes: Option<&[u8]>) -> Result<(), String> {
    check_path(path)?;
    if let Some(bytes) = bytes {
        let parent = path.parent().ok_or("Missing configuration directory")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let temporary = path.with_file_name(format!("{}.config-transfer-tmp", path.file_name().ok_or("Invalid configuration path")?.to_string_lossy()));
        check_path(&temporary)?;
        fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    } else {
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[derive(Deserialize, Serialize)]
struct Journal { files: BTreeMap<PathBuf, Option<String>>, launch_at_startup: bool }

pub(super) fn apply(root: &Path, plan: &FilePlan, startup: bool) -> Result<(), String> {
    let mut files = BTreeMap::new();
    for path in plan.keys() {
        check_path(path)?;
        let original = match fs::read(path) {
            Ok(bytes) => Some(STANDARD.encode(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Err(e) => return Err(e.to_string()),
        };
        files.insert(path.clone(), original);
    }
    let journal = Journal { files, launch_at_startup: crate::system::startup::get_launch_at_startup()? };
    write(&root.join(JOURNAL), Some(&serde_json::to_vec(&journal).map_err(|e| e.to_string())?))?;
    let result = (|| {
        for (path, bytes) in plan { write(path, bytes.as_deref())?; }
        crate::system::startup::set_launch_at_startup(startup)
    })();
    if let Err(error) = result {
        rollback(root)?;
        return Err(error);
    }
    Ok(())
}

pub(super) fn rollback(root: &Path) -> Result<(), String> {
    let path = root.join(JOURNAL);
    if !path.exists() { return Ok(()); }
    let journal: Journal = serde_json::from_slice(&read_limited(&path, 512 * 1024 * 1024)?).map_err(|e| e.to_string())?;
    for (path, bytes) in journal.files {
        let bytes = bytes.map(|b| STANDARD.decode(b)).transpose().map_err(|e| e.to_string())?;
        write(&path, bytes.as_deref())?;
    }
    crate::system::startup::set_launch_at_startup(journal.launch_at_startup)?;
    commit(root)
}

pub(super) fn commit(root: &Path) -> Result<(), String> { write(&root.join(JOURNAL), None) }
