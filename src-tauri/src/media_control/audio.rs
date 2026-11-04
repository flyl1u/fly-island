//! Default render endpoint: master volume and the output peak meter.

use super::session::media_error;
use crate::win32::audio::{AudioDevices, OutputRole};

pub(super) const AUDIO_ACTIVE_THRESHOLD: f32 = 0.000015;

pub(super) fn read_master_volume() -> Option<f32> {
    let devices = AudioDevices::open().ok()?;
    let device = devices.default_output(OutputRole::Multimedia).ok()?;
    let endpoint = device.volume().ok()?;
    let level = endpoint.level().ok()?;
    Some(level.clamp(0.0, 1.0))
}

pub(super) fn set_master_volume(level: f32) -> Result<(), String> {
    let devices = AudioDevices::open()
        .map_err(|error| media_error("Failed to open the Windows audio device manager", error))?;
    let device = devices
        .default_output(OutputRole::Multimedia)
        .map_err(|error| media_error("Failed to open the default audio output", error))?;
    let endpoint = device
        .volume()
        .map_err(|error| media_error("Failed to open the audio volume control", error))?;
    endpoint
        .set_level(level.clamp(0.0, 1.0))
        .map_err(|error| media_error("Failed to change the system volume", error))?;
    Ok(())
}

pub(super) fn read_system_audio_peak() -> Result<f32, String> {
    let devices = AudioDevices::open()
        .map_err(|error| media_error("Failed to open the Windows audio device manager", error))?;
    let mut peak = 0.0_f32;
    let mut found_meter = false;

    for role in [
        OutputRole::Multimedia,
        OutputRole::Console,
        OutputRole::Communications,
    ] {
        if let Ok(device) = devices.default_output(role) {
            if let Ok(meter) = device.peak_meter() {
                found_meter = true;
                if let Ok(value) = meter.peak() {
                    peak = peak.max(value);
                }
            }
        }
    }

    if found_meter {
        Ok(peak.clamp(0.0, 1.0))
    } else {
        Err("No default Windows audio output was available.".to_string())
    }
}
