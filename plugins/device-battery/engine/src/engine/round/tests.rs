use super::*;

const NOW: &str = "2026-01-01T00:00:00.000000Z";

fn info(physical: &str, product_id: u16) -> DeviceInfo {
    DeviceInfo {
        physical_id: physical.into(),
        serial: "SER123".into(),
        vendor_id: 0x1532,
        product_id,
        usage_page: 0xFF00,
        ..Default::default()
    }
}

fn subject(reader: &'static str, physical: &str) -> Subject {
    Subject {
        reader,
        physical: physical.into(),
    }
}

fn result(statuses: Vec<Status>) -> ReadResult {
    ReadResult {
        statuses,
        failure: None,
    }
}

fn status(key: &str, kind: &'static str) -> Status {
    Status::new(key, "Viper SER123", Some(50), false, kind)
}

fn round() -> Round {
    Round {
        provider_count: 48,
        groups: vec![
            ("pnp:a".into(), vec![info("pnp:a", 1)]),
            ("pnp:b".into(), vec![info("pnp:b", 2), info("pnp:b", 3)]),
        ],
        ..Default::default()
    }
}

#[test]
fn readings_are_bound_to_their_device_and_redacted() {
    let mut round = round();
    let reading = result(vec![status("razer:1:", "mouse")]);
    round.accept(&subject("razer", "pnp:a"), reading, false, NOW);
    let snapshot = round.snapshot(true);
    let card = &snapshot["devices"][0];
    assert_eq!(card["id"], public_id("razer:1::instance:pnp:a"));
    assert_eq!(card["legacyId"], public_id("razer:1:"));
    assert_eq!(card["physicalId"], public_id("pnp:a"));
    assert_eq!(card["name"], "Viper [redacted]");
    assert_eq!(card["provider"], "razer");
    assert_eq!(card["refreshScope"], "device");
    assert_eq!(card["productId"], 1);
    assert_eq!(snapshot["health"][0]["state"], "ok");
    // The other device has no card.
    assert_eq!(snapshot["unadapted"][0]["productId"], 2);
    assert!(!snapshot.to_string().contains("pnp:"));
}

#[test]
fn shared_legacy_keys_and_mixed_models_are_not_published() {
    let mut round = round();
    for physical in ["pnp:a", "pnp:b"] {
        let reading = result(vec![status("dongle", "mouse")]);
        round.accept(&subject("g3m", physical), reading, false, NOW);
    }
    let snapshot = round.snapshot(false);
    let devices = snapshot["devices"].as_array().cloned().unwrap_or_default();
    assert_eq!(devices.len(), 2);
    assert!(devices.iter().all(|d| d["legacyId"].is_null()));
    assert_eq!(
        devices
            .iter()
            .filter(|d| d.get("productId").is_some())
            .count(),
        1
    );
    assert_eq!(snapshot["unadapted"], json!([]));
    assert_eq!(snapshot["complete"], false);
}

#[test]
fn only_gamepad_readers_report_gamepads() {
    let mut round = round();
    let reading = result(vec![status("x", "gamepad")]);
    round.accept(&subject("razer", "pnp:a"), reading, false, NOW);
    let reading = result(vec![status("y", "gamepad")]);
    round.accept(&subject("flydigi", "pnp:b"), reading, false, NOW);
    let snapshot = round.snapshot(true);
    assert_eq!(snapshot["devices"].as_array().map(Vec::len), Some(1));
    assert_eq!(snapshot["health"][0]["state"], "unavailable");
}

#[test]
fn failures_reach_errors_and_deferrals_do_not() {
    let mut round = round();
    round.fail(&subject("logitech", "pnp:a"), "timeout");
    round.defer(&subject("razer", "pnp:b"));
    round.no_devices("audeze");
    let failed = ReadResult {
        statuses: Vec::new(),
        failure: Some("razer_no_reply".into()),
    };
    round.accept(&subject("razer", "pnp:a"), failed, false, NOW);
    let snapshot = round.snapshot(true);
    assert_eq!(
        snapshot["errors"],
        json!(["logitech: timeout", "razer: razer_no_reply"])
    );
    assert_eq!(snapshot["health"][0]["state"], "timeout");
    assert_eq!(snapshot["health"][1]["reason"], "round_budget");
    assert_eq!(snapshot["health"][2]["physicalId"], Value::Null);
}
