//! Default multimedia output: volume and peak interfaces live on the media COM worker.
//! A periodic lookup follows changes to the default device without activating unchanged
//! interfaces. Failed interfaces recover independently, with a delay between attempts.

use std::{
    cell::RefCell,
    time::{Duration, Instant},
};

use super::session::media_error;
use crate::win32::audio::{AudioDevices, AudioOutput, OutputRole, OutputVolume, PeakMeter};

pub(super) const AUDIO_ACTIVE_THRESHOLD: f32 = 0.000015;
const DEVICE_REFRESH: Duration = Duration::from_secs(5);
const DEVICE_RETRY: Duration = Duration::from_secs(2);

struct Output {
    id: String,
    volume: Option<OutputVolume>,
    meter: Option<PeakMeter>,
}

#[derive(Default)]
struct Cache {
    devices: Option<AudioDevices>,
    output: Option<Output>,
    next_check: Option<Instant>,
}

thread_local! {
    static CACHE: RefCell<Cache> = RefCell::new(Cache::default());
}

impl Cache {
    fn default_output(&mut self) -> Result<(AudioOutput, String), String> {
        if self.devices.is_none() {
            self.devices = Some(AudioDevices::open().map_err(|error| {
                media_error("Failed to open the Windows audio device manager", error)
            })?);
        }
        let devices = self
            .devices
            .as_ref()
            .ok_or_else(|| "No Windows audio device manager.".to_string())?;
        let device = devices
            .default_output(OutputRole::Multimedia)
            .map_err(|error| media_error("Failed to open the default audio output", error))?;
        let id = device
            .id()
            .map_err(|error| media_error("Failed to identify the default audio output", error))?;
        Ok((device, id))
    }

    fn refresh_if_due(&mut self) -> Result<(), String> {
        if self.next_check.is_some_and(|check| check > Instant::now()) {
            return Ok(());
        }
        let (device, id) = match self.default_output() {
            Ok(device) => device,
            Err(error) => {
                // The audio service may still be starting or have restarted.
                self.devices = None;
                self.output = None;
                self.next_check = Some(Instant::now() + DEVICE_RETRY);
                return Err(error);
            }
        };
        if self.output.as_ref().is_none_or(|output| output.id != id) {
            self.output = Some(Output {
                id,
                volume: None,
                meter: None,
            });
        }
        if let Some(output) = &mut self.output {
            if output.volume.is_none() {
                output.volume = device.volume().ok();
            }
            if output.meter.is_none() {
                output.meter = device.peak_meter().ok();
            }
        }
        self.next_check = Some(Instant::now() + DEVICE_REFRESH);
        Ok(())
    }

    fn read<I, T>(
        &mut self,
        interface: fn(&mut Output) -> &mut Option<I>,
        read: impl FnOnce(&I) -> windows::core::Result<T>,
    ) -> Result<T, String> {
        self.refresh_if_due()?;
        let Some(interface) = self.output.as_mut().map(interface) else {
            return Err("Windows has no default multimedia audio output.".to_string());
        };
        let Some(active) = interface.as_ref() else {
            return Err("The default audio output interface is unavailable.".to_string());
        };
        read(active).map_err(|error| {
            *interface = None;
            let retry_at = Instant::now() + DEVICE_RETRY;
            self.next_check = Some(
                self.next_check
                    .map_or(retry_at, |check| check.min(retry_at)),
            );
            media_error("The default audio output did not answer", error)
        })
    }
}

/// Drops the cached COM objects before the worker leaves its apartment.
pub(super) fn release_cached() {
    CACHE.with(|cache| cache.replace(Cache::default()));
}

pub(super) fn read_master_volume() -> Option<f32> {
    CACHE.with(|cache| {
        cache
            .borrow_mut()
            .read(|output| &mut output.volume, OutputVolume::level)
            .ok()
            .map(|level| level.clamp(0.0, 1.0))
    })
}

pub(super) fn set_master_volume(level: f32) -> Result<(), String> {
    CACHE.with(|cache| {
        cache
            .borrow_mut()
            .read(
                |output| &mut output.volume,
                |volume| volume.set_level(level.clamp(0.0, 1.0)),
            )
            .map_err(|error| format!("Failed to change the system volume: {error}"))
    })
}

pub(super) fn read_system_audio_peak() -> Result<f32, String> {
    CACHE.with(|cache| {
        cache
            .borrow_mut()
            .read(|output| &mut output.meter, PeakMeter::peak)
            .map(|peak| peak.clamp(0.0, 1.0))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unavailable_output_is_not_reopened_before_the_retry_deadline() {
        let next_check = Some(Instant::now() + DEVICE_RETRY);
        let mut cache = Cache {
            next_check,
            ..Cache::default()
        };
        assert!(cache
            .read(|output| &mut output.meter, PeakMeter::peak)
            .is_err());
        assert!(cache.devices.is_none());
        assert_eq!(cache.next_check, next_check);
    }

    #[test]
    #[ignore = "requires a live default Windows multimedia output"]
    fn still_reads_the_audio_output_after_rechecking_the_device() {
        let _apartment = crate::win32::com::ComApartment::multithreaded().unwrap();
        let mut cache = Cache::default();
        let volume = |cache: &mut Cache| {
            cache
                .read(|output| &mut output.volume, OutputVolume::level)
                .unwrap()
        };
        assert!((0.0..=1.0).contains(&volume(&mut cache)));
        let id = cache.output.as_ref().unwrap().id.clone();
        assert!(!id.is_empty());
        cache.next_check = None;
        assert!((0.0..=1.0).contains(&volume(&mut cache)));
        assert_eq!(cache.output.as_ref().unwrap().id, id);
        assert!((0.0..=1.0).contains(
            &cache
                .read(|output| &mut output.meter, PeakMeter::peak)
                .unwrap()
        ));
    }
}
