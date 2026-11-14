//! Daily todo Markdown export and its default directory.

use serde::Serialize;
use std::{fs, path::PathBuf};

use super::windows_home_dir;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTodoMarkdownResult {
    pub(super) file_path: String,
}

#[tauri::command]
pub fn save_todo_markdown(
    directory: String,
    date: String,
    content: String,
) -> Result<SaveTodoMarkdownResult, String> {
    let directory = directory.trim();

    if directory.is_empty() {
        return Err("Todo save path is empty.".to_string());
    }

    if !date.chars().all(|ch| ch.is_ascii_digit() || ch == '-') {
        return Err("Todo date contains invalid filename characters.".to_string());
    }

    let directory_path = PathBuf::from(directory);
    fs::create_dir_all(&directory_path).map_err(|error| error.to_string())?;

    let file_path = directory_path.join(format!("{date}.md"));
    fs::write(&file_path, content).map_err(|error| error.to_string())?;

    Ok(SaveTodoMarkdownResult {
        file_path: file_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn get_default_todo_save_directory() -> Result<String, String> {
    let home_dir = windows_home_dir()?;
    let documents = home_dir.join("Documents");
    // Exports from before the rename went to Documents\FocuSD: keep using it when it is there.
    let former = documents.join("FocuSD");
    let folder = if former.is_dir() { former } else { documents.join("Fly Island") };
    Ok(folder.to_string_lossy().to_string())
}
