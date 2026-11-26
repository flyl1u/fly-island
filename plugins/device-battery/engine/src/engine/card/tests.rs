use super::*;

const NOW: &str = "2026-01-01T00:00:00.000000Z";

fn status(source: &'static str) -> Status {
    Status {
        source,
        physical_id: "pnp:usb\\x".into(),
        ..Status::new("key", "Device", Some(70), true, "")
    }
}

#[test]
fn a_device_reply_is_current_and_fresh() {
    let card = Card::from_status(&status("razer"), NOW).to_json(Some((1, 2)));
    assert_eq!(card["percent"], 70);
    assert_eq!(card["charging"], true);
    assert_eq!(card["measurementState"], "current");
    assert_eq!(card["connectionState"], "connected");
    assert_eq!(card["measuredAtUtc"], NOW);
    assert_eq!(card["sourceQuality"], "device_reply");
    assert_eq!(card["refreshScope"], "device");
    assert_eq!(card["vendorId"], 1);
    assert_eq!(card["verificationLevel"], "C");
    assert!(!card.to_string().contains("usb"));
    assert!(card.get("unconfirmed").is_none());
}

#[test]
fn system_properties_are_not_measurements() {
    let card = Card::from_status(&status("bluetooth"), NOW).to_json(None);
    assert_eq!(card["fresh"], false);
    assert_eq!(card["charging"], Value::Null);
    assert_eq!(card["measuredAtUtc"], Value::Null);
    assert_eq!(card["confirmedAtUtc"], NOW);
    assert_eq!(card["transport"], "Bluetooth");
    assert_eq!(card["sourceQuality"], "system_property");
    assert_eq!(card["refreshScope"], "provider");
    assert!(card.get("vendorId").is_none());
}

#[test]
fn silence_never_shows_a_level_or_claims_sleep() {
    let mut offline = status("razer");
    offline.online = false;
    let card = Card::from_status(&offline, NOW).to_json(None);
    assert_eq!(card["percent"], Value::Null);
    assert_eq!(card["charging"], Value::Null);
    assert_eq!(card["measurementState"], "unknown");
    assert_eq!(card["connectionState"], "unconfirmed");
    assert_eq!(card["connectionCheckedAtUtc"], Value::Null);
    assert_eq!(card["sourceQuality"], "cached");
}

#[test]
fn an_explicit_unavailable_answer_keeps_charging() {
    let mut plugged = status("mchose_headset");
    plugged.level = None;
    plugged.level_unavailable = true;
    plugged.connection_known = Some(true);
    let card = Card::from_status(&plugged, NOW).to_json(None);
    assert_eq!(card["percent"], Value::Null);
    assert_eq!(card["charging"], true);
    assert_eq!(card["sourceQuality"], "device_reply");
    assert_eq!(card["queriedAtUtc"], NOW);
    assert_eq!(card["confirmedAtUtc"], Value::Null);
}

#[test]
fn families_without_charging_evidence_stay_unknown() {
    let card = Card::from_status(&status("lofree"), NOW);
    assert_eq!(card.charging, None);
    let mut stated = status("lofree");
    stated.charging_known = Some(true);
    assert_eq!(Card::from_status(&stated, NOW).charging, Some(true));
}

#[test]
fn kinds_fall_back_to_name_then_family() {
    let kind = |source, name: &str| {
        let mut value = status(source);
        value.name = name.into();
        kind_of(&value)
    };
    assert_eq!(kind("razer", "Razer BlackWidow V3 Pro"), "keyboard");
    assert_eq!(kind("razer", "Razer BlackShark V2 Pro"), "headset");
    assert_eq!(kind("razer", "Razer Viper"), "mouse");
    assert_eq!(kind("standard_hid", "Pad"), "device");
    assert_eq!(kind("nzxt", "Lift"), "mouse");
    assert_eq!(kind("audeze", "Maxwell"), "headset");
}

#[test]
fn names_are_bounded_and_printable() {
    assert_eq!(clean_name("a\u{0}b\n"), "ab");
    assert_eq!(clean_name(""), FALLBACK_NAME);
    assert_eq!(clean_name(&"长".repeat(100)).chars().count(), 80);
}
