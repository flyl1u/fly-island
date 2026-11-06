use std::collections::HashMap;

use super::tracker::{AudioKind, DeviceAlert, Output, OutputTracker, PowerTracker, BATTERY_WAIT_POLLS};

fn output(id: &str, form_factor: u32, enumerator: &str, device: &str) -> Output {
    Output::classify(id.into(), format!("name {id}"), form_factor, enumerator, Some(device.into())).expect("announced")
}

fn levels(pairs: &[(&str, u8)]) -> HashMap<String, u8> {
    pairs.iter().map(|(device, level)| (device.to_string(), *level)).collect()
}

#[test]
fn speakers_and_hdmi_are_ignored_but_headphones_and_bluetooth_are_not() {
    assert!(Output::classify("a".into(), "Speakers".into(), 1, "HDAUDIO", None).is_none());
    assert!(Output::classify("a".into(), "Monitor".into(), 9, "HDAUDIO", None).is_none());
    assert_eq!(output("a", 3, "HDAUDIO", "x").kind, AudioKind::Headphones);
    assert_eq!(output("a", 5, "USB", "x").kind, AudioKind::Headset);
    let speaker = output("a", 1, "BTHENUM", "x");
    assert_eq!((speaker.kind, speaker.bluetooth), (AudioKind::Speaker, true));
    // Without a container the endpoint stands for itself.
    let alone = Output::classify("id".into(), "n".into(), 3, "USB", None).expect("announced");
    assert_eq!(alone.device, "id");
}

#[test]
fn what_is_there_at_the_start_is_not_news() {
    let mut tracker = OutputTracker::default();
    assert!(tracker.update(vec![output("a", 3, "USB", "x")], &HashMap::new()).is_empty());
    assert!(tracker.update(vec![output("a", 3, "USB", "x")], &HashMap::new()).is_empty());
}

#[test]
fn wired_headphones_connect_and_disconnect_at_once() {
    let mut tracker = OutputTracker::default();
    tracker.update(Vec::new(), &HashMap::new());
    let plugged = tracker.update(vec![output("a", 3, "HDAUDIO", "x")], &HashMap::new());
    assert_eq!(plugged, [DeviceAlert::AudioConnected { name: "name a".into(), device: AudioKind::Headphones, battery: None }]);
    let pulled = tracker.update(Vec::new(), &HashMap::new());
    assert_eq!(pulled, [DeviceAlert::AudioDisconnected { name: "name a".into(), device: AudioKind::Headphones }]);
}

#[test]
fn a_bluetooth_headset_is_announced_once_with_its_battery() {
    let mut tracker = OutputTracker::default();
    tracker.update(Vec::new(), &HashMap::new());
    // Stereo and hands-free endpoints of one headset; the battery shows up a poll later.
    let both = vec![output("hands-free", 5, "BTHHFENUM", "x"), output("stereo", 3, "BTHENUM", "x")];
    assert!(tracker.update(both.clone(), &HashMap::new()).is_empty());
    assert!(tracker.wants_batteries());
    let alerts = tracker.update(both.clone(), &levels(&[("x", 80)]));
    assert_eq!(alerts, [DeviceAlert::AudioConnected { name: "name stereo".into(), device: AudioKind::Headphones, battery: Some(80) }]);
    assert!(!tracker.wants_batteries());
    let gone = tracker.update(Vec::new(), &HashMap::new());
    assert_eq!(gone.len(), 1);
}

#[test]
fn a_bluetooth_device_without_a_battery_is_announced_after_waiting() {
    let mut tracker = OutputTracker::default();
    tracker.update(Vec::new(), &HashMap::new());
    let speaker = vec![output("s", 1, "BTHENUM", "x")];
    for _ in 0..BATTERY_WAIT_POLLS {
        assert!(tracker.update(speaker.clone(), &HashMap::new()).is_empty());
    }
    let alerts = tracker.update(speaker.clone(), &HashMap::new());
    assert_eq!(alerts, [DeviceAlert::AudioConnected { name: "name s".into(), device: AudioKind::Speaker, battery: None }]);
}

