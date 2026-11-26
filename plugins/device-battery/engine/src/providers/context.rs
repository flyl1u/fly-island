//! What a reader may touch: the collections of one physical device (or none for the
//! system readers) and the bus that opens them.
use crate::hid::{DeviceInfo, HidBus, HidDevice, HidResult};
use std::time::{Duration, Instant};

pub(crate) struct Context<'a> {
    pub devices: &'a [DeviceInfo],
    pub bus: &'a dyn HidBus,
    /// A fixed code explaining why nothing could be read, when a reader has one.
    pub failure: Option<String>,
}

impl<'a> Context<'a> {
    pub(crate) fn new(devices: &'a [DeviceInfo], bus: &'a dyn HidBus) -> Self {
        Self {
            devices,
            bus,
            failure: None,
        }
    }

    pub(crate) fn vendor(&self, vendor_id: u16) -> Vec<&'a DeviceInfo> {
        self.devices
            .iter()
            .filter(|d| d.vendor_id == vendor_id)
            .collect()
    }

    pub(crate) fn open(&self, info: &DeviceInfo) -> HidResult<Box<dyn HidDevice>> {
        self.bus.open(&info.path)
    }
}

/// Collections of one vendor grouped by physical device, in a stable order. Groups
/// whose USB parent is unproven are left out: uniqueness cannot be shown for them.
pub(crate) fn proven_groups<'a>(infos: &[&'a DeviceInfo]) -> Vec<(&'a str, Vec<&'a DeviceInfo>)> {
    let mut groups: Vec<(&str, Vec<&DeviceInfo>)> = Vec::new();
    for info in infos {
        let physical = info.physical_id.as_str();
        if physical.starts_with("collection:") {
            continue;
        }
        match groups.iter_mut().find(|(key, _)| *key == physical) {
            Some((_, list)) => list.push(info),
            None => groups.push((physical, vec![info])),
        }
    }
    groups
}

/// The only item matching the predicate.
pub(crate) fn only<'a>(
    infos: &[&'a DeviceInfo],
    matches: impl Fn(&DeviceInfo) -> bool,
) -> Option<&'a DeviceInfo> {
    let mut found = infos.iter().copied().filter(|d| matches(d));
    let first = found.next()?;
    found.next().is_none().then_some(first)
}

/// Up to `max_reads` input reports before `deadline`, until `accept` returns a value.
/// An empty read ends the wait.
pub(crate) fn read_until<T>(
    device: &mut dyn HidDevice,
    len: usize,
    timeout: Duration,
    max_reads: usize,
    mut accept: impl FnMut(&[u8]) -> Option<T>,
) -> HidResult<Option<T>> {
    let deadline = Instant::now() + timeout;
    for _ in 0..max_reads {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        let report = device.read(len, remaining.max(Duration::from_millis(1)))?;
        if report.is_empty() {
            break;
        }
        if let Some(value) = accept(&report) {
            return Ok(Some(value));
        }
    }
    Ok(None)
}

pub(crate) fn sleep(millis: u64) {
    std::thread::sleep(Duration::from_millis(millis));
}
