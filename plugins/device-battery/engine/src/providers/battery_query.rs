//! One fixed read request per exact identity: pick the single eligible collection of
//! each physical device, require proven report sizes, send once, read within bounds.
use super::context::{only, proven_groups, read_until, Context};
use crate::hid::proof::report_proven;
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;
use std::time::Duration;

pub(crate) const READ_TIMEOUT: Duration = Duration::from_millis(1000);
const MAX_READS: usize = 32;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct Reading {
    /// `None` with a valid reply: the device says it has no level right now.
    pub level: Option<u8>,
    pub charging: bool,
    pub approximate: bool,
}

impl Reading {
    pub(crate) fn exact(level: u8, charging: bool) -> Self {
        Self {
            level: Some(level),
            charging,
            approximate: false,
        }
    }
}

pub(crate) enum Reply {
    Reading(Reading),
    /// The reply says the device is asleep or offline: stop, report nothing.
    Silent,
    /// Not the answer: keep reading.
    Other,
}

impl From<Option<Reading>> for Reply {
    fn from(value: Option<Reading>) -> Self {
        value.map_or(Reply::Other, Reply::Reading)
    }
}

pub(crate) struct Query {
    /// The reader name, used in device keys.
    pub name: &'static str,
    pub vendor_id: u16,
    pub models: &'static [(u16, &'static str)],
    pub collection: (u16, u16),
    pub input_id: u8,
    pub input_bounds: (usize, usize),
    pub output_id: u8,
    pub output_len: usize,
    pub kind: &'static str,
    pub charging_known: bool,
    pub unconfirmed: bool,
    pub timeout: Duration,
}

impl Query {
    pub(crate) fn poll(
        &self,
        context: &mut Context,
        request: &[u8],
        parse: impl Fn(&[u8]) -> Reply,
    ) -> Vec<Status> {
        let mut result = Vec::new();
        for (physical, infos) in proven_groups(&context.vendor(self.vendor_id)) {
            let Some((info, name)) = self.pick(&infos) else {
                continue;
            };
            let Ok(mut device) = context.open(info) else {
                continue;
            };
            let Ok(Some(reading)) = self.exchange(device.as_mut(), info, request, &parse) else {
                continue;
            };
            result.push(self.status(physical, name, reading));
        }
        result
    }

    pub(crate) fn status(&self, physical: &str, name: &str, reading: Reading) -> Status {
        Status {
            approximate: reading.approximate,
            physical_id: physical.to_string(),
            connection_known: Some(true),
            charging_known: Some(self.charging_known),
            level_unavailable: reading.level.is_none(),
            unconfirmed: self.unconfirmed,
            ..Status::new(
                format!("{}:{physical}", self.name),
                name,
                reading.level,
                reading.charging,
                self.kind,
            )
        }
    }

    /// Exactly one collection of a listed model, with both report sizes proven.
    pub(crate) fn pick<'a>(
        &self,
        infos: &[&'a DeviceInfo],
    ) -> Option<(&'a DeviceInfo, &'static str)> {
        let model = |d: &DeviceInfo| {
            (d.vendor_id == self.vendor_id && d.is_collection(self.collection.0, self.collection.1))
                .then(|| self.models.iter().find(|(id, _)| *id == d.product_id))
                .flatten()
        };
        let info = only(infos, |d| model(d).is_some())?;
        let proven = !info.path.is_empty()
            && report_proven(
                info.input_len,
                &info.input_sizes,
                self.input_id,
                self.input_bounds,
            )
            && report_proven(
                info.output_len,
                &info.output_sizes,
                self.output_id,
                (self.output_len, self.output_len),
            );
        proven
            .then(|| model(info).map(|(_, name)| (info, *name)))
            .flatten()
    }

    pub(crate) fn exchange(
        &self,
        device: &mut dyn HidDevice,
        info: &DeviceInfo,
        request: &[u8],
        parse: &impl Fn(&[u8]) -> Reply,
    ) -> HidResult<Option<Reading>> {
        if device.write(request)? != request.len() {
            return Ok(None);
        }
        // hidapi omits the ID byte of an unnumbered input report.
        let length = info
            .input_len
            .unwrap_or(0)
            .saturating_sub(usize::from(self.input_id == 0));
        let reply = read_until(device, length, self.timeout, MAX_READS, |raw| {
            if raw.len() != length {
                return None;
            }
            match parse(raw) {
                Reply::Reading(reading) => Some(Some(reading)),
                Reply::Silent => Some(None),
                Reply::Other => None,
            }
        })?;
        Ok(reply.flatten())
    }
}
