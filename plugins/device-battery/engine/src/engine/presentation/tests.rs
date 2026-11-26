use super::*;
use crate::status::Status;

fn card(key: &str, source: &'static str, name: &str, level: u8, physical: &str) -> Card {
    let status = Status {
        source,
        physical_id: physical.into(),
        ..Status::new(key, name, Some(level), false, "mouse")
    };
    Card::from_status(&status, "2026-01-01T00:00:00.000000Z")
}

#[test]
fn a_silent_duplicate_connection_is_not_hidden_while_both_answer() {
    let mut cards = vec![
        card("a", "razer", "Viper", 80, "p1"),
        card("b", "razer", "Viper", 79, "p2"),
    ];
    assert!(hide_old_connections(&mut cards).is_empty());
    cards[1].current = false;
    let hidden = hide_old_connections(&mut cards);
    assert_eq!(cards.len(), 1);
    assert_eq!(cards[0].id, public_id("a"));
    assert_eq!(hidden[0]["name"], "Viper");
}

#[test]
fn distant_levels_or_protected_families_stay_apart() {
    let mut cards = vec![
        card("a", "razer", "Viper", 80, "p1"),
        card("b", "razer", "Viper", 60, "p2"),
    ];
    cards[1].current = false;
    assert!(hide_old_connections(&mut cards).is_empty());
    let mut cherry = vec![
        card("a", "cherry", "K", 80, "p1"),
        card("b", "cherry", "K", 80, "p2"),
    ];
    cherry[1].current = false;
    assert!(hide_old_connections(&mut cherry).is_empty());
}

#[test]
fn a_bluetooth_xbox_pad_hides_one_approximate_slot() {
    let pad = |key: &str, source: &'static str, approximate| {
        let status = Status {
            source,
            approximate,
            ..Status::new(key, "Xbox Wireless Controller", Some(50), false, "gamepad")
        };
        Card::from_status(&status, "t")
    };
    let mut cards = vec![
        pad("bt", "bluetooth", false),
        pad("xinput:0", "xinput", false),
        pad("xinput:1", "xinput", true),
        pad("xinput:2", "xinput", true),
    ];
    hide_bluetooth_xinput(&mut cards);
    let ids: Vec<&String> = cards.iter().map(|c| &c.id).collect();
    assert_eq!(ids.len(), 3);
    assert!(!ids.contains(&&public_id("xinput:1")));
}

fn info(vendor_id: u16, product_id: u16, usage_page: u16, product: &str) -> DeviceInfo {
    DeviceInfo {
        path: r"\\?\hid#secret".into(),
        vendor_id,
        product_id,
        usage_page,
        usage: 1,
        product: product.into(),
        serial: "SECRET42".into(),
        ..Default::default()
    }
}

#[test]
fn unadapted_lists_models_without_private_text() {
    let groups = vec![
        (
            "pnp:one".to_string(),
            vec![
                info(0x1234, 0x0001, 0xFF00, "Pad SECRET42 pnp:one"),
                info(0x048D, 0xC100, 0xFF89, "ITE"),
            ],
        ),
        ("pnp:two".to_string(), vec![info(1, 2, 0x000C, "Audio")]),
        (
            "pnp:rgb".to_string(),
            vec![info(1, 3, 0xFF00, "Board LED Controller")],
        ),
        (
            "pnp:native".to_string(),
            vec![info(0x373B, 0x1278, 0xFF00, "M")],
        ),
        ("pnp:card".to_string(), vec![info(5, 6, 0xFF00, "Known")]),
    ];
    let cards = [card("a", "razer", "K", 1, "pnp:card")];
    let result = unadapted(&groups, &cards);
    assert_eq!(result.len(), 1);
    assert_eq!(result[0]["vendorId"], 0x1234);
    assert_eq!(result[0]["product"], "Pad [redacted] [redacted]");
    assert_eq!(result[0]["collections"][0]["usagePage"], 0xFF00);
}
