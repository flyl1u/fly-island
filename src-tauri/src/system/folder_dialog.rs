//! `pick_folder`: the native folder picker for any settings field that takes a
//! directory (todo Markdown folder, and later others).

/// Opens the Windows folder picker over the calling window. Resolves to the
/// chosen folder, `None` when cancelled, or an error message.
#[tauri::command]
pub async fn pick_folder(
    window: tauri::WebviewWindow,
    initial_directory: Option<String>,
    title: Option<String>,
) -> Result<Option<String>, String> {
    let owner = window.hwnd().map_err(|error| error.to_string())?.0 as isize;
    let initial = initial_directory.unwrap_or_default();
    let title = title.unwrap_or_default();
    // The dialog needs a single-threaded apartment; blocking-pool threads may
    // already be in the multithreaded one, so it gets a thread of its own.
    let picker = std::thread::Builder::new()
        .name("folder-picker".into())
        .spawn(move || crate::win32::folder_dialog::pick_folder(owner, &initial, &title))
        .map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || picker.join())
        .await
        .map_err(|error| error.to_string())?
        .map_err(|_| "The folder picker stopped unexpectedly.".to_string())?
        .map_err(|error| error.to_string())
}
