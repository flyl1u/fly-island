//! What the scheduler needs from the system, so rounds run against fakes in tests.
use crate::hid::backend::SystemBus;
use crate::hid::{topology, DeviceInfo, HidBus};
use crate::providers::context::Context;
use crate::providers::registry::{Reader, Source};
use crate::providers::{bluetooth, xinput};
use crate::status::Status;

#[derive(Default)]
pub(crate) struct ReadResult {
    pub statuses: Vec<Status>,
    /// A fixed code explaining why nothing could be read.
    pub failure: Option<String>,
}

pub(crate) trait Platform: Send + Sync {
    /// The present HID interface paths; `None` when Windows would not list them.
    fn interface_paths(&self) -> Option<Vec<String>>;
    /// Metadata of those interfaces. No device command is sent.
    fn discover(&self, paths: &[String]) -> Vec<DeviceInfo>;
    /// Runs one reader over one physical device's collections. `Err`: the query
    /// itself failed.
    fn read(&self, reader: Reader, devices: &[DeviceInfo]) -> Result<ReadResult, ()>;
}

/// Runs a HID reader against `bus`.
pub(crate) fn read_hid(
    poll: crate::providers::registry::Poll,
    devices: &[DeviceInfo],
    bus: &dyn HidBus,
) -> ReadResult {
    let mut context = Context::new(devices, bus);
    let statuses = poll(&mut context);
    ReadResult {
        statuses,
        failure: context.failure,
    }
}

pub(crate) struct SystemPlatform {
    bus: SystemBus,
}

impl SystemPlatform {
    pub(crate) fn new() -> Self {
        Self {
            bus: SystemBus::new(),
        }
    }
}

impl Platform for SystemPlatform {
    fn interface_paths(&self) -> Option<Vec<String>> {
        crate::win32::paths::hid_interface_paths()
    }

    fn discover(&self, paths: &[String]) -> Vec<DeviceInfo> {
        topology::discover(paths, &self.bus)
    }

    fn read(&self, reader: Reader, devices: &[DeviceInfo]) -> Result<ReadResult, ()> {
        let statuses = match reader.source {
            Source::Vendors(_, poll) | Source::AnyDevice(poll) => {
                return Ok(read_hid(poll, devices, &self.bus));
            }
            Source::XInput => xinput::poll(),
            Source::Bluetooth => bluetooth::poll().ok_or(())?,
        };
        Ok(ReadResult {
            statuses,
            failure: None,
        })
    }
}
