//! The real bus: hidapi with its pure-Rust Windows backend, linked statically.
use super::{HidBus, HidDevice, HidError, HidResult};
use crate::win32::hid_meta::MetaDevice;
use std::ffi::CString;
use std::sync::Mutex;
use std::time::Duration;

pub(crate) struct SystemBus {
    api: Mutex<Option<hidapi::HidApi>>,
}

impl SystemBus {
    pub(crate) fn new() -> Self {
        Self {
            api: Mutex::new(None),
        }
    }
}

fn error(source: hidapi::HidError) -> HidError {
    HidError(source.to_string())
}

impl HidBus for SystemBus {
    fn open(&self, path: &str) -> HidResult<Box<dyn HidDevice>> {
        let name = CString::new(path).map_err(|_| HidError("invalid device path".into()))?;
        let mut api = self
            .api
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if api.is_none() {
            // Never enumerate: that opens every HID device, excluded ones included.
            hidapi::HidApi::disable_device_discovery();
            *api = Some(hidapi::HidApi::new().map_err(error)?);
        }
        let Some(api) = api.as_ref() else {
            return Err(HidError("HID backend unavailable".into()));
        };
        let device = api.open_path(&name).map_err(error)?;
        Ok(Box::new(SystemDevice(device, path.to_string())))
    }
}

/// The open device and its path.
struct SystemDevice(hidapi::HidDevice, String);

impl HidDevice for SystemDevice {
    fn write(&mut self, data: &[u8]) -> HidResult<usize> {
        // The backend reports 0 when Windows completes the write synchronously.
        self.0
            .write(data)
            .map(|n| if n == 0 { data.len() } else { n })
            .map_err(error)
    }

    fn read(&mut self, len: usize, timeout: Duration) -> HidResult<Vec<u8>> {
        let mut buffer = vec![0u8; len.max(1)];
        let millis = i32::try_from(timeout.as_millis()).unwrap_or(i32::MAX);
        let n = self.0.read_timeout(&mut buffer, millis).map_err(error)?;
        buffer.truncate(n.min(len));
        Ok(buffer)
    }

    fn send_feature(&mut self, data: &[u8]) -> HidResult<usize> {
        self.0.send_feature_report(data).map_err(error)?;
        Ok(data.len())
    }

    fn get_feature(&mut self, report_id: u8, len: usize) -> HidResult<Vec<u8>> {
        let mut buffer = vec![0u8; len.max(1)];
        buffer[0] = report_id;
        let n = self.0.get_feature_report(&mut buffer).map_err(error)?;
        buffer.truncate(n.min(len));
        Ok(buffer)
    }

    fn get_input(&mut self, report_id: u8, len: usize) -> HidResult<Vec<u8>> {
        // The hidapi Windows backend has no GET_REPORT for input reports.
        MetaDevice::open(&self.1)
            .and_then(|device| device.input_report(report_id, len))
            .ok_or_else(|| HidError("input report read failed".into()))
    }

    fn report_descriptor(&mut self) -> HidResult<Vec<u8>> {
        let mut buffer = vec![0u8; 4096];
        let n = self.0.get_report_descriptor(&mut buffer).map_err(error)?;
        buffer.truncate(n);
        Ok(buffer)
    }
}
