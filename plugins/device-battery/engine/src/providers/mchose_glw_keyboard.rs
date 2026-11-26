//! MCHOSE G87 V2 (GLW): read the active profile, then its configuration page; the
//! battery is byte 32. Only the documented read commands can be built.
use super::context::Context;
use super::keyboard_query::{Keyboard, Link};
use crate::hid::HidResult;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x3837];

const KEYBOARD: Keyboard = Keyboard {
    name: "mchose_glw_keyboard",
    product_id: 0x3033,
    model: "MCHOSE G87 V2",
    product: "MCHOSE G87 V2 2.4G",
    collection: (1, 0),
    input_id: None,
    output_id: 0,
    min_input: 65,
    min_output: 65,
    exact_output: Some(65),
};

#[derive(Clone, Copy)]
struct Read {
    command: u8,
    offset: u16,
    length: u8,
}

impl Read {
    const BASE: Read = Read {
        command: 4,
        offset: 0,
        length: 56,
    };

    fn request(self) -> [u8; 64] {
        let [low, high] = self.offset.to_le_bytes();
        let mut payload = [0u8; 64];
        payload[..8].copy_from_slice(&[0x55, self.command, 0, 0, self.length, low, high, 0]);
        payload[3] = payload[4..].iter().fold(0u8, |sum, &b| sum.wrapping_add(b));
        payload
    }

    fn parse(self, payload: &[u8]) -> Option<Vec<u8>> {
        let [low, high] = self.offset.to_le_bytes();
        if payload.len() < 64
            || payload[..2] != [0xAA, self.command]
            || payload[4] != self.length
            || payload[5..7] != [low, high]
        {
            return None;
        }
        Some(payload[8..8 + usize::from(self.length)].to_vec())
    }
}

fn active_profile(data: &[u8]) -> Option<u16> {
    if data.len() != 56 || data[0] > 3 {
        return None;
    }
    let slots = &data[2..6];
    let mut sorted = slots.to_vec();
    sorted.sort_unstable();
    let profile = if sorted == [0, 1, 2, 3] {
        slots[usize::from(data[0])]
    } else {
        data[0]
    };
    Some(u16::from(profile))
}

fn battery(config: &[u8]) -> Option<(u8, bool)> {
    let value = *config.get(32)?;
    let level = value & 0x7F;
    (level <= 100).then_some((level, value & 0x80 != 0))
}

fn query(link: &mut Link) -> HidResult<Option<(u8, bool)>> {
    let mut read = |step: Read| link.exchange(&step.request(), |payload| step.parse(payload));
    let Some(profile) = read(Read::BASE)?.as_deref().and_then(active_profile) else {
        return Ok(None);
    };
    let page = 64 * profile;
    let Some(mut config) = read(Read {
        command: 5,
        offset: page,
        length: 56,
    })?
    else {
        return Ok(None);
    };
    let Some(tail) = read(Read {
        command: 5,
        offset: page + 56,
        length: 8,
    })?
    else {
        return Ok(None);
    };
    config.extend(tail);
    Ok(battery(&config))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    KEYBOARD.poll(context, query)
}

#[cfg(test)]
mod tests;
