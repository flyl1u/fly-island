//! Plain copies of the HIDP capability structures and the rules that turn them into
//! proven report lengths. A collection maximum alone never proves one report.
use super::Sizes;

pub(crate) const INPUT: usize = 0;
pub(crate) const OUTPUT: usize = 1;
pub(crate) const FEATURE: usize = 2;

#[derive(Clone, Debug, Default)]
pub(crate) struct ValueCap {
    pub usage_page: u16,
    pub report_id: u8,
    pub alias: bool,
    pub link: u16,
    pub bits: u16,
    pub count: u16,
    pub is_range: bool,
    pub usage_min: u16,
    pub usage_max: u16,
    pub logical_min: i32,
    pub logical_max: i32,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct ButtonCap {
    pub report_id: u8,
    pub alias: bool,
    pub bit_field: u16,
    pub is_range: bool,
    pub usage_min: u16,
    pub usage_max: u16,
    pub report_count: u16,
}

/// Everything is indexed by `INPUT`, `OUTPUT`, `FEATURE`.
#[derive(Clone, Debug, Default)]
pub(crate) struct Caps {
    pub usage_page: u16,
    pub usage: u16,
    pub lengths: [u16; 3],
    pub button_counts: [u16; 3],
    pub value_counts: [u16; 3],
    /// `None` when Windows did not return the complete list.
    pub buttons: [Option<Vec<ButtonCap>>; 3],
    pub values: [Option<Vec<ValueCap>>; 3],
}

/// Sizes of simple, non-aliased byte arrays: one value cap per report ID supplies the
/// whole payload and the largest equals the collection maximum. `fixed_usage` allows
/// the one fixed-usage array form that a few identities declare.
pub(crate) fn byte_report_sizes(caps: &Caps, kind: usize, fixed_usage: bool) -> Option<Sizes> {
    let buttons = caps.button_counts[kind];
    let count = caps.value_counts[kind];
    let maximum = usize::from(caps.lengths[kind]);
    if buttons > 0 && count == 0 {
        let button = lone_button(caps, kind, maximum)?;
        // Data,Array byte selectors spanning exactly 0..=255.
        let selectors = !button.alias
            && button.bit_field & 0x02 == 0
            && button.is_range
            && button.usage_min == 0
            && button.usage_max == 255;
        // One non-aliased fixed usage repeated for the whole payload.
        let fixed = fixed_usage
            && !button.alias
            && button.bit_field & 0x03 == 0
            && !button.is_range
            && usize::from(button.report_count) == maximum - 1;
        return (selectors || fixed).then(|| Sizes::from([(button.report_id, maximum)]));
    }
    if buttons > 0 || !(1..=32).contains(&count) || !(2..=4096).contains(&maximum) {
        return None;
    }
    let values = caps.values[kind].as_ref()?;
    if values.len() != usize::from(count) {
        return None;
    }
    let mut sizes = Sizes::new();
    for value in values {
        if value.alias || value.bits != 8 || value.count == 0 {
            return None;
        }
        let length = usize::from(value.count) + 1;
        if sizes.insert(value.report_id, length).is_some() {
            return None;
        }
    }
    (sizes.values().max() == Some(&maximum)).then_some(sizes)
}

fn lone_button(caps: &Caps, kind: usize, maximum: usize) -> Option<&ButtonCap> {
    if caps.button_counts[kind] != 1 || !(2..=4096).contains(&maximum) {
        return None;
    }
    match caps.buttons[kind].as_deref() {
        Some([only]) => Some(only),
        _ => None,
    }
}

/// All declared value and button report IDs of one direction, or `None` when the
/// capability lists are incomplete.
pub(crate) fn report_ids(caps: &Caps, kind: usize) -> Option<Vec<u8>> {
    let total = u32::from(caps.button_counts[kind]) + u32::from(caps.value_counts[kind]);
    if !(1..=512).contains(&total) {
        return None;
    }
    let buttons = caps.buttons[kind].as_ref()?;
    let values = caps.values[kind].as_ref()?;
    if buttons.len() != usize::from(caps.button_counts[kind])
        || values.len() != usize::from(caps.value_counts[kind])
    {
        return None;
    }
    let mut ids: Vec<u8> = buttons
        .iter()
        .map(|b| b.report_id)
        .chain(values.iter().map(|v| v.report_id))
        .collect();
    ids.sort_unstable();
    ids.dedup();
    Some(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn values(entries: &[(u8, u16, u16)], maximum: u16) -> Caps {
        let list: Vec<ValueCap> = entries
            .iter()
            .map(|&(report_id, bits, count)| ValueCap {
                report_id,
                bits,
                count,
                ..Default::default()
            })
            .collect();
        let mut caps = Caps {
            lengths: [maximum, 0, 0],
            value_counts: [list.len() as u16, 0, 0],
            ..Default::default()
        };
        caps.values[INPUT] = Some(list);
        caps
    }

    fn button(cap: ButtonCap, maximum: u16) -> Caps {
        let mut caps = Caps {
            lengths: [maximum, 0, 0],
            button_counts: [1, 0, 0],
            ..Default::default()
        };
        caps.buttons[INPUT] = Some(vec![cap]);
        caps
    }

    #[test]
    fn value_arrays_prove_each_report_only_when_the_maximum_agrees() {
        let caps = values(&[(4, 8, 63), (5, 8, 7)], 64);
        assert_eq!(
            byte_report_sizes(&caps, INPUT, false),
            Some(Sizes::from([(4, 64), (5, 8)]))
        );
        assert_eq!(
            byte_report_sizes(&values(&[(4, 8, 7)], 64), INPUT, false),
            None
        );
        assert_eq!(
            byte_report_sizes(&values(&[(4, 16, 63)], 64), INPUT, false),
            None
        );
        assert_eq!(
            byte_report_sizes(&values(&[(4, 8, 31), (4, 8, 32)], 33), INPUT, false),
            None
        );
    }

    #[test]
    fn a_lone_byte_selector_array_takes_the_collection_maximum() {
        let selector = ButtonCap {
            report_id: 4,
            is_range: true,
            usage_max: 255,
            ..Default::default()
        };
        assert_eq!(
            byte_report_sizes(&button(selector.clone(), 64), INPUT, false),
            Some(Sizes::from([(4, 64)]))
        );
        let variable = ButtonCap {
            bit_field: 2,
            ..selector
        };
        assert_eq!(byte_report_sizes(&button(variable, 64), INPUT, false), None);
    }

    #[test]
    fn a_fixed_usage_array_is_proof_only_where_opted_in() {
        let fixed = ButtonCap {
            report_id: 7,
            usage_min: 1,
            usage_max: 1,
            report_count: 63,
            ..Default::default()
        };
        assert_eq!(
            byte_report_sizes(&button(fixed.clone(), 64), INPUT, false),
            None
        );
        assert_eq!(
            byte_report_sizes(&button(fixed, 64), INPUT, true),
            Some(Sizes::from([(7, 64)]))
        );
    }

    #[test]
    fn report_ids_need_complete_lists() {
        let caps = values(&[(9, 8, 1), (3, 8, 1)], 2);
        assert_eq!(report_ids(&caps, INPUT), None); // button list never loaded
        let mut complete = caps;
        complete.buttons[INPUT] = Some(Vec::new());
        assert_eq!(report_ids(&complete, INPUT), Some(vec![3, 9]));
        assert_eq!(report_ids(&complete, OUTPUT), None);
    }
}
