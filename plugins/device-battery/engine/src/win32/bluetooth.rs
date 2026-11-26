//! The Windows facts about paired Bluetooth devices: the PnP battery and connection
//! properties of the present device nodes, and the WinRT "connected right now" state.
//! Nothing scans the air and nothing is sent to a device.
use super::{from_wide, to_wide};
use crate::providers::bluetooth::{PnpNode, RadioState};
use std::sync::mpsc;
use std::time::Duration;
use windows::core::{GUID, PCWSTR};
use windows::Devices::Bluetooth::{BluetoothConnectionStatus, BluetoothDevice, BluetoothLEDevice};
use windows::Win32::Devices::DeviceAndDriverInstallation::{
    CM_Get_DevNode_Status, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo,
    SetupDiGetClassDevsW, SetupDiGetDeviceInstanceIdW, SetupDiGetDevicePropertyW,
    CM_DEVNODE_STATUS_FLAGS, CM_PROB, CR_SUCCESS, DIGCF_ALLCLASSES, DIGCF_PRESENT, DN_HAS_PROBLEM,
    HDEVINFO, SP_DEVINFO_DATA,
};
use windows::Win32::Devices::Properties::{
    DEVPKEY_Device_DeviceDesc, DEVPKEY_Device_FriendlyName, DEVPROPTYPE, DEVPROP_TYPE_BOOLEAN,
    DEVPROP_TYPE_BYTE, DEVPROP_TYPE_STRING,
};
use windows::Win32::Foundation::DEVPROPKEY;
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

const BATTERY: DEVPROPKEY = DEVPROPKEY {
    fmtid: GUID::from_u128(0x104EA319_6EE2_4701_BD47_8DDBF425BBE5),
    pid: 2,
};
const CONNECTED: DEVPROPKEY = DEVPROPKEY {
    fmtid: GUID::from_u128(0x83DA6326_97A6_4088_9453_A1923F573B29),
    pid: 15,
};
const ENUMERATORS: [&str; 3] = ["BTHENUM", "BTHLE", "BTHLEDEVICE"];
const RADIO_TIMEOUT: Duration = Duration::from_secs(3);

/// Every present Bluetooth device node. `None` when Windows cannot be asked at all.
pub(crate) fn pnp_nodes() -> Option<Vec<PnpNode>> {
    let mut nodes = Vec::new();
    let mut answered = false;
    for enumerator in ENUMERATORS {
        let wide = to_wide(enumerator);
        // SAFETY: `wide` is NUL terminated; no class GUID with DIGCF_ALLCLASSES.
        let set = unsafe {
            SetupDiGetClassDevsW(
                None,
                PCWSTR(wide.as_ptr()),
                None,
                DIGCF_PRESENT | DIGCF_ALLCLASSES,
            )
        };
        let Ok(set) = set else { continue };
        answered = true;
        for index in 0..1024 {
            let mut device = SP_DEVINFO_DATA {
                cbSize: size_of::<SP_DEVINFO_DATA>() as u32,
                ..Default::default()
            };
            // SAFETY: `set` is live and `device` carries its own size.
            if unsafe { SetupDiEnumDeviceInfo(set, index, &mut device) }.is_err() {
                break;
            }
            if let Some(node) = node(set, &device) {
                nodes.push(node);
            }
        }
        // SAFETY: `set` was created above and is destroyed once.
        let _ = unsafe { SetupDiDestroyDeviceInfoList(set) };
    }
    answered.then_some(nodes)
}

fn node(set: HDEVINFO, device: &SP_DEVINFO_DATA) -> Option<PnpNode> {
    let mut id = [0u16; 512];
    // SAFETY: the binding passes the buffer together with its own length.
    unsafe { SetupDiGetDeviceInstanceIdW(set, device, Some(&mut id), None) }.ok()?;
    let name = string(set, device, &DEVPKEY_Device_FriendlyName)
        .or_else(|| string(set, device, &DEVPKEY_Device_DeviceDesc));
    let mut status = CM_DEVNODE_STATUS_FLAGS::default();
    let mut problem = CM_PROB::default();
    // SAFETY: both outputs are live and the node comes from this device list.
    let state = unsafe { CM_Get_DevNode_Status(&mut status, &mut problem, device.DevInst, 0) };
    Some(PnpNode {
        id: from_wide(&id),
        name: name.unwrap_or_default(),
        status_ok: state == CR_SUCCESS && status.0 & DN_HAS_PROBLEM.0 == 0,
        battery: property(set, device, &BATTERY)
            .filter(|(kind, value)| *kind == DEVPROP_TYPE_BYTE && value.len() == 1)
            .map(|(_, value)| value[0]),
        connected: property(set, device, &CONNECTED)
            .filter(|(kind, value)| *kind == DEVPROP_TYPE_BOOLEAN && !value.is_empty())
            .map(|(_, value)| value[0] != 0),
    })
}

fn property(
    set: HDEVINFO,
    device: &SP_DEVINFO_DATA,
    key: &DEVPROPKEY,
) -> Option<(DEVPROPTYPE, Vec<u8>)> {
    let mut kind = DEVPROPTYPE::default();
    let mut buffer = vec![0u8; 1024];
    let mut size = 0u32;
    // SAFETY: the binding passes the buffer with its length; outputs are live.
    unsafe {
        SetupDiGetDevicePropertyW(
            set,
            device,
            key,
            &mut kind,
            Some(&mut buffer),
            Some(&mut size),
            0,
        )
    }
    .ok()?;
    buffer.truncate(size as usize);
    Some((kind, buffer))
}

fn string(set: HDEVINFO, device: &SP_DEVINFO_DATA, key: &DEVPROPKEY) -> Option<String> {
    let (kind, bytes) = property(set, device, key)?;
    if kind != DEVPROP_TYPE_STRING {
        return None;
    }
    let wide: Vec<u16> = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|&pair| u16::from_le_bytes(pair))
        .collect();
    Some(from_wide(&wide)).filter(|text| !text.is_empty())
}

/// The WinRT state of one device by address. A direct lookup does not scan, but it can
/// hang, so it runs on its own thread and is abandoned after three seconds.
pub(crate) fn radio_state(address: u64, low_energy: bool) -> Result<RadioState, &'static str> {
    let (send, receive) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = send.send(query_radio(address, low_energy));
    });
    receive
        .recv_timeout(RADIO_TIMEOUT)
        .map_err(|_| "timeout")?
        .map_err(|_| "unavailable")
}

fn query_radio(address: u64, low_energy: bool) -> windows::core::Result<RadioState> {
    // SAFETY: initializes WinRT for this new thread; "already initialized" is harmless.
    let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
    if low_energy {
        let device = BluetoothLEDevice::FromBluetoothAddressAsync(address)?.get()?;
        let state = RadioState {
            connected: device.ConnectionStatus()? == BluetoothConnectionStatus::Connected,
            class: device
                .Appearance()
                .and_then(|a| a.RawValue())
                .ok()
                .map(u32::from),
        };
        let _ = device.Close();
        Ok(state)
    } else {
        let device = BluetoothDevice::FromBluetoothAddressAsync(address)?.get()?;
        let state = RadioState {
            connected: device.ConnectionStatus()? == BluetoothConnectionStatus::Connected,
            class: device.ClassOfDevice().and_then(|c| c.RawValue()).ok(),
        };
        let _ = device.Close();
        Ok(state)
    }
}
