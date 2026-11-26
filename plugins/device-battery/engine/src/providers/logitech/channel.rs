//! HID++ requests on one receiver, cabled device or headset dongle. G HUB uses the
//! same collections, so a reply must name our slot, feature and function byte.
use crate::hid::{HidDevice, HidResult};
use crate::providers::context::sleep;
use std::time::{Duration, Instant};

/// Software IDs mark our replies. They rotate, so a late reply never matches.
const SOFTWARE_IDS: [u8; 6] = [0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F];
pub(super) const TIMEOUT: Duration = Duration::from_millis(600);
/// A dozing radio takes up to half a second to answer the first request.
pub(super) const PING_TIMEOUT: Duration = Duration::from_secs(2);
const POLL_GAP_MS: u64 = 5;
const LONG_BYTES: usize = 20;
const REGISTER_READ: u8 = 0x81;
/// "Invalid sub id": a HID++ 1.0 device answered.
pub(super) const ERROR_OLD_PROTOCOL: u8 = 0x01;

#[derive(Debug, PartialEq)]
pub(super) enum Reply {
    /// The reply parameters, zero-padded.
    Data(Vec<u8>),
    Error(u8),
    Timeout,
}

impl Reply {
    pub(super) fn data(self) -> Option<Vec<u8>> {
        match self {
            Reply::Data(data) => Some(data),
            _ => None,
        }
    }
}

pub(super) struct Channel {
    long: Box<dyn HidDevice>,
    /// A receiver sends its error replies as short reports.
    short: Option<Box<dyn HidDevice>>,
    software_id: usize,
}

impl Channel {
    pub(super) fn new(long: Box<dyn HidDevice>, short: Option<Box<dyn HidDevice>>) -> Self {
        Self {
            long,
            short,
            software_id: 0,
        }
    }

    /// Waits for a report of `slot` whose bytes 2.. are `echo`, or an error naming it.
    fn wait(&mut self, slot: u8, echo: [u8; 2], timeout: Duration) -> HidResult<Reply> {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            for device in std::iter::once(&mut self.long).chain(self.short.as_mut()) {
                let report = device.read(64, Duration::ZERO)?;
                if report.len() < 4 || report[1] != slot {
                    continue;
                }
                if matches!(report[2], 0x8F | 0xFF) && report.len() >= 6 && report[3..5] == echo {
                    return Ok(Reply::Error(report[5]));
                }
                if report[2..4] == echo {
                    let mut data = report[4..].to_vec();
                    data.resize(data.len() + 16, 0);
                    return Ok(Reply::Data(data));
                }
            }
            sleep(POLL_GAP_MS);
        }
        Ok(Reply::Timeout)
    }

    /// A HID++ 2.0 request on the long collection.
    pub(super) fn request(
        &mut self,
        slot: u8,
        feature_index: u8,
        function: u8,
        params: &[u8],
        timeout: Duration,
    ) -> HidResult<Reply> {
        self.software_id = (self.software_id + 1) % SOFTWARE_IDS.len();
        let function_byte = (function << 4) | SOFTWARE_IDS[self.software_id];
        let mut frame = [0u8; LONG_BYTES];
        frame[..4].copy_from_slice(&[0x11, slot, feature_index, function_byte]);
        frame[4..4 + params.len()].copy_from_slice(params);
        self.long.write(&frame)?;
        self.wait(slot, [feature_index, function_byte], timeout)
    }

    /// A HID++ 1.0 register read: a short report, never a write to the register.
    pub(super) fn read_register(&mut self, slot: u8, register: u8) -> HidResult<Option<Vec<u8>>> {
        let Some(short) = self.short.as_mut() else {
            return Ok(None);
        };
        short.write(&[0x10, slot, REGISTER_READ, register, 0, 0, 0])?;
        Ok(self.wait(slot, [REGISTER_READ, register], TIMEOUT)?.data())
    }

    /// The index of a feature on the device; 0 when it does not have it.
    pub(super) fn feature_index(&mut self, slot: u8, feature: u16) -> HidResult<u8> {
        let reply = self.request(slot, 0, 0, &feature.to_be_bytes(), TIMEOUT)?;
        Ok(reply.data().map_or(0, |data| data[0]))
    }

    /// A feature function without parameters beyond `params`.
    pub(super) fn call(
        &mut self,
        slot: u8,
        feature_index: u8,
        function: u8,
        params: &[u8],
    ) -> HidResult<Option<Vec<u8>>> {
        Ok(self
            .request(slot, feature_index, function, params, TIMEOUT)?
            .data())
    }
}
