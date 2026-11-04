//! Reading and writing `todos.json` so that a crash or power cut never leaves
//! a half-written or wrong file: write a temporary file, flush it to disk,
//! rename it over the old one, then read it back and compare.

use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::Path,
};

use super::model::{validate, TodosFile, FILE_VERSION};

/// Why `todos.json` cannot be used. Only a damaged file may be replaced; the
/// others are left alone.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum LoadError {
    /// It exists but could not be read (locked, no access).
    Unreadable(String),
    /// Not valid JSON, or data normalize.ts would never produce.
    Damaged(String),
    /// Written by a newer FocuSD Island.
    Newer(String),
}

impl LoadError {
    pub(crate) fn message(&self) -> &str {
        match self {
            Self::Unreadable(message) | Self::Damaged(message) | Self::Newer(message) => message,
        }
    }
}

/// The file, `None` if there is none yet, or why it cannot be used.
pub(crate) fn load(path: &Path) -> Result<Option<TodosFile>, LoadError> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(LoadError::Unreadable(format!("Could not read {}: {error}", path.display()))),
    };
    let damaged = |error: String| LoadError::Damaged(format!("{} is damaged: {error}", path.display()));
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|error| damaged(error.to_string()))?;
    let version = value.get("version").and_then(serde_json::Value::as_u64).unwrap_or(0);
    if version > u64::from(FILE_VERSION) {
        return Err(LoadError::Newer(format!(
            "{} was written by a newer FocuSD Island (format {version}).",
            path.display()
        )));
    }
    let file: TodosFile = serde_json::from_value(value).map_err(|error| damaged(error.to_string()))?;
    validate(&file.data).map_err(damaged)?;
    Ok(Some(file))
}

/// Saves `file` and checks that reading it back gives the same data.
pub(crate) fn save(path: &Path, file: &TodosFile) -> Result<(), String> {
    validate(&file.data)?;
    let text = serde_json::to_string(file).map_err(|error| format!("Could not encode the todos: {error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    let temporary = path.with_extension("json.tmp");
    write_synced(&temporary, text.as_bytes(), false)?;
    fs::rename(&temporary, path).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!("Could not replace {}: {error}", path.display())
    })?;
    match load(path) {
        Ok(Some(read_back)) if read_back == *file => Ok(()),
        Err(error) => Err(error.message().to_string()),
        Ok(_) => Err(format!("{} did not read back as written.", path.display())),
    }
}

/// Writes a file that must not replace anything (backups); fails if it exists.
pub(crate) fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_synced(path, bytes, true)
}

fn write_synced(path: &Path, bytes: &[u8], create_new: bool) -> Result<(), String> {
    let fail = |error: std::io::Error| format!("Could not write {}: {error}", path.display());
    let mut options = OpenOptions::new();
    options.write(true);
    if create_new {
        options.create_new(true);
    } else {
        options.create(true).truncate(true);
    }
    let mut file: File = options.open(path).map_err(fail)?;
    file.write_all(bytes).map_err(fail)?;
    file.sync_all().map_err(fail)
}
