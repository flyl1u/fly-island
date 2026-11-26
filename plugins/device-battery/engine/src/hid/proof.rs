//! Pure checks on HID paths, PnP parents and proven report lengths.
use super::Sizes;

/// VID and PID named by a HID interface path (USB `vid_xxxx` or Bluetooth `vid&xxxxxxxx`).
pub(crate) fn path_ids(path: &str) -> Option<(u16, u16)> {
    let lower = path.to_ascii_lowercase();
    let (vid, rest) = hex_after(&lower, "vid", 4, 8)?;
    let (pid, _) = hex_after(rest, "pid", 4, 4)?;
    Some((vid, pid))
}

/// The first `tag_` or `tag&` followed by `min..=max` hex digits: its low 16 bits and
/// the text after it.
fn hex_after<'a>(text: &'a str, tag: &str, min: usize, max: usize) -> Option<(u16, &'a str)> {
    for (at, _) in text.match_indices(tag) {
        let tail = &text[at + tag.len()..];
        let Some(tail) = tail.strip_prefix(['_', '&']) else {
            continue;
        };
        let digits = tail
            .bytes()
            .take(max)
            .take_while(u8::is_ascii_hexdigit)
            .count();
        if digits >= min {
            let value = u16::from_str_radix(&tail[digits - 4..digits], 16).ok()?;
            return Some((value, &tail[digits..]));
        }
    }
    None
}

/// `\\?\hid#vid_V&pid_P(&token)*#instance...` for exactly this identity.
pub(crate) fn is_usb_hid_path(path: &str, vendor_id: u16, product_id: u16) -> bool {
    let lower = path.to_ascii_lowercase();
    let prefix = format!("\\\\?\\hid#vid_{vendor_id:04x}&pid_{product_id:04x}");
    let Some(tail) = lower.strip_prefix(&prefix) else {
        return false;
    };
    let Some((tokens, instance)) = tail.split_once('#') else {
        return false;
    };
    let tokens_valid = tokens.is_empty()
        || tokens.strip_prefix('&').is_some_and(|list| {
            list.split('&').all(|token| {
                !token.is_empty()
                    && token
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'_')
            })
        });
    tokens_valid && is_instance_tail(instance)
}

/// `pnp:usb\vid_V&pid_P(&rev_XXXX)?\instance` for exactly this identity.
pub(crate) fn is_usb_parent(physical_id: &str, vendor_id: u16, product_id: u16) -> bool {
    let lower = physical_id.to_ascii_lowercase();
    let prefix = format!("pnp:usb\\vid_{vendor_id:04x}&pid_{product_id:04x}");
    let Some(tail) = lower.strip_prefix(&prefix) else {
        return false;
    };
    let tail = match tail.strip_prefix("&rev_") {
        Some(rest) if rest.len() > 4 && rest.bytes().take(4).all(|c| c.is_ascii_hexdigit()) => {
            &rest[4..]
        }
        _ => tail,
    };
    tail.strip_prefix('\\').is_some_and(is_instance_tail)
}

fn is_instance_tail(text: &str) -> bool {
    !text.is_empty() && !text.chars().any(|c| c == '\\' || c.is_whitespace())
}

/// Report `id` is proven to fill the whole collection maximum, every other proven
/// report fits inside it, and the maximum is within `bounds`. An unnumbered report
/// must be the only one.
pub(crate) fn report_proven(
    maximum: Option<usize>,
    sizes: &Option<Sizes>,
    id: u8,
    bounds: (usize, usize),
) -> bool {
    let (Some(maximum), Some(sizes)) = (maximum, sizes.as_ref()) else {
        return false;
    };
    (bounds.0..=bounds.1).contains(&maximum)
        && !sizes.is_empty()
        && sizes.values().all(|&n| (2..=maximum).contains(&n))
        && sizes.get(&id) == Some(&maximum)
        && (id != 0 || sizes.len() == 1)
}

/// The sizes are exactly one report of this length.
pub(crate) fn single_report(sizes: &Option<Sizes>, id: u8, length: usize) -> bool {
    sizes
        .as_ref()
        .is_some_and(|map| map.len() == 1 && map.get(&id) == Some(&length))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_identities_cover_usb_and_bluetooth_forms() {
        let usb = r"\\?\hid#vid_373b&pid_1278&mi_01#7&1&0&0000#{guid}";
        assert_eq!(path_ids(usb), Some((0x373B, 0x1278)));
        let bt = r"\\?\hid#{0000}_dev_vid&0002054c_pid&09cc#9&2#{guid}";
        assert_eq!(path_ids(bt), Some((0x054C, 0x09CC)));
        assert_eq!(path_ids("hid#nothing"), None);
    }

    #[test]
    fn exact_paths_and_parents_reject_lookalikes() {
        let path = r"\\?\HID#VID_3837&PID_100C&MI_01&Col03#7&abc&0&0002#{guid}";
        assert!(is_usb_hid_path(path, 0x3837, 0x100C));
        assert!(!is_usb_hid_path(path, 0x3837, 0x1018));
        assert!(!is_usb_hid_path(
            r"\\?\hid#vid_3837&pid_100c x#a",
            0x3837,
            0x100C
        ));
        for parent in [
            r"pnp:usb\vid_3837&pid_100c\123",
            r"pnp:usb\vid_3837&pid_100c&rev_0100\123",
        ] {
            assert!(is_usb_parent(parent, 0x3837, 0x100C), "{parent}");
        }
        for parent in [
            r"pnp:usb\vid_3837&pid_100c&mi_01\123",
            r"collection:\\?\hid#vid_3837&pid_100c",
            r"pnp:usb\vid_3837&pid_100c\a\b",
        ] {
            assert!(!is_usb_parent(parent, 0x3837, 0x100C), "{parent}");
        }
    }

    #[test]
    fn a_report_is_proven_only_with_consistent_sizes() {
        let sizes = Some(Sizes::from([(8, 17), (9, 5)]));
        assert!(report_proven(Some(17), &sizes, 8, (17, 17)));
        assert!(!report_proven(Some(17), &sizes, 9, (2, 64)));
        assert!(!report_proven(Some(64), &sizes, 8, (2, 64)));
        assert!(!report_proven(None, &sizes, 8, (2, 64)));
        assert!(!report_proven(
            Some(17),
            &Some(Sizes::from([(0, 17), (1, 5)])),
            0,
            (2, 64)
        ));
    }
}
