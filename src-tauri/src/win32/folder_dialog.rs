//! The Windows folder picker (`IFileOpenDialog` with `FOS_PICKFOLDERS`).
//!
//! The dialog needs a single-threaded apartment, so [`pick_folder`] must run on a
//! thread that has not joined the multithreaded apartment; callers give it a
//! fresh thread of its own.

use std::{marker::PhantomData, path::Path};

use windows::{
    core::{HRESULT, HSTRING, PWSTR},
    Win32::{
        Foundation::{ERROR_CANCELLED, E_UNEXPECTED, HWND},
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
        },
        UI::Shell::{
            FileOpenDialog, IFileOpenDialog, IShellItem, SHCreateItemFromParsingName,
            FOS_FORCEFILESYSTEM, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, SIGDN_FILESYSPATH,
        },
    },
};

/// COM initialized in a single-threaded apartment for this thread's lifetime.
struct StaApartment {
    _thread_bound: PhantomData<*const ()>,
}

impl StaApartment {
    fn enter() -> windows::core::Result<Self> {
        // SAFETY: no pointers are passed (the reserved argument is None). Any
        // success, S_FALSE included, is balanced by one CoUninitialize in Drop.
        unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) }.ok()?;
        Ok(Self { _thread_bound: PhantomData })
    }
}

impl Drop for StaApartment {
    fn drop(&mut self) {
        // SAFETY: pairs the successful CoInitializeEx above, on the same thread
        // because the guard is not Send.
        unsafe { CoUninitialize() };
    }
}

/// A shell-allocated UTF-16 string, freed with `CoTaskMemFree`.
struct TaskMemString(PWSTR);

impl Drop for TaskMemString {
    fn drop(&mut self) {
        // SAFETY: the buffer came from IShellItem::GetDisplayName and is freed once.
        unsafe { CoTaskMemFree(Some(self.0.as_ptr().cast())) };
    }
}

/// Shows a modal folder picker owned by `owner` (an HWND value) and returns the
/// chosen folder, or `None` when the user cancels. `initial` opens the dialog in
/// that folder when it exists.
pub(crate) fn pick_folder(owner: isize, initial: &str, title: &str) -> windows::core::Result<Option<String>> {
    let _apartment = StaApartment::enter()?;
    // SAFETY: COM is initialized on this thread; the interface is used and
    // released here before the apartment guard drops.
    let dialog: IFileOpenDialog = unsafe { CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER) }?;
    // SAFETY: `dialog` is live; the HSTRING outlives the SetTitle call.
    unsafe {
        let options = dialog.GetOptions()?;
        dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST)?;
        if !title.is_empty() {
            dialog.SetTitle(&HSTRING::from(title))?;
        }
    }

    let initial = initial.trim();
    if !initial.is_empty() && Path::new(initial).is_dir() {
        // SAFETY: the path is a NUL-terminated HSTRING and no bind context is used.
        // A folder the shell cannot parse only loses the starting location.
        if let Ok(folder) = unsafe { SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(initial), None) } {
            // SAFETY: both interfaces are live on this thread.
            let _ = unsafe { dialog.SetFolder(&folder) };
        }
    }

    // SAFETY: `owner` is the calling window's handle; Show runs a modal loop and
    // does not keep the handle afterwards.
    if let Err(error) = unsafe { dialog.Show(Some(HWND(owner as *mut _))) } {
        if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) {
            return Ok(None);
        }
        return Err(error);
    }

    // SAFETY: Show succeeded, so a result exists; FORCEFILESYSTEM guarantees a
    // file-system path. The buffer is freed by TaskMemString.
    let path = TaskMemString(unsafe { dialog.GetResult()?.GetDisplayName(SIGDN_FILESYSPATH)? });
    // SAFETY: GetDisplayName returns a NUL-terminated UTF-16 buffer.
    let text = unsafe { path.0.to_string() }.map_err(|_| windows::core::Error::from(E_UNEXPECTED))?;
    Ok(Some(text))
}
