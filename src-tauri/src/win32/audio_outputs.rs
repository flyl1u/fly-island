//! The audio outputs that are in use right now, with what kind of device each one is.
//!
//! Callers must run on a thread that has entered a COM apartment (see
//! [`super::com::ComApartment`]).

use windows::{
    core::{Result, PWSTR},
    Win32::{
        Devices::FunctionDiscovery::{PKEY_Device_EnumeratorName, PKEY_Device_FriendlyName},
        Foundation::PROPERTYKEY,
        Media::Audio::{eRender, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, PKEY_AudioEndpoint_FormFactor, DEVICE_STATE_ACTIVE},
        System::Com::{
            CoCreateInstance, CoTaskMemFree,
            StructuredStorage::{PropVariantClear, PropVariantToStringAlloc, PropVariantToUInt32, PROPVARIANT},
            CLSCTX_ALL, STGM_READ,
        },
        UI::Shell::PropertiesSystem::IPropertyStore,
    },
};

/// One active output endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AudioOutputInfo {
    /// The endpoint id; its device node is `SWD\MMDEVAPI\<id>`.
    pub(crate) id: String,
    /// What Windows shows in the sound settings, e.g. "耳机 (WH-1000XM4)".
    pub(crate) name: String,
    /// `EndpointFormFactor`: 1 speakers, 3 headphones, 5 headset, 9 a display's HDMI audio, ….
    pub(crate) form_factor: u32,
    /// The bus the device hangs off: "USB", "HDAUDIO", "BTHENUM", "BTHHFENUM", ….
    pub(crate) enumerator: String,
}

/// Every output endpoint that is active (plugged in and enabled) now.
pub(crate) fn active_outputs() -> Result<Vec<AudioOutputInfo>> {
    // SAFETY: MMDeviceEnumerator is a valid class id with no outer object; the returned
    // interfaces are owned and reference counted. Indexes stay below the collection's count.
    unsafe {
        let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
        let collection = devices.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
        let count = collection.GetCount()?;
        let mut outputs = Vec::with_capacity(count as usize);
        for index in 0..count {
            if let Ok(output) = collection.Item(index).and_then(|device| describe(&device)) {
                outputs.push(output);
            }
        }
        Ok(outputs)
    }
}

fn describe(device: &IMMDevice) -> Result<AudioOutputInfo> {
    // SAFETY: `device` is a live endpoint. The id string is allocated by COM and freed here
    // after it was copied; the property store is an owned interface.
    let (id, store) = unsafe {
        let raw = device.GetId()?;
        let id = raw.to_string();
        CoTaskMemFree(Some(raw.0 as *const _));
        (id.map_err(|_| windows::core::Error::empty())?, device.OpenPropertyStore(STGM_READ)?)
    };
    Ok(AudioOutputInfo {
        id,
        name: read_string(&store, &PKEY_Device_FriendlyName).unwrap_or_default(),
        form_factor: read_u32(&store, &PKEY_AudioEndpoint_FormFactor).unwrap_or(0),
        enumerator: read_string(&store, &PKEY_Device_EnumeratorName).unwrap_or_default(),
    })
}

/// Reads a property and clears the PROPVARIANT afterwards, whatever `convert` returned.
fn read<T>(store: &IPropertyStore, key: &PROPERTYKEY, convert: impl FnOnce(&PROPVARIANT) -> Option<T>) -> Option<T> {
    // SAFETY: `key` points to a valid PROPERTYKEY for the duration of the call; the returned
    // PROPVARIANT is owned here and cleared exactly once.
    unsafe {
        let mut value = store.GetValue(key).ok()?;
        let result = convert(&value);
        let _ = PropVariantClear(&mut value);
        result
    }
}

fn read_string(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<String> {
    read(store, key, |value| {
        // SAFETY: `value` is a live PROPVARIANT; the converted string is allocated by COM and
        // freed here after it was copied.
        unsafe {
            let text: PWSTR = PropVariantToStringAlloc(value).ok()?;
            let copy = text.to_string().ok();
            CoTaskMemFree(Some(text.0 as *const _));
            copy
        }
    })
}

fn read_u32(store: &IPropertyStore, key: &PROPERTYKEY) -> Option<u32> {
    // SAFETY: `value` is a live PROPVARIANT; the conversion only reads it.
    read(store, key, |value| unsafe { PropVariantToUInt32(value) }.ok())
}
