//! Exchanges of the two researched MCHOSE keyboards: exact product string, one
//! collection and exactly one declared report ID per direction.
use super::context::{only, proven_groups, read_until, Context};
use crate::hid::{DeviceInfo, HidDevice, HidResult};
use crate::status::Status;
use std::time::Duration;

const MAX_REPORT: usize = 4096;

pub(crate) struct Keyboard {
    pub name: &'static str,
    pub product_id: u16,
    pub model: &'static str,
    pub product: &'static str,
    pub collection: (u16, u16),
    /// `None`: take the single input ID the descriptor declares.
    pub input_id: Option<u8>,
    pub output_id: u8,
    pub min_input: usize,
    pub min_output: usize,
    pub exact_output: Option<usize>,
}

/// One open, validated keyboard.
pub(crate) struct Link<'a> {
    device: Box<dyn HidDevice>,
    info: &'a DeviceInfo,
    input_id: u8,
    output_id: u8,
}

impl Link<'_> {
    /// Sends one output report and returns the first input payload (without its ID
    /// byte) that `parse` accepts.
    pub(crate) fn exchange<T>(
        &mut self,
        payload: &[u8],
        parse: impl Fn(&[u8]) -> Option<T>,
    ) -> HidResult<Option<T>> {
        let mut request = vec![self.output_id];
        request.extend_from_slice(payload);
        request.resize(self.info.output_len.unwrap_or(0).max(request.len()), 0);
        if self.device.write(&request)? != request.len() {
            return Ok(None);
        }
        let id = self.input_id;
        let length = self
            .info
            .input_len
            .unwrap_or(0)
            .saturating_sub(usize::from(id == 0));
        read_until(
            self.device.as_mut(),
            length,
            Duration::from_millis(1000),
            32,
            |raw| {
                if raw.len() != length || (id != 0 && raw[0] != id) {
                    return None;
                }
                parse(&raw[usize::from(id != 0)..])
            },
        )
    }
}

impl Keyboard {
    fn pick<'a>(&self, infos: &[&'a DeviceInfo]) -> Option<(&'a DeviceInfo, u8)> {
        let info = only(infos, |d| {
            d.is(0x3837, self.product_id)
                && d.product == self.product
                && d.is_collection(self.collection.0, self.collection.1)
        })?;
        let (input, output) = (info.input_len?, info.output_len?);
        if info.path.is_empty()
            || !(self.min_input..=MAX_REPORT).contains(&input)
            || !(self.min_output..=MAX_REPORT).contains(&output)
            || self.exact_output.is_some_and(|exact| output != exact)
        {
            return None;
        }
        let (Some([input_id]), Some([output_id])) =
            (info.input_ids.as_deref(), info.output_ids.as_deref())
        else {
            return None;
        };
        let expected_input = self.input_id.is_none_or(|id| id == *input_id);
        (expected_input && *output_id == self.output_id).then_some((info, *input_id))
    }

    /// Runs `query` on every proven keyboard; it returns (percent, charging).
    pub(crate) fn poll(
        &self,
        context: &mut Context,
        mut query: impl FnMut(&mut Link) -> HidResult<Option<(u8, bool)>>,
    ) -> Vec<Status> {
        let mut result = Vec::new();
        for (physical, infos) in proven_groups(&context.vendor(0x3837)) {
            let Some((info, input_id)) = self.pick(&infos) else {
                continue;
            };
            let Ok(device) = context.open(info) else {
                continue;
            };
            let mut link = Link {
                device,
                info,
                input_id,
                output_id: self.output_id,
            };
            let Ok(Some((level, charging))) = query(&mut link) else {
                continue;
            };
            result.push(Status {
                physical_id: physical.to_string(),
                connection_known: Some(true),
                charging_known: Some(true),
                ..Status::new(
                    format!("{}:{physical}", self.name),
                    self.model,
                    Some(level),
                    charging,
                    "keyboard",
                )
            });
        }
        result
    }
}
