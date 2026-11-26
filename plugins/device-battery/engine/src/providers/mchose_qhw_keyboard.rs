//! MCHOSE G98 V3: one sequenced QHW read on report 4D.
use super::context::Context;
use super::keyboard_query::Keyboard;
use crate::status::Status;

pub(crate) const VENDORS: &[u16] = &[0x3837];

const KEYBOARD: Keyboard = Keyboard {
    name: "mchose_qhw_keyboard",
    product_id: 0x1015,
    model: "MCHOSE G98 V3",
    product: "MCHOSE G98 V3 2.4G",
    collection: (0xFF80, 1),
    input_id: Some(0x4D),
    output_id: 0x4D,
    min_input: 11,
    min_output: 9,
    exact_output: None,
};

fn request(sequence: u8) -> [u8; 8] {
    [1, 3, 0, 4, 9, 0, sequence, 0x0E ^ sequence]
}

fn parse(payload: &[u8], sequence: u8) -> Option<(u8, bool)> {
    if payload.len() < 10 || payload[..7] != [1, 3, 2, 4, 9, 0, sequence] {
        return None;
    }
    let (charge, level) = (payload[7], payload[8]);
    (charge <= 2 && level <= 100).then_some((level, charge == 1))
}

pub(crate) fn poll(context: &mut Context) -> Vec<Status> {
    let mut sequence = 0u8;
    KEYBOARD.poll(context, |link| {
        let current = sequence;
        sequence = sequence.wrapping_add(1);
        link.exchange(&request(current), |payload| parse(payload, current))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_reply_must_echo_the_sequence() {
        assert_eq!(request(5), [1, 3, 0, 4, 9, 0, 5, 0x0B]);
        let reply = [1, 3, 2, 4, 9, 0, 5, 1, 64, 0];
        assert_eq!(parse(&reply, 5), Some((64, true)));
        assert_eq!(parse(&reply, 6), None);
        assert_eq!(parse(&reply[..9], 5), None);
        for (index, value) in [(2, 0), (7, 3), (8, 101)] {
            let mut bad = reply;
            bad[index] = value;
            assert_eq!(parse(&bad, 5), None);
        }
    }
}
