//! Copies the foreground selection without keeping it on the clipboard or in history.

use std::{borrow::Cow, thread, time::Duration};

use arboard::{Clipboard, ImageData};

use crate::clipboard_history::suspend_clipboard_capture;
use crate::win32;

const SELECTION_WAIT: Duration = Duration::from_millis(450);
const SELECTION_POLL: Duration = Duration::from_millis(40);
const CAPTURE_SUSPEND: Duration = Duration::from_millis(1_200);

struct SavedClipboard {
    text: Option<String>,
    image: Option<(usize, usize, Vec<u8>)>,
}

/// The text a selection shortcut should translate.
///
/// A clipboard that changed after Ctrl+C is the selection. Otherwise the text that
/// was already there is the fallback. Nothing either way means there is nothing to translate.
pub(super) fn chosen_text(original: Option<String>, after: Option<String>) -> Option<String> {
    let changed = match (&original, &after) {
        (_, Some(after)) if meaningful(after) => original.as_deref().map(str::trim) != Some(after.trim()),
        _ => false,
    };
    if changed {
        return after.filter(|text| meaningful(text));
    }
    original.filter(|text| meaningful(text))
}

fn meaningful(text: &str) -> bool {
    !text.trim().is_empty()
}

/// Ctrl+C the foreground selection, then put the clipboard back. History ignores the
/// temporary copy. Returns the selection, or the previous clipboard text when nothing
/// was selected.
pub(super) fn capture_selection_text() -> Option<String> {
    suspend_clipboard_capture(CAPTURE_SUSPEND);
    let saved = snapshot_clipboard();
    win32::input::send_copy_shortcut();

    let started = std::time::Instant::now();
    let mut after = read_clipboard_text();
    while started.elapsed() < SELECTION_WAIT && !clipboard_changed(&saved, after.as_deref()) {
        thread::sleep(SELECTION_POLL);
        after = read_clipboard_text();
    }

    let chosen = chosen_text(saved.text.clone(), after.clone());
    if let Err(error) = restore_clipboard(&saved, after.as_deref()) {
        eprintln!("failed to restore the clipboard after copying a selection: {error}");
    }
    chosen
}

fn clipboard_changed(saved: &SavedClipboard, after: Option<&str>) -> bool {
    match (&saved.text, after) {
        (_, Some(after)) if meaningful(after) => saved.text.as_deref().map(str::trim) != Some(after.trim()),
        _ => false,
    }
}

fn snapshot_clipboard() -> SavedClipboard {
    let Ok(mut clipboard) = Clipboard::new() else {
        return SavedClipboard { text: None, image: None };
    };
    let text = clipboard.get_text().ok().filter(|text| meaningful(text));
    let image = if text.is_some() {
        None
    } else {
        clipboard.get_image().ok().map(|image| (image.width, image.height, image.bytes.into_owned()))
    };
    SavedClipboard { text, image }
}

fn read_clipboard_text() -> Option<String> {
    Clipboard::new().ok().and_then(|mut clipboard| clipboard.get_text().ok()).filter(|text| meaningful(text))
}

fn restore_clipboard(saved: &SavedClipboard, after: Option<&str>) -> Result<(), String> {
    if !clipboard_changed(saved, after) {
        return Ok(());
    }
    if let Some(text) = &saved.text {
        return Clipboard::new()
            .map_err(|error| error.to_string())?
            .set_text(text.clone())
            .map_err(|error| error.to_string());
    }
    if let Some((width, height, bytes)) = &saved.image {
        return Clipboard::new()
            .map_err(|error| error.to_string())?
            .set_image(ImageData {
                width: *width,
                height: *height,
                bytes: Cow::Owned(bytes.clone()),
            })
            .map_err(|error| error.to_string());
    }
    win32::clipboard::empty().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::chosen_text;

    #[test]
    fn a_changed_clipboard_is_the_selection_and_otherwise_the_old_text_is_kept() {
        assert_eq!(
            chosen_text(Some("hello".to_string()), Some("world".to_string())).as_deref(),
            Some("world")
        );
        assert_eq!(
            chosen_text(Some(" hello ".to_string()), Some("hello".to_string())).as_deref(),
            Some(" hello ")
        );
        assert_eq!(
            chosen_text(None, Some("picked".to_string())).as_deref(),
            Some("picked")
        );
        assert_eq!(chosen_text(None, None), None);
        assert_eq!(chosen_text(Some("   ".to_string()), None), None);
    }
}
