//! Xbox-compatible pads through XInput: a Windows property with at most four coarse
//! levels. Wired and unknown pads have no level.
use crate::status::Status;

const TYPE_DISCONNECTED: u8 = 0;
const TYPE_ALKALINE: u8 = 2;
const TYPE_NIMH: u8 = 3;

/// `None` for an empty slot.
fn status(slot: u32, battery_type: u8, tier: u8) -> Option<Status> {
    if battery_type == TYPE_DISCONNECTED {
        return None;
    }
    let level = matches!(battery_type, TYPE_ALKALINE | TYPE_NIMH)
        .then(|| [5, 30, 65, 100].get(usize::from(tier)).copied())
        .flatten();
    let name = if slot == 0 {
        "Xbox 手柄".to_string()
    } else {
        format!("Xbox 手柄 {}", slot + 1)
    };
    Some(Status {
        approximate: level.is_some(),
        system_property: true,
        connection_known: Some(true),
        charging_known: Some(false),
        level_unavailable: level.is_none(),
        ..Status::new(format!("xinput:{slot}"), name, level, false, "gamepad")
    })
}

pub(crate) fn poll() -> Vec<Status> {
    crate::win32::xinput::batteries()
        .into_iter()
        .filter_map(|(slot, battery_type, tier)| status(slot, battery_type, tier))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_real_batteries_have_a_coarse_level() {
        assert_eq!(status(0, TYPE_DISCONNECTED, 3), None);
        let medium = status(1, TYPE_NIMH, 2);
        let medium = medium.map(|s| (s.name, s.level, s.approximate));
        assert_eq!(medium, Some(("Xbox 手柄 2".into(), Some(65), true)));
        let wired = status(0, 1, 3).map(|s| (s.level, s.level_unavailable));
        assert_eq!(wired, Some((None, true)));
        assert_eq!(status(0, TYPE_ALKALINE, 9).and_then(|s| s.level), None);
    }
}