#[test]
fn a_device_that_leaves_while_waiting_says_nothing() {
    let mut tracker = OutputTracker::default();
    tracker.update(Vec::new(), &HashMap::new());
    assert!(tracker.update(vec![output("s", 3, "BTHENUM", "x")], &HashMap::new()).is_empty());
    assert!(tracker.update(Vec::new(), &HashMap::new()).is_empty());
    assert!(!tracker.wants_batteries());
}

#[test]
fn low_battery_warns_once_per_level_and_again_after_charging() {
    let mut tracker = OutputTracker::default();
    let headset = vec![output("h", 3, "BTHENUM", "x")];
    tracker.update(headset.clone(), &levels(&[("x", 50)]));
    assert!(tracker.update(headset.clone(), &levels(&[("x", 21)])).is_empty());
    let low = tracker.update(headset.clone(), &levels(&[("x", 20)]));
    assert_eq!(low, [DeviceAlert::BatteryLow { name: "name h".into(), battery: 20 }]);
    assert!(tracker.update(headset.clone(), &levels(&[("x", 15)])).is_empty());
    assert_eq!(tracker.update(headset.clone(), &levels(&[("x", 10)])).len(), 1);
    assert!(tracker.update(headset.clone(), &levels(&[("x", 5)])).is_empty());
    // Charged, then running down again.
    assert!(tracker.update(headset.clone(), &levels(&[("x", 90)])).is_empty());
    assert_eq!(tracker.update(headset.clone(), &levels(&[("x", 18)])).len(), 1);
}

#[test]
fn connecting_already_low_does_not_also_warn_about_the_higher_level() {
    let mut tracker = OutputTracker::default();
    tracker.update(Vec::new(), &HashMap::new());
    let headset = vec![output("h", 3, "BTHENUM", "x")];
    let alerts = tracker.update(headset.clone(), &levels(&[("x", 15)]));
    assert_eq!(alerts, [DeviceAlert::AudioConnected { name: "name h".into(), device: AudioKind::Headphones, battery: Some(15) }]);
    assert!(tracker.update(headset.clone(), &levels(&[("x", 12)])).is_empty());
    assert_eq!(tracker.update(headset, &levels(&[("x", 10)])).len(), 1);
}

#[test]
fn the_charger_alerts_on_change_only() {
    let mut tracker = PowerTracker::default();
    assert_eq!(tracker.update(Some(false), Some(60)), None);
    assert_eq!(tracker.update(Some(false), Some(59)), None);
    assert_eq!(tracker.update(Some(true), Some(59)), Some(DeviceAlert::PowerConnected { battery: Some(59) }));
    assert_eq!(tracker.update(None, None), None);
    assert_eq!(tracker.update(Some(false), Some(80)), Some(DeviceAlert::PowerDisconnected { battery: Some(80) }));
    tracker.reset();
    assert_eq!(tracker.update(Some(true), None), None);
}

#[test]
fn alerts_reach_the_island_as_tagged_json() {
    let value = serde_json::to_value(DeviceAlert::AudioConnected { name: "AirPods".into(), device: AudioKind::Headphones, battery: Some(80) })
        .expect("json");
    assert_eq!(value, serde_json::json!({ "kind": "audioConnected", "name": "AirPods", "device": "headphones", "battery": 80 }));
    let value = serde_json::to_value(DeviceAlert::PowerDisconnected { battery: None }).expect("json");
    assert_eq!(value, serde_json::json!({ "kind": "powerDisconnected", "battery": null }));
}

/// Prints what this computer reports; run by hand with `--ignored --nocapture`.
#[test]
#[ignore = "reads the real devices of the computer it runs on"]
fn probe_this_computer() {
    let _com = crate::win32::com::ComApartment::multithreaded().expect("com");
    for info in crate::win32::audio_outputs::active_outputs().expect("outputs") {
        let container = crate::win32::devnode::container_id(&format!(r"SWD\MMDEVAPI\{}", info.id));
        println!("{} | form factor {} | {} | {:?}", info.name, info.form_factor, info.enumerator, container);
    }
    println!("announced: {:?}", super::read_outputs());
    println!("batteries: {:?}", crate::win32::devnode::bluetooth_batteries());
    println!("power: {:?}", crate::win32::power::power_source());
}
