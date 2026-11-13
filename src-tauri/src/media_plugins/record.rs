use std::{fs, path::{Path, PathBuf}};
use serde::{Deserialize, Serialize};
use super::{download, PluginError};
#[derive(Clone, Deserialize, Serialize)]
pub(super) struct InstalledFile { pub path: PathBuf, pub sha256: String }
#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Record { pub version: u32, pub files: Vec<InstalledFile>, pub installed_at: u64 }
pub(super) fn read(path: &Path) -> Record {
    fs::read(path).ok().and_then(|bytes| serde_json::from_slice::<Record>(&bytes).ok())
        .filter(|r| r.version == 1).unwrap_or_default()
}
pub(super) fn write(path: &Path, record: &Record) -> Result<(), PluginError> {
    let bytes = serde_json::to_vec_pretty(record).map_err(|e| PluginError::new("Io", e.to_string()))?;
    fs::write(path.with_extension("tmp"), bytes)?;
    super::elevated::replace(&path.with_extension("tmp"), path)?;
    Ok(())
}
pub(super) fn matches(file: &InstalledFile) -> bool { download::hash(&file.path).is_ok_and(|h| h == file.sha256) }
