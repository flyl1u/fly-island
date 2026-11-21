//! Default audio output endpoints: master volume and peak meter.
//!
//! Callers must run on a thread that has entered a COM apartment (see
//! [`super::com::ComApartment`]).

use windows::{
    core::{Error, Result, PWSTR},
    Win32::{
        Foundation::E_UNEXPECTED,
        Media::Audio::{
            eMultimedia, eRender, ERole,
            Endpoints::{IAudioEndpointVolume, IAudioMeterInformation},
            IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
        },
        System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL},
    },
};

/// Which default output device to open; Windows can assign a different device to
/// each role. Only the multimedia one is read: music plays there.
#[derive(Debug, Clone, Copy)]
pub(crate) enum OutputRole {
    Multimedia,
}

impl OutputRole {
    fn erole(self) -> ERole {
        match self {
            Self::Multimedia => eMultimedia,
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
    /// The opaque device ID identifies an endpoint even between enumeration calls.
    pub(crate) fn id(&self) -> Result<String> {
        // SAFETY: GetId returns an owned, NUL-terminated string from the COM task allocator.
        let id = EndpointId(unsafe { self.0.GetId()? });
        // SAFETY: the buffer is live and NUL-terminated for the conversion.
        unsafe { id.0.to_string() }.map_err(|_| Error::from(E_UNEXPECTED))
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

struct EndpointId(PWSTR);

impl Drop for EndpointId {
    fn drop(&mut self) {
        // SAFETY: GetId allocated this buffer with the COM task allocator; we free it once.
        unsafe { CoTaskMemFree(Some(self.0.as_ptr().cast())) };
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
