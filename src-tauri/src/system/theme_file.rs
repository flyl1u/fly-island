//! Appearance theme files: the settings page builds the JSON (only it can read localStorage) and
//! this writes it to the Downloads folder. Importing reads the file in the page itself.

use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

/// Larger "themes" are not appearance settings; refuse rather than write them.
const MAX_THEME_BYTES: usize = 2 * 1024 * 1024;
/// Tried names per save: `name.json`, `name (2).json`, ... up to this many.
const MAX_NAME_TRIES: u32 = 50;

/// Whether `file_name` is one the settings page builds: `fly-island-theme-<date-time>.json`.
pub(crate) fn is_theme_file_name(file_name: &str) -> bool {
    file_name
        .strip_prefix("fly-island-theme-")
        .and_then(|rest| rest.strip_suffix(".json"))
        .is_some_and(|stamp| !stamp.is_empty() && stamp.chars().all(|c| c.is_ascii_digit() || c == '-'))
}

/// Whether `content` is a theme: JSON naming this app as its source.
pub(crate) fn is_theme_content(content: &str) -> bool {
    content.len() <= MAX_THEME_BYTES
        && serde_json::from_str::<serde_json::Value>(content).is_ok_and(|value| {
            value["app"] == "fly-island" && value["kind"] == "theme" && value["appearance"].is_object()
        })
}

/// `dir/file_name`, or `dir/<stem> (2).json` and so on when it exists; never overwrites.
pub(crate) fn write_new_file(dir: &Path, file_name: &str, content: &str) -> Result<PathBuf, String> {
    let stem = file_name.trim_end_matches(".json");
    for attempt in 1..=MAX_NAME_TRIES {
        let path = if attempt == 1 {
            dir.join(file_name)
        } else {
            dir.join(format!("{stem} ({attempt}).json"))
        };
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(content.as_bytes())
                    .map_err(|error| format!("Could not write {}: {error}", path.display()))?;
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not create {}: {error}", path.display())),
        }
    }
    Err(format!("Too many files named {stem} in {}.", dir.display()))
}

/// Saves a theme to the Downloads folder and returns the file's full path.
#[tauri::command]
pub fn save_theme_file(file_name: String, content: String) -> Result<String, String> {
    if !is_theme_file_name(&file_name) {
        return Err("Not a theme file name.".into());
    }
    if !is_theme_content(&content) {
        return Err("Not a theme.".into());
    }
    let dir = crate::win32::known_folder::downloads().ok_or("找不到下载文件夹。")?;
    fs::create_dir_all(&dir).map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    write_new_file(&dir, &file_name, &content).map(|path| path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_theme_names_and_contents_are_accepted() {
        assert!(is_theme_file_name("fly-island-theme-2026-11-08-0905.json"));
        assert!(!is_theme_file_name("fly-island-theme-.json"));
        assert!(!is_theme_file_name(r"..\fly-island-theme-1.json"));
        assert!(!is_theme_file_name("fly-island-theme-1.json.exe"));
        assert!(!is_theme_file_name("fly-island-theme-dark.json"));
        assert!(!is_theme_file_name("fly-island-settings-2026-11-06-1430.json"));
        assert!(is_theme_content(r#"{"app":"fly-island","kind":"theme","version":1,"appearance":{}}"#));
        assert!(!is_theme_content(r#"{"app":"fly-island","version":1,"keys":{}}"#));
        assert!(!is_theme_content(r#"{"app":"fly-island","kind":"theme","appearance":"x"}"#));
        assert!(!is_theme_content("not json"));
    }

    #[test]
    fn saving_twice_keeps_both_files() {
        let dir = std::env::temp_dir().join(format!("focusd-theme-file-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let first = write_new_file(&dir, "fly-island-theme-1.json", "a").unwrap();
        let second = write_new_file(&dir, "fly-island-theme-1.json", "b").unwrap();
        assert_eq!(first.file_name().unwrap(), "fly-island-theme-1.json");
        assert_eq!(second.file_name().unwrap(), "fly-island-theme-1 (2).json");
        assert_eq!(fs::read_to_string(&first).unwrap(), "a");
        let _ = fs::remove_dir_all(&dir);
    }
}
