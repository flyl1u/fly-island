//! Per-thread COM and WinRT initialization guards.

use std::marker::PhantomData;

use windows::Win32::System::{
    Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED},
    WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
};

/// Keeps COM initialized in the multithreaded apartment on the current thread and
/// uninitializes it when dropped. Not `Send`: the uninitialize must run on the
/// thread that initialized.
pub(crate) struct ComApartment {
    _thread_bound: PhantomData<*const ()>,
}

impl ComApartment {
    pub(crate) fn multithreaded() -> windows::core::Result<Self> {
        // SAFETY: CoInitializeEx takes no pointers here (the reserved argument is
        // None). Any success, including S_FALSE when COM is already initialized
        // on this thread, is balanced by exactly one CoUninitialize in Drop; a
        // failure returns before a guard exists, so nothing is uninitialized.
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.ok()?;
        Ok(Self {
            _thread_bound: PhantomData,
        })
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        // SAFETY: pairs the successful CoInitializeEx in `multithreaded`, on the
        // same thread because the guard is not Send.
        unsafe { CoUninitialize() };
    }
}

/// Keeps the Windows Runtime initialized in the multithreaded apartment on the
/// current thread and uninitializes it when dropped. Not `Send`, for the same
/// reason as [`ComApartment`].
pub(crate) struct WinRtApartment {
    _thread_bound: PhantomData<*const ()>,
}

impl WinRtApartment {
    pub(crate) fn multithreaded() -> windows::core::Result<Self> {
        // SAFETY: RoInitialize takes no pointers. Any success, including S_FALSE,
        // is balanced by exactly one RoUninitialize in Drop; a failure returns
        // before a guard exists.
        unsafe { RoInitialize(RO_INIT_MULTITHREADED) }?;
        Ok(Self {
            _thread_bound: PhantomData,
        })
    }
}

impl Drop for WinRtApartment {
    fn drop(&mut self) {
        // SAFETY: pairs the successful RoInitialize in `multithreaded`, on the
        // same thread because the guard is not Send.
        unsafe { RoUninitialize() };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apartments_can_be_entered_repeatedly_and_nested() {
        std::thread::spawn(|| {
            for _ in 0..2 {
                let _com = ComApartment::multithreaded().unwrap();
                let _winrt = WinRtApartment::multithreaded().unwrap();
            }
        })
        .join()
        .unwrap();
    }
}
