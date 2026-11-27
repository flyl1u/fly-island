use windows::{
    core::{GUID, PCWSTR},
    Win32::{
        System::Com::{CoCreateInstance, CLSCTX_LOCAL_SERVER},
        UI::Notifications::INotificationActivationCallback,
    },
};

use super::com::ComApartment;

pub(crate) fn activate(
    activator: &GUID,
    app_id: &str,
    arguments: &str,
) -> windows::core::Result<()> {
    let _apartment = ComApartment::multithreaded()?;
    let app_id: Vec<u16> = app_id.encode_utf16().chain([0]).collect();
    let arguments: Vec<u16> = arguments.encode_utf16().chain([0]).collect();
    // SAFETY: COM is initialized on this thread and the CLSID and requested IID are valid.
    let callback: INotificationActivationCallback =
        unsafe { CoCreateInstance(activator, None, CLSCTX_LOCAL_SERVER) }?;
    // SAFETY: the interface and UTF-16 buffers are live for the call. No input data is supplied.
    unsafe { callback.Activate(PCWSTR(app_id.as_ptr()), PCWSTR(arguments.as_ptr()), &[]) }
}
