//! Turns successive readings of the audio outputs, Bluetooth batteries and power source into
//! the alerts the island shows. No Windows calls here, so every rule is unit tested.

use std::collections::HashMap;

use serde::Serialize;

/// Battery levels that warn once each as a Bluetooth device runs down.
const LOW_BATTERY: [u8; 2] = [20, 10];
/// A device charged this far above the first warning level warns again next time.
const RECHARGED: u8 = 30;
/// Polls a new Bluetooth output waits for its battery level before it is announced without one
/// (Windows often stores the level a moment after the audio endpoint appears).
pub(crate) const BATTERY_WAIT_POLLS: u32 = 3;

/// What kind of output the island names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AudioKind {
    Headphones,
    Headset,
    /// A Bluetooth output that is neither, such as a speaker.
    Speaker,
}

/// An output worth announcing: headphones or a headset on any bus, or anything on Bluetooth.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Output {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) kind: AudioKind,
    /// The physical device; the stereo and hands-free endpoints of one headset share it.
    pub(crate) device: String,
    pub(crate) bluetooth: bool,
}

impl Output {
    /// `form_factor` and `enumerator` as Windows reports them; `None` for outputs the island
    /// ignores (built-in speakers, a monitor's HDMI audio, line out).
    pub(crate) fn classify(id: String, name: String, form_factor: u32, enumerator: &str, device: Option<String>) -> Option<Self> {
        let bluetooth = enumerator.starts_with("BTH");
        let kind = match form_factor {
            3 => AudioKind::Headphones,
            5 => AudioKind::Headset,
            _ if bluetooth => AudioKind::Speaker,
            _ => return None,
        };
        let device = device.unwrap_or_else(|| id.clone());
        Some(Self { id, name, kind, device, bluetooth })
    }
}

/// Sent to the island as `device-alert`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(crate) enum DeviceAlert {
    #[serde(rename_all = "camelCase")]
    AudioConnected { name: String, device: AudioKind, battery: Option<u8> },
    #[serde(rename_all = "camelCase")]
    AudioDisconnected { name: String, device: AudioKind },
    #[serde(rename_all = "camelCase")]
    BatteryLow { name: String, battery: u8 },
    #[serde(rename_all = "camelCase")]
    PowerConnected { battery: Option<u8> },
    #[serde(rename_all = "camelCase")]
    PowerDisconnected { battery: Option<u8> },
}

/// Follows the announced outputs from poll to poll.
#[derive(Debug, Default)]
pub(crate) struct OutputTracker {
    /// `None` until the first reading, which only sets the starting point.
    known: Option<Vec<Output>>,
    /// New Bluetooth outputs waiting for their battery level, with the polls waited so far.
    waiting: Vec<(Output, u32)>,
    /// The lowest warning level already given, per device.
    warned: HashMap<String, u8>,
}

impl OutputTracker {
    /// True while a new Bluetooth output waits for its battery level, so batteries are read every poll.
    pub(crate) fn wants_batteries(&self) -> bool {
        !self.waiting.is_empty()
    }

    /// Forgets everything; the next reading is a new starting point.
    pub(crate) fn reset(&mut self) {
        *self = Self::default();
    }

    /// The alerts for this reading. `batteries` maps a device to its level.
    pub(crate) fn update(&mut self, outputs: Vec<Output>, batteries: &HashMap<String, u8>) -> Vec<DeviceAlert> {
        let mut alerts = Vec::new();
        let Some(known) = self.known.replace(outputs.clone()) else {
            for output in &outputs {
                self.note_level(output, batteries);
            }
            return alerts;
        };
        let present = |list: &[Output], device: &str| list.iter().any(|output| output.device == device);

        // Gone: announce each device once, unless it never was.
        let mut gone: Vec<&Output> = Vec::new();
        for output in known.iter().filter(|output| !present(&outputs, &output.device)) {
            if gone.iter().any(|seen| seen.device == output.device) {
                continue;
            }
            gone.push(output);
            if let Some(index) = self.waiting.iter().position(|(waiting, _)| waiting.device == output.device) {
                self.waiting.remove(index);
                continue;
            }
            self.warned.remove(&output.device);
            alerts.push(DeviceAlert::AudioDisconnected { name: output.name.clone(), device: output.kind });
        }

        // New: one alert per device, headphones before the hands-free headset of the same device.
        let mut new: Vec<&Output> = outputs.iter().filter(|output| !present(&known, &output.device)).collect();
        new.sort_by_key(|output| output.kind != AudioKind::Headphones);
        for output in new {
            if self.waiting.iter().any(|(waiting, _)| waiting.device == output.device) {
                continue;
            }
            self.waiting.push((output.clone(), 0));
        }
        let waiting = std::mem::take(&mut self.waiting);
        for (output, polls) in waiting {
            let battery = batteries.get(&output.device).copied();
            if battery.is_none() && output.bluetooth && polls < BATTERY_WAIT_POLLS {
                self.waiting.push((output, polls + 1));
                continue;
            }
            self.note_level(&output, batteries);
            alerts.push(DeviceAlert::AudioConnected { name: output.name.clone(), device: output.kind, battery });
        }

        // Running low: each warning level once per device and charge.
        let mut checked: Vec<&str> = Vec::new();
        for output in &outputs {
            if checked.contains(&output.device.as_str()) || self.waiting.iter().any(|(waiting, _)| waiting.device == output.device) {
                continue;
            }
            checked.push(&output.device);
            let Some(&battery) = batteries.get(&output.device) else { continue };
            let warned = self.warned.get(&output.device).copied().unwrap_or(u8::MAX);
            if battery >= RECHARGED {
                self.warned.remove(&output.device);
            } else if let Some(level) = LOW_BATTERY.iter().copied().filter(|&level| battery <= level && level < warned).min() {
                self.warned.insert(output.device.clone(), level);
                alerts.push(DeviceAlert::BatteryLow { name: output.name.clone(), battery });
            }
        }
        alerts
    }

    /// Records the warning levels a device is already below, so connecting at 15% does not
    /// also warn about 20%.
    fn note_level(&mut self, output: &Output, batteries: &HashMap<String, u8>) {
        if let Some(level) = batteries
            .get(&output.device)
            .and_then(|&battery| LOW_BATTERY.iter().copied().filter(|&level| battery <= level).min())
        {
            self.warned.insert(output.device.clone(), level);
        }
    }
}

/// Follows the power source: an alert when the charger is plugged in or pulled out.
#[derive(Debug, Default)]
pub(crate) struct PowerTracker {
    plugged_in: Option<bool>,
}

impl PowerTracker {
    pub(crate) fn reset(&mut self) {
        self.plugged_in = None;
    }

    /// `None` readings (no battery, unknown) change nothing.
    pub(crate) fn update(&mut self, plugged_in: Option<bool>, battery: Option<u8>) -> Option<DeviceAlert> {
        let now = plugged_in?;
        let before = self.plugged_in.replace(now)?;
        match (before, now) {
            (false, true) => Some(DeviceAlert::PowerConnected { battery }),
            (true, false) => Some(DeviceAlert::PowerDisconnected { battery }),
            _ => None,
        }
    }
}
