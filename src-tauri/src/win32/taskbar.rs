//! Add or remove a window's taskbar button without changing its visibility or focus.

use windows::Win32::{
    Foundation::HWND,
    System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER},
    UI::Shell::{ITaskbarList, TaskbarList},
};

use super::com::ComApartment;

pub(crate) fn set_button_visible(window: HWND, visible: bool) -> windows::core::Result<()> {
    let _apartment = ComApartment::multithreaded()?;
    // SAFETY: COM is initialized on this thread and the interface is dropped before the apartment.
    // The taskbar methods take the HWND by value and handle a window that has since closed.
    unsafe {
        let taskbar: ITaskbarList = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)?;
        taskbar.HrInit()?;
        if visible {
            taskbar.AddTab(window)
        } else {
            taskbar.DeleteTab(window)
        }
    }
}
