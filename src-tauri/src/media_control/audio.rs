//! Default render endpoint: master volume and the output peak meter.
//!
//! The enumerator and the default output's volume and meter are kept on the media worker
//! thread (see [`super::worker`]) instead of being opened again on every read. The default
//! device is looked up again every few seconds, so switching output (headphones, HDMI) is
//! followed, and at once after any failed read.

use std::{
    cell::RefCell,
    time::{Duration, Instant},
};

use super::session::media_error;
use crate::win32::audio::{AudioDevices, OutputRole, OutputVolume, PeakMeter};

pub(super) const AUDIO_ACTIVE_THRESHOLD: f32 = 0.000015;
/// How long a default output is trusted before it is looked up again.
const DEVICE_REFRESH: Duration = Duration::from_secs(5);

struct Output {
    volume: Option<OutputVolume>,
    meter: Option<PeakMeter>,
    opened_at: Instant,
}

#[derive(Default)]
struct Cache {
    devices: Option<AudioDevices>,
    output: Option<Output>,
}

thread_local! {
    static CACHE: RefCell<Cache> = RefCell::new(Cache::default());
}

impl Cache {
    /// Opens the default output unless a recent one is cached.
    fn ensure_output(&mut self) -> Result<(), String> {
        if self.output.as_ref().is_some_and(|output| output.opened_at.elapsed() < DEVICE_REFRESH) {
            return Ok(());
        }
        self.output = None;
        if self.devices.is_none() {
            self.devices = Some(AudioDevices::open().map_err(|error| {
                media_error("Failed to open the Windows audio device manager", error)
            })?);
        }
        let Some(devices) = self.devices.as_ref() else {
            return Err("No Windows audio device manager.".to_string());
        };
        // Only the multimedia role: music plays there, and every extra role cost another open.
        let device = match devices.default_output(OutputRole::Multimedia) {
            Ok(device) => device,
            Err(error) => {
                // The enumerator itself may have gone stale (audio service restarted).
                self.devices = None;
                return Err(media_error("Failed to open the default audio output", error));
            }
        };
        self.output = Some(Output {
            volume: device.volume().ok(),
            meter: device.peak_meter().ok(),
            opened_at: Instant::now(),
        });
        Ok(())
    }

    fn try_read<T>(&mut self, read: &impl Fn(&Output) -> Option<T>) -> Result<Option<T>, String> {
        self.ensure_output()?;
        Ok(self.output.as_ref().and_then(read))
    }

    /// Runs `read` on the cached output, reopening it once when the read fails.
    fn read<T>(&mut self, read: impl Fn(&Output) -> Option<T>) -> Result<T, String> {
        if let Some(value) = self.try_read(&read)? {
            return Ok(value);
        }
        self.output = None;
        self.try_read(&read)?
            .ok_or_else(|| "The default audio output did not answer.".to_string())
    }
}

/// Drops the cached COM objects. The worker calls this before it leaves its apartment.
pub(super) fn release_cached() {
    CACHE.with(|cache| cache.replace(Cache::default()));
}

pub(super) fn read_master_volume() -> Option<f32> {
    CACHE.with(|cache| {
        cache
            .borrow_mut()
            .read(|output| output.volume.as_ref()?.level().ok())
            .ok()
            .map(|level| level.clamp(0.0, 1.0))
    })
}

pub(super) fn set_master_volume(level: f32) -> Result<(), String> {
    CACHE.with(|cache| {
        cache
            .borrow_mut()
            .read(|output| output.volume.as_ref()?.set_level(level.clamp(0.0, 1.0)).ok())
            .map_err(|error| format!("Failed to change the system volume: {error}"))
    })
}

pub(super) fn read_system_audio_peak() -> Result<f32, String> {
    CACHE.with(|cache| {
        cache
            .borrow_mut()
            .read(|output| output.meter.as_ref()?.peak().ok())
            .map(|peak| peak.clamp(0.0, 1.0))
    })
}
