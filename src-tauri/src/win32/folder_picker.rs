//! Native folder selection, confined to the calling STA thread.

use std::path::Path;
use windows::{
    core::{HSTRING, HRESULT, PWSTR},
    Win32::{
        Foundation::{HWND, ERROR_CANCELLED},
        System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_INPROC_SERVER},
        UI::Shell::{
            FileOpenDialog, IFileOpenDialog, IShellItem, SHCreateItemFromParsingName,
            FOS_FORCEFILESYSTEM, FOS_PICKFOLDERS, FOS_PATHMUSTEXIST, SIGDN_FILESYSPATH,
        },
    },
};

use super::com::ComApartment;

struct ShellPath(PWSTR);

impl Drop for ShellPath {
    fn drop(&mut self) {
        // SAFETY: this buffer came from GetDisplayName and is freed exactly once.
        unsafe { CoTaskMemFree(Some(self.0.0.cast())) };
    }
}

pub(crate) fn pick(owner: isize, directory: &str, title: &str) -> Result<Option<String>, String> {
    pick_inner(owner, directory, title).map_err(|error| error.to_string())
}

fn pick_inner(owner: isize, directory: &str, title: &str) -> windows::core::Result<Option<String>> {
    let _com = ComApartment::single_threaded()?;
    // SAFETY: COM is initialized on this thread; the returned interface is held
    // and released on this same thread before the apartment guard is dropped.
    let dialog: IFileOpenDialog =
        unsafe { CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER) }?;
    // SAFETY: dialog is a live COM interface, and the title's UTF-16 buffer lives
    // for the duration of SetTitle. Options retain the dialog's existing flags.
    unsafe {
        dialog.SetOptions(
            dialog.GetOptions()? | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST,
        )?;
        dialog.SetTitle(&HSTRING::from(title))?;
    }
    // An empty, deleted or mistyped draft must not prevent opening the picker.
    let directory = directory.trim();
    if Path::new(directory).is_absolute() && Path::new(directory).is_dir() {
        // SAFETY: the absolute path is NUL-terminated by HSTRING; no bind context
        // is supplied, and the shell item stays on this COM apartment's thread.
        let folder: IShellItem =
            unsafe { SHCreateItemFromParsingName(&HSTRING::from(directory), None) }?;
        // SAFETY: both interfaces are live on this thread. SetFolder deliberately
        // starts at the path being edited instead of Windows' last-used folder.
        unsafe { dialog.SetFolder(&folder) }?;
    }
    // SAFETY: owner comes from the invoking live Tauri window; Show runs a modal
    // message loop and does not retain the handle after returning.
    match unsafe { dialog.Show(Some(HWND(owner as *mut _))) } {
        Ok(()) => {}
        Err(error) if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) => return Ok(None),
        Err(error) => return Err(error),
    }
    // SAFETY: a successful Show guarantees a result; FORCEFILESYSTEM ensures it
    // has a filesystem path. The allocated UTF-16 buffer is freed below.
    let path = ShellPath(unsafe { dialog.GetResult()?.GetDisplayName(SIGDN_FILESYSPATH) }?);
    // SAFETY: GetDisplayName returned a NUL-terminated UTF-16 buffer.
    Ok(Some(unsafe { path.0.to_string() }?))
}
