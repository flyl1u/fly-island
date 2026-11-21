//! Opt-in daily Markdown sync. Conditional writes hold a Windows write/delete exclusion lock.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    os::windows::fs::OpenOptionsExt,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoMarkdownSnapshot {
    file_path: String,
    version: Option<String>,
    modified_at: Option<u64>,
    content: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionalTodoSaveResult {
    saved: bool,
    snapshot: TodoMarkdownSnapshot,
}

fn daily_path(directory: &str, date: &str) -> Result<PathBuf, String> {
    if directory.trim().is_empty() || !Path::new(directory.trim()).is_absolute() {
        return Err("Todo save path must be an absolute folder path.".into());
    }
    let valid = date.len() == 10
        && date.bytes().enumerate().all(|(index, ch)| {
            if index == 4 || index == 7 {
                ch == b'-'
            } else {
                ch.is_ascii_digit()
            }
        });
    if !valid {
        return Err("Todo date must be YYYY-MM-DD.".into());
    }
    let year = date[..4]
        .parse::<u32>()
        .map_err(|error| error.to_string())?;
    let month = date[5..7]
        .parse::<u32>()
        .map_err(|error| error.to_string())?;
    let day = date[8..]
        .parse::<u32>()
        .map_err(|error| error.to_string())?;
    let days = match month {
        4 | 6 | 9 | 11 => 30,
        2 if year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400)) => {
            29
        }
        2 => 28,
        1..=12 => 31,
        _ => 0,
    };
    if year == 0 || day == 0 || day > days {
        return Err("Todo date is not a calendar day.".into());
    }
    Ok(Path::new(directory.trim()).join(format!("{date}.md")))
}

fn snapshot(path: &Path, file: Option<&mut File>) -> Result<TodoMarkdownSnapshot, String> {
    let mut result = TodoMarkdownSnapshot {
        file_path: path.to_string_lossy().into_owned(),
        version: None,
        modified_at: None,
        content: None,
    };
    let Some(file) = file else { return Ok(result) };
    let metadata = file.metadata().map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err("Todo Markdown must be a text file smaller than 4 MiB.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Todo Markdown is larger than 4 MiB.".into());
    }
    let content =
        String::from_utf8(bytes).map_err(|_| "Todo Markdown must use UTF-8.".to_string())?;
    // Include content as well as mtime: editors can replace a file without changing its timestamp.
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok());
    result.version = Some(format!(
        "{:x}-{}",
        Sha256::digest(content.as_bytes()),
        modified.map_or(0, |time| time.as_nanos())
    ));
    result.modified_at = modified.map(|time| time.as_millis().min(u64::MAX as u128) as u64);
    result.content = Some(content);
    Ok(result)
}

fn read_document(path: &Path) -> Result<TodoMarkdownSnapshot, String> {
    match File::open(path) {
        Ok(mut file) => snapshot(path, Some(&mut file)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => snapshot(path, None),
        Err(error) => Err(format!("Could not read todo Markdown: {error}")),
    }
}

fn recovery_file(path: &Path, side: &str, content: &str) -> Result<(), String> {
    let stem = path
        .file_stem()
        .ok_or("Invalid todo filename.")?
        .to_string_lossy();
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let recovery = path.with_file_name(format!("{stem}.conflict-{stamp}-{side}.md"));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(recovery)
        .map_err(|error| error.to_string())?;
    file.write_all(content.as_bytes())
        .and_then(|()| file.sync_data())
        .map_err(|error| format!("Could not save todo conflict recovery: {error}"))
}

fn conditional_save(
    path: &Path,
    content: &str,
    expected: Option<&str>,
    recovery: Option<&str>,
) -> Result<ConditionalTodoSaveResult, String> {
    if content.len() as u64 > MAX_BYTES
        || recovery.is_some_and(|text| text.len() as u64 > MAX_BYTES)
    {
        return Err("Todo Markdown is larger than 4 MiB.".into());
    }
    let parent = path.parent().ok_or("Invalid todo save folder.")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    // FILE_SHARE_READ only: another editor cannot write or replace between comparison and write.
    let open = || {
        OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(1)
            .open(path)
    };
    let (mut file, created) = match open() {
        Ok(file) => (file, false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if expected.is_some() {
                return Ok(ConditionalTodoSaveResult {
                    saved: false,
                    snapshot: snapshot(path, None)?,
                });
            }
            match OpenOptions::new()
                .read(true)
                .write(true)
                .share_mode(1)
                .create_new(true)
                .open(path)
            {
                Ok(file) => (file, true),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    (open().map_err(|error| error.to_string())?, false)
                }
                Err(error) => return Err(error.to_string()),
            }
        }
        Err(error) => return Err(format!("Could not lock todo Markdown for saving: {error}")),
    };
    let previous = if created {
        snapshot(path, None)?
    } else {
        snapshot(path, Some(&mut file))?
    };
    if previous.version.as_deref() != expected {
        return Ok(ConditionalTodoSaveResult {
            saved: false,
            snapshot: previous,
        });
    }
    if let Some(island_content) = recovery {
        recovery_file(path, "island", island_content)?;
        if let Some(file_content) = &previous.content {
            recovery_file(path, "file", file_content)?;
        }
    }
    file.seek(SeekFrom::Start(0))
        .map_err(|error| error.to_string())?;
    if let Err(error) = file
        .write_all(content.as_bytes())
        .and_then(|()| file.set_len(content.len() as u64))
        .and_then(|()| file.sync_data())
    {
        // Best effort restore after an I/O failure; preserve a copy before returning the error.
        if let Some(original) = &previous.content {
            recovery_file(path, "write-error", original)?;
        }
        return Err(format!("Could not write todo Markdown: {error}"));
    }
    file.seek(SeekFrom::Start(0))
        .map_err(|error| error.to_string())?;
    Ok(ConditionalTodoSaveResult {
        saved: true,
        snapshot: snapshot(path, Some(&mut file))?,
    })
}

#[tauri::command]
pub async fn read_todo_markdown(
    directory: String,
    date: String,
) -> Result<TodoMarkdownSnapshot, String> {
    let path = daily_path(&directory, &date)?;
    tauri::async_runtime::spawn_blocking(move || read_document(&path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_todo_markdown_if_unchanged(
    directory: String,
    date: String,
    content: String,
    expected_version: Option<String>,
    recovery_content: Option<String>,
) -> Result<ConditionalTodoSaveResult, String> {
    let path = daily_path(&directory, &date)?;
    tauri::async_runtime::spawn_blocking(move || {
        conditional_save(
            &path,
            &content,
            expected_version.as_deref(),
            recovery_content.as_deref(),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
#[path = "todo_sync_tests.rs"]
mod tests;
