use super::*;
use crate::providers::context::Context;
use crate::status::Status;
use std::sync::Mutex;

struct FakePlatform {
    devices: Vec<DeviceInfo>,
    /// (reader, physical device) in the order they were asked.
    asked: Mutex<Vec<(String, String)>>,
    /// This reader sleeps longer than any budget.
    hangs: &'static str,
}

impl Platform for FakePlatform {
    fn interface_paths(&self) -> Option<Vec<String>> {
        Some(self.devices.iter().map(|d| d.path.clone()).collect())
    }

    fn discover(&self, _paths: &[String]) -> Vec<DeviceInfo> {
        self.devices.clone()
    }

    fn read(&self, reader: Reader, devices: &[DeviceInfo]) -> Result<ReadResult, ()> {
        let physical = devices
            .first()
            .map(|d| d.physical_id.clone())
            .unwrap_or_default();
        if let Ok(mut asked) = self.asked.lock() {
            asked.push((reader.name.to_string(), physical));
        }
        if reader.name == self.hangs {
            std::thread::sleep(Duration::from_secs(2));
        }
        match reader.name {
            "bluetooth" => Err(()),
            "broken" => panic!("reader bug"),
            "mouse" => Ok(ReadResult {
                statuses: vec![Status::new("mouse:1", "Mouse", Some(40), false, "mouse")],
                failure: None,
            }),
            _ => Ok(ReadResult::default()),
        }
    }
}

fn nothing(_: &mut Context) -> Vec<Status> {
    Vec::new()
}

fn reader(name: &'static str, source: Source) -> Reader {
    Reader { name, source }
}

fn device(physical: &str, vendor_id: u16) -> DeviceInfo {
    DeviceInfo {
        path: format!("path-{physical}-{vendor_id}"),
        physical_id: physical.into(),
        vendor_id,
        ..Default::default()
    }
}

fn readers() -> Vec<Reader> {
    vec![
        reader("mouse", Source::Vendors(&[1], nothing)),
        reader("absent", Source::Vendors(&[9], nothing)),
        reader("broken", Source::Vendors(&[2], nothing)),
        reader("bluetooth", Source::Bluetooth),
        reader("xinput", Source::XInput),
        reader("standard_hid", Source::AnyDevice(nothing)),
    ]
}

fn limits() -> Limits {
    Limits {
        round: Duration::from_secs(5),
        unit: Duration::from_millis(50),
    }
}

fn run_with(hangs: &'static str, limits: Limits) -> (Value, Vec<(String, String)>, usize) {
    let fake = Arc::new(FakePlatform {
        devices: vec![device("a", 1), device("b", 2), device("n", 0x373B)],
        asked: Mutex::new(Vec::new()),
        hangs,
    });
    let platform: Arc<dyn Platform> = fake.clone();
    let mut partials = 0;
    let mut count = |snapshot: Value| {
        assert_eq!(snapshot["complete"], false);
        partials += 1;
    };
    let round = Round::default();
    let round = run(&platform, &readers(), round, limits, Some(&mut count));
    let asked = fake.asked.lock().map(|a| a.clone()).unwrap_or_default();
    (round.snapshot(true), asked, partials)
}

fn state_of<'a>(snapshot: &'a Value, provider: &str) -> Vec<&'a str> {
    snapshot["health"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|h| h["provider"] == provider)
        .filter_map(|h| h["state"].as_str())
        .collect()
}

#[test]
fn every_matching_reader_runs_and_bluetooth_goes_last() {
    let (snapshot, asked, partials) = run_with("", limits());
    assert_eq!(asked.last().map(|a| a.0.as_str()), Some("bluetooth"));
    let count = |name: &str| asked.iter().filter(|a| a.0 == name).count();
    assert_eq!(count("mouse"), 1);
    assert_eq!(count("absent"), 0);
    assert_eq!(count("standard_hid"), 3);
    assert_eq!(snapshot["devices"].as_array().map(Vec::len), Some(1));
    assert_eq!(state_of(&snapshot, "absent"), ["no_devices"]);
    assert_eq!(state_of(&snapshot, "broken"), ["error"]);
    assert_eq!(state_of(&snapshot, "bluetooth"), ["error"]);
    assert_eq!(snapshot["nativeMousePresent"], false);
    // Topology and seven queries.
    assert!((1..=8).contains(&partials), "{partials}");
}

#[test]
fn a_hung_reader_is_abandoned_and_the_round_continues() {
    let (snapshot, asked, _) = run_with("xinput", limits());
    assert_eq!(state_of(&snapshot, "xinput"), ["timeout"]);
    assert!(asked.iter().any(|a| a.0 == "mouse"));
    assert_eq!(snapshot["devices"].as_array().map(Vec::len), Some(1));
}

#[test]
fn readers_without_time_left_are_deferred() {
    let short = Limits {
        round: Duration::from_millis(320),
        unit: Duration::from_millis(50),
    };
    let (snapshot, asked, _) = run_with("", short);
    // Bluetooth needs 14 units, more than the whole round.
    assert!(!asked.iter().any(|a| a.0 == "bluetooth"));
    assert_eq!(state_of(&snapshot, "bluetooth"), ["deferred"]);
}
