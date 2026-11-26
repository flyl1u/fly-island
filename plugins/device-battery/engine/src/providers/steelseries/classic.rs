//! Older Arctis headsets and the Nova Pro Wireless base stations: each has its own
//! request on its own interface (HeadsetControl; echo checks and the Arctis 7
//! connection query from the Linux driver). A report that is not the answer is
//! never read as a level.
use super::parsers::Reading;

/// Writes the request and returns the first reply `accept` takes.
pub(super) type Ask<'a> = dyn FnMut(&[u8], fn(&[u8]) -> bool) -> Option<Vec<u8>> + 'a;
pub(super) type Exchange = fn(&mut Ask) -> Reading;

#[derive(Clone, Copy)]
pub(super) struct Model {
    pub product_id: u16,
    pub name: &'static str,
    pub interfaces: &'static [i32],
    /// `None`: any vendor page (0xFF00 and above).
    pub usage_page: Option<u16>,
    pub exchange: Exchange,
    /// A nine-step level, shown as approximate.
    pub coarse: bool,
}

const fn model(
    product_id: u16,
    name: &'static str,
    interfaces: &'static [i32],
    usage_page: Option<u16>,
    exchange: Exchange,
) -> Model {
    Model {
        product_id,
        name,
        interfaces,
        usage_page,
        exchange,
        coarse: false,
    }
}

const fn nova_pro_station(product_id: u16, name: &'static str) -> Model {
    Model {
        coarse: true,
        ..model(product_id, name, &[3, 4], None, nova_pro)
    }
}

// The Arctis Pro GameDAC (1280) is wired and has no battery.
pub(super) const MODELS: [Model; 11] = [
    model(0x12B3, "Arctis 1 Wireless", &[3], Some(0xFF43), arctis1),
    model(
        0x12B6,
        "Arctis 1 Wireless Xbox",
        &[3],
        Some(0xFF43),
        arctis1,
    ),
    model(0x12D7, "Arctis 7X", &[3], Some(0xFF43), arctis1),
    model(0x12D5, "Arctis 7P", &[3], Some(0xFF43), arctis1),
    model(0x12AD, "Arctis 7", &[5], None, arctis7_2018),
    model(0x1260, "Arctis 7", &[5], None, arctis7),
    model(0x1252, "Arctis Pro Wireless 2019", &[5], None, arctis7),
    model(0x12C2, "Arctis 9", &[0], None, arctis9),
    model(0x1290, "Arctis Pro Wireless", &[0], None, pro_wireless),
    nova_pro_station(0x12E0, "Arctis Nova Pro Wireless"),
    nova_pro_station(0x12E5, "Arctis Nova Pro Wireless X"),
];

fn echo_06_12(reply: &[u8]) -> bool {
    reply.len() >= 4 && reply[..2] == [0x06, 0x12]
}

fn echo_06_14(reply: &[u8]) -> bool {
    reply.len() >= 4 && reply[..2] == [0x06, 0x14]
}

fn echo_06_18(reply: &[u8]) -> bool {
    reply.len() >= 4 && reply[..2] == [0x06, 0x18]
}

/// `06 12 <status> <level>`; status 01 is off. No charging flag.
fn arctis1(ask: &mut Ask) -> Reading {
    let reply = ask(&[0x06, 0x12], echo_06_12)?;
    (reply[2] != 0x01 && reply[3] <= 100).then(|| (reply[3], false))
}

/// A connection query first (03 is connected); the level "sometimes overreports"
/// and is capped, as the Linux driver does.
fn arctis7_2018(ask: &mut Ask) -> Reading {
    if ask(&[0x06, 0x14], echo_06_14)?[2] != 0x03 {
        return None;
    }
    let reply = ask(&[0x06, 0x18], echo_06_18)?;
    Some((reply[2].min(100), false))
}

/// No connection query: the level reads 0 while the headset is off.
fn arctis7(ask: &mut Ask) -> Reading {
    let reply = ask(&[0x06, 0x18], echo_06_18)?;
    (reply[2] != 0).then(|| (reply[2].min(100), false))
}

/// `aa 01 <?> <raw> <charging>`; raw 0x64..=0x9A maps to 0..=100.
fn arctis9(ask: &mut Ask) -> Reading {
    fn answer(reply: &[u8]) -> bool {
        reply.len() >= 5 && matches!(reply[0], 0xAA | 0x55)
    }
    let reply = ask(&[0x00, 0x20], answer)?;
    if reply[..2] != [0xAA, 0x01] {
        return None;
    }
    let raw = u16::from(reply[3].clamp(0x64, 0x9A));
    let level = (raw - 0x64) * 100 / (0x9A - 0x64);
    Some((level as u8, reply[4] == 0x01))
}

fn padded(head: [u8; 2]) -> [u8; 31] {
    let mut request = [0; 31];
    request[..2].copy_from_slice(&head);
    request
}

/// State (02 off, 04 on), then a 0..=4 level; neither reply echoes the request.
fn pro_wireless(ask: &mut Ask) -> Reading {
    fn state(reply: &[u8]) -> bool {
        matches!(reply.first(), Some(0x02 | 0x04))
    }
    fn level(reply: &[u8]) -> bool {
        matches!(reply.first(), Some(0..=4))
    }
    if ask(&padded([0x41, 0xAA]), state)?[0] == 0x02 {
        return None;
    }
    let reply = ask(&padded([0x40, 0xAA]), level)?;
    Some((reply[0] * 25, false))
}

/// A nine-step code in byte 6 gated by the state in byte 15: 01 off, 02 charging,
/// 08 on battery. Only those states count as the battery answer.
fn nova_pro(ask: &mut Ask) -> Reading {
    fn answer(reply: &[u8]) -> bool {
        reply.len() >= 16 && matches!(reply[15], 0x01 | 0x02 | 0x08)
    }
    let reply = ask(&[0x06, 0xB0], answer)?;
    if reply[15] == 0x01 || reply[6] > 8 {
        return None;
    }
    let level = u16::from(reply[6]) * 100 / 8;
    Some((level as u8, reply[15] == 0x02))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(exchange: Exchange, replies: &[&[u8]]) -> Reading {
        let mut queue = replies.iter();
        let mut ask = |_: &[u8], accept: fn(&[u8]) -> bool| {
            queue.next().filter(|r| accept(r)).map(|r| r.to_vec())
        };
        exchange(&mut ask)
    }

    #[test]
    fn classic_exchanges_gate_on_state_and_echo() {
        assert_eq!(run(arctis1, &[&[6, 0x12, 0, 80]]), Some((80, false)));
        assert_eq!(run(arctis1, &[&[6, 0x12, 1, 80]]), None);
        let linked: &[u8] = &[6, 0x14, 3, 0];
        assert_eq!(
            run(arctis7_2018, &[linked, &[6, 0x18, 110, 0]]),
            Some((100, false))
        );
        assert_eq!(run(arctis7, &[&[6, 0x18, 0, 0]]), None);
        assert_eq!(run(arctis9, &[&[0xAA, 1, 0, 0x7F, 1]]), Some((50, true)));
        assert_eq!(run(arctis9, &[&[0x55, 1, 0, 0x7F, 1]]), None);
        assert_eq!(run(pro_wireless, &[&[4], &[3]]), Some((75, false)));
        let mut station = [0u8; 16];
        station[6] = 5;
        station[15] = 0x08;
        assert_eq!(run(nova_pro, &[&station]), Some((62, false)));
        station[6] = 9;
        assert_eq!(run(nova_pro, &[&station]), None);
    }
}
