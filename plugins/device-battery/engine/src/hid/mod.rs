//! HID inventory records and the device I/O every reader goes through. Readers only
//! see these types, so their exchanges run against scripted devices in tests.
pub(crate) mod backend;
pub(crate) mod caps;
pub(crate) mod descriptor;
pub(crate) mod proof;
pub(crate) mod topology;

#[cfg(test)]
pub(crate) mod fake;

use std::collections::BTreeMap;
use std::time::Duration;

/// Report ID to report length, both counted like Windows does: with the ID byte.
pub(crate) type Sizes = BTreeMap<u8, usize>;

/// One top-level HID collection of the present topology.
#[derive(Clone, Debug, Default)]
pub(crate) struct DeviceInfo {
    /// Lower-cased interface path. Private: never part of any output.
    pub path: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub release_number: u16,
    /// -1 when the path does not name an interface.
    pub interface_number: i32,
    pub usage_page: u16,
    pub usage: u16,
    pub product: String,
    pub serial: String,
    /// `pnp:` + USB parent instance, or `collection:` + path when unproven.
    pub physical_id: String,
    /// Report lengths of the whole collection (input, output, feature).
    pub input_len: Option<usize>,
    pub output_len: Option<usize>,
    pub feature_len: Option<usize>,
    /// Proven per-report lengths. `None` means unproven, which forbids I/O.
    pub input_sizes: Option<Sizes>,
    pub output_sizes: Option<Sizes>,
    pub feature_sizes: Option<Sizes>,
    /// How each direction was proven: from capabilities or the raw descriptor.
    pub input_proven_by: Option<&'static str>,
    pub output_proven_by: Option<&'static str>,
    pub feature_proven_by: Option<&'static str>,
    /// Sizes the raw descriptor declares; diagnostic evidence, never permission.
    pub declared: Option<descriptor::Collection>,
    pub descriptor_error: Option<&'static str>,
    /// Declared report IDs of the two MCHOSE keyboards (input, output).
    pub input_ids: Option<Vec<u8>>,
    pub output_ids: Option<Vec<u8>>,
    /// Windows accepts report 4D in both directions (MCHOSE A7 V3 Ultra+).
    pub v3_windows_report_confirmed: bool,
    /// MCHOSE A5 V2 Ultra: this collection's own metadata was complete.
    pub a5v2_complete: bool,
    pub a5v2_topology: Option<topology::A5v2Proof>,
}

impl DeviceInfo {
    pub(crate) fn is_collection(&self, usage_page: u16, usage: u16) -> bool {
        self.usage_page == usage_page && self.usage == usage
    }

    pub(crate) fn is(&self, vendor_id: u16, product_id: u16) -> bool {
        self.vendor_id == vendor_id && self.product_id == product_id
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct HidError(pub String);

pub(crate) type HidResult<T> = Result<T, HidError>;

/// The operations of one open collection, with hidapi's report ID conventions: writes
/// and feature requests start with the ID byte (0 when unnumbered), and input reads
/// of an unnumbered report omit it.
pub(crate) trait HidDevice {
    fn write(&mut self, data: &[u8]) -> HidResult<usize>;
    /// One input report of at most `len` bytes; empty when none arrived in time.
    /// A zero timeout never waits.
    fn read(&mut self, len: usize, timeout: Duration) -> HidResult<Vec<u8>>;
    fn send_feature(&mut self, data: &[u8]) -> HidResult<usize>;
    fn get_feature(&mut self, report_id: u8, len: usize) -> HidResult<Vec<u8>>;
    fn get_input(&mut self, report_id: u8, len: usize) -> HidResult<Vec<u8>>;
    /// The report descriptor as Windows can reconstruct it. No device command.
    fn report_descriptor(&mut self) -> HidResult<Vec<u8>>;
}

pub(crate) trait HidBus: Send + Sync {
    fn open(&self, path: &str) -> HidResult<Box<dyn HidDevice>>;
}
