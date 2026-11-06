//! Default audio output endpoints: master volume and peak meter.
//!
//! Callers must run on a thread that has entered a COM apartment (see
//! [`super::com::ComApartment`]).

use windows::{
    core::Result,
    Win32::{
        Media::Audio::{
            eCommunications, eConsole, eMultimedia, eRender, ERole,
            Endpoints::{IAudioEndpointVolume, IAudioMeterInformation},
            IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
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
}

pub(crate) struct AudioOutput(IMMDevice);

impl AudioOutput {
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

pub(crate) struct OutputVolume(IAudioEndpointVolume);

impl OutputVolume {
    /// Master volume as a scalar in 0.0..=1.0.
    pub(crate) fn level(&self) -> Result<f32> {
        // SAFETY: `self.0` is a live endpoint volume interface; the call takes no
        // pointers.
        unsafe { self.0.GetMasterVolumeLevelScalar() }
    }

    /// Whether the output is muted.
    pub(crate) fn muted(&self) -> Result<bool> {
        // SAFETY: `self.0` is a live endpoint volume interface; the call takes no pointers.
        unsafe { self.0.GetMute() }.map(|muted| muted.as_bool())
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
