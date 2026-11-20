//! JSON open/save dialogs. Each call owns an STA on a fresh thread, like folder_dialog.
use std::marker::PhantomData;
use windows::{
    core::{HRESULT, HSTRING, PWSTR},
    Win32::{
        Foundation::{ERROR_CANCELLED, HWND},
        System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE},
        UI::Shell::{Common::COMDLG_FILTERSPEC, FileOpenDialog, FileSaveDialog, IFileDialog,
            IFileOpenDialog, IFileSaveDialog, FOS_FILEMUSTEXIST, FOS_FORCEFILESYSTEM,
            FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST, SIGDN_FILESYSPATH},
    },
};

struct Apartment(PhantomData<*const ()>);
impl Drop for Apartment {
    fn drop(&mut self) {
        // SAFETY: initialized on this same thread; PhantomData makes the guard non-Send.
        unsafe { CoUninitialize() };
    }
}
struct ShellString(PWSTR);
impl Drop for ShellString {
    fn drop(&mut self) {
        // SAFETY: GetDisplayName allocated this buffer with the COM task allocator.
        unsafe { CoTaskMemFree(Some(self.0.as_ptr().cast())) };
    }
}

pub(crate) fn choose_json(owner: isize, save_name: Option<&str>, title: &str) -> windows::core::Result<Option<String>> {
    // SAFETY: reserved argument is null, and successful initialization is paired by the guard.
    unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) }.ok()?;
    let _apartment = Apartment(PhantomData);
    // SAFETY: COM is initialized; all interfaces stay on this thread and drop before the guard.
    let dialog: IFileDialog = unsafe {
        if save_name.is_some() {
            let dialog: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)?;
            dialog.into()
        } else {
            let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)?;
            dialog.into()
        }
    };
    let label = HSTRING::from("JSON (*.json)");
    let pattern = HSTRING::from("*.json");
    let filters = [COMDLG_FILTERSPEC { pszName: windows::core::PCWSTR(label.as_ptr()), pszSpec: windows::core::PCWSTR(pattern.as_ptr()) }];
    // SAFETY: all strings and filter buffers outlive these calls; owner is the calling window.
    unsafe {
        let options = dialog.GetOptions()? | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST;
        dialog.SetOptions(options | if save_name.is_some() { FOS_OVERWRITEPROMPT } else { FOS_FILEMUSTEXIST })?;
        dialog.SetFileTypes(&filters)?;
        dialog.SetDefaultExtension(&HSTRING::from("json"))?;
        dialog.SetTitle(&HSTRING::from(title))?;
        if let Some(name) = save_name { dialog.SetFileName(&HSTRING::from(name))?; }
        if let Err(error) = dialog.Show(Some(HWND(owner as *mut _))) {
            if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) { return Ok(None); }
            return Err(error);
        }
    }
    // SAFETY: Show succeeded; FORCEFILESYSTEM guarantees a filesystem path; the RAII guard frees it.
    let path = ShellString(unsafe { dialog.GetResult()?.GetDisplayName(SIGDN_FILESYSPATH)? });
    // SAFETY: GetDisplayName returned a valid NUL-terminated UTF-16 string.
    let result = unsafe { path.0.to_string() }.map_err(|_| windows::core::Error::from_hresult(windows::Win32::Foundation::E_UNEXPECTED))?;
    Ok(Some(result))
}
