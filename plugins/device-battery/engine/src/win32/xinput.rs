//! XInput battery tiers from the System32 `xinput1_4.dll`. No controller commands.
use windows::core::{s, w};
use windows::Win32::System::LibraryLoader::{
    GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32,
};

#[repr(C)]
#[derive(Default)]
struct State {
    packet: u32,
    buttons: u16,
    triggers: [u8; 2],
    thumbs: [i16; 4],
}

#[repr(C)]
#[derive(Default)]
struct BatteryInformation {
    kind: u8,
    level: u8,
}

type GetState = unsafe extern "system" fn(u32, *mut State) -> u32;
type GetBattery = unsafe extern "system" fn(u32, u8, *mut BatteryInformation) -> u32;

/// `(slot, battery type, battery level)` of every connected controller.
pub(crate) fn batteries() -> Vec<(u32, u8, u8)> {
    // SAFETY: a static name, searched in System32 only, so a same-named local DLL is
    // never loaded. The module stays loaded for the life of this one-shot process.
    let Ok(module) =
        (unsafe { LoadLibraryExW(w!("xinput1_4.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32) })
    else {
        return Vec::new();
    };
    // SAFETY: the module is valid and the export names are static.
    let (state, battery) = unsafe {
        (
            GetProcAddress(module, s!("XInputGetState")),
            GetProcAddress(module, s!("XInputGetBatteryInformation")),
        )
    };
    let (Some(state), Some(battery)) = (state, battery) else {
        return Vec::new();
    };
    // SAFETY: these are the documented signatures of the two XInput exports.
    let (get_state, get_battery) = unsafe {
        (
            std::mem::transmute::<unsafe extern "system" fn() -> isize, GetState>(state),
            std::mem::transmute::<unsafe extern "system" fn() -> isize, GetBattery>(battery),
        )
    };
    (0..4)
        .filter_map(|slot| {
            let mut state = State::default();
            // SAFETY: `state` matches XINPUT_STATE.
            if unsafe { get_state(slot, &mut state) } != 0 {
                return None;
            }
            let mut info = BatteryInformation::default();
            // SAFETY: `info` matches XINPUT_BATTERY_INFORMATION; 0 is the gamepad.
            if unsafe { get_battery(slot, 0, &mut info) } != 0 {
                return None;
            }
            Some((slot, info.kind, info.level))
        })
        .collect()
}
