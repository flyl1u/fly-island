//! Paired Bluetooth devices: the Windows battery property of any of a device's PnP
//! nodes, shown only while the device is connected. Nothing is sent to a device.
use crate::status::Status;
use std::time::{Duration, Instant};

/// All radio queries of one poll together; the reader itself has a larger budget.
const RADIO_BUDGET: Duration = Duration::from_secs(8);
const AUDIO_SERVICES: [&str; 4] = ["0000110b-", "0000111e-", "00001108-", "00001131-"];

/// One present BTHENUM / BTHLE / BTHLEDEVICE node.
#[derive(Clone, Debug, Default)]
pub(crate) struct PnpNode {
    pub id: String,
    pub name: String,
    pub status_ok: bool,
    pub battery: Option<u8>,
    pub connected: Option<bool>,
}

/// What WinRT says about one paired device.
#[derive(Clone, Copy, Debug, Default)]
pub(crate) struct RadioState {
    pub connected: bool,
    /// Class of Device (classic) or GAP Appearance (low energy).
    pub class: Option<u32>,
}

/// `(address, low_energy)` of a device's root node `BTHENUM|BTHLE\DEV_<12 hex>`.
fn root_of(id: &str) -> Option<(&str, bool)> {
    let (bus, rest) = id.split_once('\\')?;
    let low_energy = match bus.to_ascii_uppercase().as_str() {
        "BTHENUM" => false,
        "BTHLE" => true,
        _ => return None,
    };
    let rest = rest
        .get(..4)
        .filter(|prefix| prefix.eq_ignore_ascii_case("DEV_"))
        .and_then(|_| rest.get(4..16))?;
    rest.bytes()
        .all(|c| c.is_ascii_hexdigit())
        .then_some((rest, low_energy))
}

/// The device address named by the instance ID of any of its nodes: the one after
/// `DEV_`, else the last run of exactly twelve hex digits.
fn mac_of(id: &str) -> Option<String> {
    let upper = id.to_ascii_uppercase();
    let twelve = |text: &str| {
        let digits = text.bytes().take_while(u8::is_ascii_hexdigit).count();
        (digits == 12).then(|| text[..12].to_string())
    };
    let after_dev = upper
        .match_indices("DEV_")
        .find_map(|(at, _)| twelve(&upper[at + 4..]));
    after_dev.or_else(|| {
        upper
            .split(|c: char| !c.is_ascii_hexdigit())
            .rfind(|run| run.len() == 12)
            .map(str::to_string)
    })
}

fn kind_from_class(raw: u32, low_energy: bool) -> &'static str {
    if low_energy {
        return match (raw >> 6, raw & 0x3F) {
            (0x0F, 1) => "keyboard",
            (0x0F, 2) => "mouse",
            (0x0F, 3 | 4) => "gamepad",
            (0x25, _) => "headset",
            _ => "",
        };
    }
    let (major, minor) = ((raw >> 8) & 0x1F, (raw >> 2) & 0x3F);
    match major {
        // Audio/video: wearable headset, hands-free, headphones.
        4 if matches!(minor, 1 | 2 | 6) => "headset",
        // Peripheral.
        5 if matches!(minor & 0x0F, 1 | 2) => "gamepad",
        5 => match minor >> 4 {
            1 | 3 => "keyboard",
            2 => "mouse",
            _ => "",
        },
        _ => "",
    }
}

#[derive(Default)]
struct Group {
    level: Option<u8>,
    node_connected: Option<bool>,
    radio_connected: Option<bool>,
    radio_failed: bool,
    root_name: String,
    battery_name: String,
    status_ok: bool,
    kind: &'static str,
    audio: bool,
}

/// `radio` is asked once per root node.
fn group(
    nodes: &[PnpNode],
    mut radio: impl FnMut(u64, bool) -> Result<RadioState, &'static str>,
) -> Vec<Status> {
    let mut groups: Vec<(String, Group)> = Vec::new();
    for node in nodes {
        let Some(mac) = mac_of(&node.id) else {
            continue;
        };
        let at = match groups.iter().position(|(key, _)| *key == mac) {
            Some(at) => at,
            None => {
                groups.push((mac, Group::default()));
                groups.len() - 1
            }
        };
        let group = &mut groups[at].1;
        let id = node.id.to_ascii_lowercase();
        group.audio |= AUDIO_SERVICES.iter().any(|uuid| id.contains(uuid));
        if let Some(level) = node.battery.filter(|&level| level <= 100) {
            group.level = Some(level);
            if group.battery_name.is_empty() {
                group.battery_name = node.name.clone();
            }
            group.status_ok |= node.status_ok;
        }
        if let Some(connected) = node.connected {
            group.node_connected = Some(group.node_connected.unwrap_or(false) || connected);
        }
        let Some((address, low_energy)) = root_of(&node.id) else {
            continue;
        };
        if !node.name.is_empty() {
            group.root_name = node.name.clone();
        }
        let Ok(address) = u64::from_str_radix(address, 16) else {
            continue;
        };
        match radio(address, low_energy) {
            Ok(state) => {
                group.radio_connected =
                    Some(group.radio_connected.unwrap_or(false) || state.connected);
                if group.kind.is_empty() {
                    group.kind = state
                        .class
                        .map_or("", |class| kind_from_class(class, low_energy));
                }
            }
            Err(_) => group.radio_failed = true,
        }
    }
    groups
        .into_iter()
        .filter_map(|(mac, g)| {
            let level = g.level?;
            let known = g.radio_connected.or(g.node_connected);
            // WinRT first, then the PnP flag; the node status only when the radio
            // query did not fail.
            let shown = known.unwrap_or(!g.radio_failed && g.status_ok);
            let name = [&g.root_name, &g.battery_name]
                .into_iter()
                .map(|name| name.trim())
                .find(|name| !name.is_empty())
                .unwrap_or("Bluetooth device")
                .to_string();
            let kind = match g.kind {
                "" if g.audio => "headset",
                kind => kind,
            };
            shown.then(|| Status {
                system_property: true,
                connection_known: Some(known.is_some()),
                charging_known: Some(false),
                ..Status::new(format!("bt:{mac}"), name, Some(level), false, kind)
            })
        })
        .collect()
}

/// `None` when Windows would not list the devices.
pub(crate) fn poll() -> Option<Vec<Status>> {
    let nodes = crate::win32::bluetooth::pnp_nodes()?;
    let deadline = Instant::now() + RADIO_BUDGET;
    Some(group(&nodes, |address, low_energy| {
        if Instant::now() >= deadline {
            return Err("timeout");
        }
        crate::win32::bluetooth::radio_state(address, low_energy)
    }))
}

#[cfg(test)]
mod tests;
