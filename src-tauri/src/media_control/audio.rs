//! Default render endpoint: master volume and the output peak meter.

use windows::Win32::{
    Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation},
    Media::Audio::{
        eCommunications, eConsole, eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    },
    System::Com::{CoCreateInstance, CLSCTX_ALL},
};

use super::session::media_error;

pub(super) const AUDIO_ACTIVE_THRESHOLD: f32 = 0.000015;

pub(super) fn read_master_volume() -> Option<f32> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok()?;
        let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).ok()?;
        let level = endpoint.GetMasterVolumeLevelScalar().ok()?;
        Some(level.clamp(0.0, 1.0))
    }
}

pub(super) fn set_master_volume(level: f32) -> Result<(), String> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|error| {
                media_error("Failed to open the Windows audio device manager", error)
            })?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|error| media_error("Failed to open the default audio output", error))?;
        let endpoint: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|error| media_error("Failed to open the audio volume control", error))?;
        endpoint
            .SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null())
            .map_err(|error| media_error("Failed to change the system volume", error))?;
        Ok(())
    }
}

pub(super) fn read_system_audio_peak() -> Result<f32, String> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|error| {
                media_error("Failed to open the Windows audio device manager", error)
            })?;
        let mut peak = 0.0_f32;
        let mut found_meter = false;

        for role in [eMultimedia, eConsole, eCommunications] {
            if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, role) {
                if let Ok(meter) = device.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None) {
                    found_meter = true;
                    if let Ok(value) = meter.GetPeakValue() {
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
}
