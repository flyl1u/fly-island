//! Default audio output endpoints: master volume and peak meter.
//!
//! Callers must run on a thread that has entered a COM apartment (see
//! [`super::com::ComApartment`]).

use windows::{
    core::{Interface, Result},
    Win32::{
        Media::Audio::{
            eCommunications, eConsole, eMultimedia, eRender, ERole,
            Endpoints::{IAudioEndpointVolume, IAudioMeterInformation},
            AudioSessionStateActive, AudioSessionStateExpired, DEVICE_STATE_ACTIVE,
            IAudioSessionControl2, IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator,
            ISimpleAudioVolume, MMDeviceEnumerator,
        },
        System::Com::{CoCreateInstance, CLSCTX_ALL},
    },
};

/// Which default output device to open; Windows can assign a different device to
/// each role.
#[derive(Debug, Clone, Copy)]
pub(crate) enum OutputRole {
    Multimedia,
    Console,
    Communications,
}

impl OutputRole {
    fn erole(self) -> ERole {
        match self {
            Self::Multimedia => eMultimedia,
            Self::Console => eConsole,
            Self::Communications => eCommunications,
        }
    }
}

pub(crate) struct AudioDevices(IMMDeviceEnumerator);

impl AudioDevices {
    pub(crate) fn open() -> Result<Self> {
        // SAFETY: MMDeviceEnumerator is a valid class id, there is no outer
        // object, and the returned interface is reference counted by the wrapper.
        unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }.map(Self)
    }

    /// Default render (output) device for `role`.
    pub(crate) fn default_output(&self, role: OutputRole) -> Result<AudioOutput> {
        // SAFETY: `self.0` is a live enumerator; both arguments are plain enums.
        unsafe { self.0.GetDefaultAudioEndpoint(eRender, role.erole()) }.map(AudioOutput)
    }

    /// Includes non-default devices, such as a player routed to a second sound card.
    pub(crate) fn active_outputs(&self) -> Result<Vec<AudioOutput>> {
        // SAFETY: the enumerator is live and both arguments are plain enum values.
        let devices = unsafe { self.0.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) }?;
        // SAFETY: the collection is owned and live for this enumeration.
        let count = unsafe { devices.GetCount() }?;
        Ok((0..count).filter_map(|index| {
            // SAFETY: index is within the collection's reported count.
            unsafe { devices.Item(index) }.ok().map(AudioOutput)
        }).collect())
    }
}

pub(crate) struct AudioOutput(IMMDevice);

impl AudioOutput {
    pub(crate) fn sessions(&self) -> Result<Vec<AudioSession>> {
        // SAFETY: the device is live; activation takes no optional parameters.
        let manager = unsafe { self.0.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) }?;
        // SAFETY: the manager remains alive throughout the enumeration.
        let sessions = unsafe { manager.GetSessionEnumerator() }?;
        // SAFETY: sessions is a live, owned collection.
        let count = unsafe { sessions.GetCount() }?;
        Ok((0..count).filter_map(|index| {
            // SAFETY: index is within the collection's reported count.
            let control = unsafe { sessions.GetSession(index) }.ok()?;
            let control: IAudioSessionControl2 = control.cast().ok()?;
            // SAFETY: the session control is live. Expired streams are no longer controllable.
            if unsafe { control.GetState() }.ok()? == AudioSessionStateExpired { return None; }
            Some(AudioSession(control))
        }).collect())
    }

    pub(crate) fn volume(&self) -> Result<OutputVolume> {
        // SAFETY: `self.0` is a live device; no activation parameters are passed
        // and the typed Activate returns an owned interface.
        unsafe { self.0.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) }.map(OutputVolume)
    }

    pub(crate) fn peak_meter(&self) -> Result<PeakMeter> {
        // SAFETY: as in `volume`.
        unsafe { self.0.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None) }.map(PeakMeter)
    }
}

/// A process's audio stream. This controls its sound, never its playback position.
pub(crate) struct AudioSession(IAudioSessionControl2);

impl AudioSession {
    pub(crate) fn process_id(&self) -> Result<u32> {
        // SAFETY: the owned control interface is live; there are no caller-owned pointers.
        unsafe { self.0.GetProcessId() }
    }

    pub(crate) fn active(&self) -> bool {
        // SAFETY: the owned control interface is live.
        unsafe { self.0.GetState() }.is_ok_and(|state| state == AudioSessionStateActive)
    }

    pub(crate) fn muted(&self) -> Result<bool> {
        let volume: ISimpleAudioVolume = self.0.cast()?;
        // SAFETY: the volume interface is owned and live.
        unsafe { volume.GetMute() }.map(|value| value.as_bool())
    }

    pub(crate) fn set_muted(&self, muted: bool) -> Result<()> {
        let volume: ISimpleAudioVolume = self.0.cast()?;
        // SAFETY: the volume interface is live and a null event-context GUID is allowed.
        unsafe { volume.SetMute(muted, std::ptr::null()) }
    }

    pub(crate) fn peak(&self) -> f32 {
        let Ok(meter) = self.0.cast::<IAudioMeterInformation>() else { return 0.0; };
        // SAFETY: the meter interface is owned and live.
        unsafe { meter.GetPeakValue() }.unwrap_or(0.0).clamp(0.0, 1.0)
    }
}

pub(crate) struct OutputVolume(IAudioEndpointVolume);

impl OutputVolume {
    /// Master volume as a scalar in 0.0..=1.0.
    pub(crate) fn level(&self) -> Result<f32> {
        // SAFETY: `self.0` is a live endpoint volume interface; the call takes no
        // pointers.
        unsafe { self.0.GetMasterVolumeLevelScalar() }
    }

    /// Sets the master volume scalar. Windows rejects values outside 0.0..=1.0.
    pub(crate) fn set_level(&self, level: f32) -> Result<()> {
        // SAFETY: `self.0` is a live endpoint volume interface; a null event
        // context GUID is documented as allowed.
        unsafe { self.0.SetMasterVolumeLevelScalar(level, std::ptr::null()) }
    }
}

pub(crate) struct PeakMeter(IAudioMeterInformation);

impl PeakMeter {
    /// Current output peak in 0.0..=1.0.
    pub(crate) fn peak(&self) -> Result<f32> {
        // SAFETY: `self.0` is a live meter interface; the call takes no pointers.
        unsafe { self.0.GetPeakValue() }
    }
}
