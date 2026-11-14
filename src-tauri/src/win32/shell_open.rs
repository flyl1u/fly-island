//! Opens a URL through its registered handler without any shell error dialog.

use windows::{
    core::{w, HSTRING, PCWSTR},
    Win32::UI::{
        Shell::{ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW},
        WindowsAndMessaging::SW_SHOWNORMAL,
    },
};

/// Opens `url` with its registered protocol handler. Unlike `ShellExecuteW` (and
/// the opener plugin), `SEE_MASK_FLAG_NO_UI` stops Windows from showing its own
/// "no application is associated" dialog when the protocol is not registered;
/// the failure is only reported through the return value.
pub(crate) fn open_url_without_ui(url: &str) -> bool {
    let file = HSTRING::from(url);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_FLAG_NO_UI | SEE_MASK_NOASYNC,
        lpVerb: w!("open"),
        lpFile: PCWSTR(file.as_ptr()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };
    // SAFETY: `info` is fully initialized with its own size; `lpVerb` is a static
    // wide string and `lpFile` points into `file`, which outlives the call.
    // ShellExecuteExW only writes the output fields of `info`.
    unsafe { ShellExecuteExW(&mut info).is_ok() }
}
