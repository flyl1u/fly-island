//! Fixtures from the upstream descriptor tests: one captured descriptor and synthetic items.
use super::*;

pub(crate) fn hex(text: &str) -> Vec<u8> {
    let digits: Vec<u8> = text.bytes().filter(u8::is_ascii_hexdigit).collect();
    digits
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| {
            let digit = |c: u8| (c as char).to_digit(16).unwrap() as u8;
            digit(pair[0]) << 4 | digit(pair[1])
        })
        .collect()
}

const RAPOO: &str = "06 00 ff 09 02 a1 01 85 07 09 02 15 00 26 ff 00 75 08 95 12 81 00 \
                     09 02 15 00 26 ff 00 75 08 95 12 91 00 c0";

fn body(items: &str) -> Vec<u8> {
    hex(&format!("06 00 ff 09 02 a1 01 {items} c0"))
}

fn sizes(entries: &[(u8, usize)]) -> Sizes {
    entries.iter().copied().collect()
}

#[test]
fn reported_vt3s_descriptor_includes_the_id_byte() {
    let parsed = parse(&hex(RAPOO)).unwrap();
    assert_eq!(parsed.len(), 1);
    assert_eq!(
        parsed[&(0xFF00, 2)],
        [sizes(&[(7, 19)]), sizes(&[(7, 19)]), sizes(&[])]
    );
}

#[test]
fn push_and_pop_restore_the_globals() {
    let parsed = parse(&hex(
        "06 00 ff 75 08 95 02 85 07 a4 06 02 ff 75 10 95 03 85 08 a4 75 08 95 01 85 09 b4 \
         09 02 a1 01 81 02 91 02 b1 02 c0 b4 09 02 a1 01 81 02 c0",
    ))
    .unwrap();
    assert_eq!(
        parsed[&(0xFF02, 2)],
        [sizes(&[(8, 7)]), sizes(&[(8, 7)]), sizes(&[(8, 7)])]
    );
    assert_eq!(parsed[&(0xFF00, 2)][0], sizes(&[(7, 3)]));
}

#[test]
fn nested_collections_padding_and_the_implicit_id() {
    let parsed = parse(&body(
        "85 07 75 01 95 03 81 02 95 05 81 01 09 03 a1 00 75 08 95 02 81 02 c0 \
         85 08 95 04 81 02 95 06 91 02 95 01 b1 02",
    ))
    .unwrap();
    assert_eq!(
        parsed[&(0xFF00, 2)],
        [sizes(&[(7, 4), (8, 5)]), sizes(&[(8, 7)]), sizes(&[(8, 2)])]
    );
    let ranged = parse(&body("19 00 29 ff 75 08 95 12 81 00")).unwrap();
    assert_eq!(ranged[&(0xFF00, 2)][0], sizes(&[(0, 19)]));
    let extended = parse(&hex(
        "0b 02 00 02 ff a1 01 75 08 95 01 81 02 c0 06 00 ff 09 03 a1 01 91 02 c0",
    ))
    .unwrap();
    assert_eq!(extended[&(0xFF02, 2)][0], sizes(&[(0, 2)]));
    assert_eq!(extended[&(0xFF00, 3)][1], sizes(&[(0, 2)]));
}

#[test]
fn invalid_items_fail_with_fixed_reasons() {
    for (items, reason) in [
        ("fe 01 00 00", "long item"),
        ("77", "truncated item"),
        ("0c", "reserved item"),
        ("c5 00", "reserved item"),
        ("74", "invalid global item"),
        ("85 00", "invalid report ID"),
        ("86 07 00", "invalid report ID"),
        ("a5 00", "invalid global item"),
        ("b4", "unbalanced global stack"),
        ("a4", "unbalanced global stack"),
        ("a9 01", "unsupported local item"),
        ("08", "invalid usage"),
        ("19 01 75 08 95 01 81 00", "invalid usage"),
        ("29 01 75 08 95 01 81 00", "invalid usage"),
        ("19 02 29 01 75 08 95 01 81 00", "invalid usage"),
        ("19 01 19 02 29 03 75 08 95 01 81 00", "invalid usage"),
        (
            "1b 00 00 01 00 2b ff 00 02 00 75 08 95 01 81 00",
            "invalid usage",
        ),
        ("d1 00", "unknown main item"),
        ("a1 07", "invalid main item"),
        ("c1 00", "invalid main item"),
        ("c0", "unbalanced collection"),
        ("81 00", "missing report size/count"),
        ("75 08 81 00", "missing report size/count"),
        ("95 01 81 00", "missing report size/count"),
        ("75 00 95 01 81 00", "report size out of bounds"),
        ("75 08 95 00 81 00", "report size out of bounds"),
        (
            "77 ff ff ff ff 97 ff ff ff ff 81 00",
            "report size out of bounds",
        ),
        ("75 01 95 07 81 00", "non-byte-aligned report"),
        ("75 08 95 01 82 00 02", "invalid main item"),
        ("75 08 95 01 81 80", "invalid main item"),
        ("75 08 95 01 80", "invalid main item"),
        ("75 08 95 01 81 00 85 07 81 00", "mixed report IDs"),
        ("75 08 95 01 81 00 a4 85 07 b4", "mixed report IDs"),
        ("", "no reports"),
    ] {
        assert_eq!(parse(&body(items)), Err(reason), "{items}");
    }
}

#[test]
fn ambiguous_or_unbalanced_structure_is_refused() {
    let valid = body("85 07 75 08 95 01 81 00");
    let with = |extra: &str| [valid.clone(), hex(extra)].concat();
    assert!(parse(&[valid.clone(), valid.clone()].concat()).is_err());
    assert!(parse(&valid[..valid.len() - 1]).is_err());
    for extra in ["c0", "09 03"] {
        assert!(parse(&with(extra)).is_err());
    }
    assert!(parse(&hex("75 08 95 01 81 00")).is_err());
    assert!(parse(&hex("06 00 ff 09 01 09 02 a1 01 75 08 95 01 81 00 c0")).is_err());
    assert!(parse(&hex("06 00 ff 19 01 29 02 a1 01 75 08 95 01 81 00 c0")).is_err());
    assert_eq!(
        parse(&with("09 03 a1 01 81 00 c0")),
        Err("report shared across collections")
    );
}

#[test]
fn truncation_and_bounds_apply_to_every_report() {
    assert!(parse(&[]).is_err());
    assert!(parse(&[0u8; 4097]).is_err());
    let rapoo = hex(RAPOO);
    for end in 0..rapoo.len() {
        assert!(parse(&rapoo[..end]).is_err(), "{end}");
    }
    for items in [
        "85 07 75 08 95 01 81 00 85 08 75 01 81 00",
        "85 07 75 08 95 01 81 00 75 01 91 00",
        "85 07 75 08 95 01 81 00 75 01 b1 00",
        "85 07 75 08 96 ff 0f 81 00 95 01 81 00",
    ] {
        assert!(parse(&body(items)).is_err(), "{items}");
    }
    let largest = parse(&body("75 08 96 ff 0f 81 00")).unwrap();
    assert_eq!(largest[&(0xFF00, 2)][0], sizes(&[(0, 4096)]));
}
