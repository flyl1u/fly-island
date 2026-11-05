//! The user's known folders (Downloads), which can be moved away from the
//! profile folder, so they are asked from Windows rather than assumed.

use std::path::PathBuf;
use windows::Win32::{
    System::Com::CoTaskMemFree,
    UI::Shell::{FOLDERID_Downloads, SHGetKnownFolderPath, KF_FLAG_DEFAULT},
};

/// The current user's Downloads folder; `None` if Windows cannot say.
pub(crate) fn downloads() -> Option<PathBuf> {
    // SAFETY: FOLDERID_Downloads is a valid known-folder id, no token is passed
    // (current user), and the returned buffer is freed below with CoTaskMemFree,
    // as SHGetKnownFolderPath requires, whether or not it reads as a string.
    let path = unsafe { SHGetKnownFolderPath(&FOLDERID_Downloads, KF_FLAG_DEFAULT, None) }.ok()?;
    // SAFETY: on success `path` points to a NUL-terminated UTF-16 string.
    let text = unsafe { path.to_string() };
    // SAFETY: `path` came from SHGetKnownFolderPath and is freed exactly once.
    unsafe { CoTaskMemFree(Some(path.0.cast())) };
    text.ok().filter(|text| !text.is_empty()).map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::downloads;

    #[test]
    fn the_downloads_folder_is_an_absolute_path() {
        let path = downloads().expect("Downloads");
        assert!(path.is_absolute(), "{path:?}");
    }
}
