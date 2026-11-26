//! ZG4 frames: CRC-16 (A001, initial zero) connection replies and FF battery frames.

const PAYLOAD_BYTES: usize = 63;
const MAX_FRAME: usize = 1024;
const PART_BYTES: usize = 58;

pub(super) fn crc16(data: &[u8]) -> u16 {
    data.iter().fold(0u16, |crc, &byte| {
        (0..8).fold(crc ^ u16::from(byte), |crc, _| {
            (crc >> 1) ^ if crc & 1 != 0 { 0xA001 } else { 0 }
        })
    })
}

pub(super) fn status_request() -> [u8; 64] {
    let [low, high] = crc16(&[1, 2]).to_le_bytes();
    let mut frame = [0; 64];
    frame[..9].copy_from_slice(&[0xCD, 7, 0xAA, 0x5A, 0xCC, low, high, 1, 2]);
    frame
}

pub(super) fn battery_request(sequence: u8) -> [u8; 64] {
    let mut frame = [0; 64];
    frame[..12].copy_from_slice(&[0xCD, 0xEE, 0x80, 0, 6, 0, 0xFF, sequence, 2, 0xFE, 7, 0xAA]);
    frame
}

pub(super) fn input_payload(report: &[u8]) -> Option<&[u8]> {
    (report.len() == 64 && report[0] == 0xCE).then(|| &report[1..])
}

/// Whether the headset is connected; `None` for anything but a checksummed
/// opcode-02 reply. The byte before `AA CC` is opaque.
pub(super) fn connection_reply(payload: &[u8]) -> Option<bool> {
    if payload.len() != PAYLOAD_BYTES {
        return None;
    }
    let (prefix, data) = if payload[..2] == [0xAA, 0xCC] {
        (None, payload)
    } else if payload[1..3] == [0xAA, 0xCC] {
        (Some(payload[0]), &payload[1..])
    } else {
        return None;
    };
    let length = usize::from(data[3]);
    if !(1..=57).contains(&length) || data[6] != 2 {
        return None;
    }
    if prefix.is_some_and(|prefix| usize::from(prefix) != 7 + length) {
        return None;
    }
    let checksum = u16::from_le_bytes([data[4], data[5]]);
    // The source supports two CRC lengths; exactly one may agree.
    let mut matches = [6 + length, 7 + length].into_iter().filter(|&end| {
        (8..=data.len()).contains(&end)
            && data[end..].iter().all(|&b| b == 0)
            && crc16(&data[6..end]) == checksum
    });
    let found = matches.next().is_some() && matches.next().is_none();
    found.then(|| data[7] == 1)
}

/// `FF seq len cmd .. AA`, complete.
pub(super) fn is_frame(data: &[u8]) -> bool {
    (5..=MAX_FRAME).contains(&data.len())
        && data[0] == 0xFF
        && data[2] >= 1
        && data.len() == usize::from(data[2]) + 4
        && data.last() == Some(&0xAA)
}

/// A whole FF frame inside one payload, followed only by padding.
pub(super) fn single_frame(payload: &[u8]) -> Option<Vec<u8>> {
    let end = usize::from(*payload.get(2)?) + 4;
    ((5..=payload.len()).contains(&end) && payload[end..].iter().all(|&b| b == 0))
        .then(|| payload[..end].to_vec())
}

/// (percent, charging) from the answer to `sequence`; an ACK is not a measurement.
pub(super) fn battery_reply(frame: &[u8], sequence: u8) -> Option<(u8, bool)> {
    if !is_frame(frame) || frame[1] != sequence {
        return None;
    }
    let mut value = &frame[4..frame.len() - 1];
    match frame[3] {
        0xFE => {
            let (&command, rest) = value.split_first()?;
            if command != 7 {
                return None;
            }
            value = rest;
        }
        7 => {}
        _ => return None,
    }
    if value.len() < 3 {
        return None;
    }
    let level = value[0] & 0x7F;
    (1..=100)
        .contains(&level)
        .then_some((level, value[0] & 0x80 != 0))
}

/// One exact EE/EA chain; once broken it stays broken.
#[derive(Default)]
pub(super) struct Assembler {
    data: Vec<u8>,
    /// (total length, marker) from the first part.
    header: Option<(usize, u8)>,
    next_part: u8,
    failed: bool,
}

impl Assembler {
    pub(super) fn started(&self) -> bool {
        self.header.is_some()
    }

    /// The assembled frame once the last part arrives.
    pub(super) fn feed(&mut self, payload: &[u8]) -> Option<Vec<u8>> {
        if self.failed || payload.len() != PAYLOAD_BYTES || !matches!(payload[0], 0xEE | 0xEA) {
            return None;
        }
        let (part, last) = (payload[1] & 127, payload[1] & 128 != 0);
        let total = usize::from(u16::from_le_bytes([payload[3], payload[4]]));
        let (expected, valid) = match self.header {
            None => {
                self.header = Some((total, payload[0]));
                (total, part == 0 && (5..=MAX_FRAME).contains(&total))
            }
            Some((expected, marker)) => (expected, total == 0 && payload[0] == marker),
        };
        let remaining = expected.saturating_sub(self.data.len());
        let count = remaining.min(PART_BYTES);
        if !valid
            || payload[2] != 0
            || part != self.next_part
            || remaining == 0
            || last != (remaining <= PART_BYTES)
            || payload[5 + count..].iter().any(|&b| b != 0)
        {
            self.failed = true;
            return None;
        }
        self.data.extend_from_slice(&payload[5..5 + count]);
        self.next_part = self.next_part.saturating_add(1);
        last.then(|| self.data.clone())
    }
}
