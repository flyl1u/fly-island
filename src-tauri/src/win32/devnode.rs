//! Device-node properties through the configuration manager (cfgmgr32): which physical device
//! (container) a node belongs to, and the battery level Windows keeps for Bluetooth devices.

use windows::{
    core::{GUID, HSTRING, PCWSTR},
    Win32::{
        Devices::{
            DeviceAndDriverInstallation::{
                CM_Get_DevNode_PropertyW, CM_Get_Device_ID_ListW, CM_Get_Device_ID_List_SizeW, CM_Locate_DevNodeW,
                CM_GETIDLIST_FILTER_ENUMERATOR, CM_GETIDLIST_FILTER_PRESENT, CM_LOCATE_DEVNODE_NORMAL, CR_SUCCESS,
            },
            Properties::{DEVPKEY_Device_ContainerId, DEVPROPTYPE, DEVPROP_TYPE_BYTE, DEVPROP_TYPE_GUID},
        },
        Foundation::DEVPROPKEY,
    },
};

/// `{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2`: the battery percentage the Bluetooth stack
/// stores on a device's nodes when the device reports one (hands-free or GATT battery service).
const DEVPKEY_BLUETOOTH_BATTERY: DEVPROPKEY = DEVPROPKEY {
    fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5),
    pid: 2,
};

/// Bluetooth device nodes live under these enumerators (classic, hands-free, Low Energy).
const BLUETOOTH_ENUMERATORS: [&str; 3] = ["BTHENUM", "BTHHFENUM", "BTHLEDEVICE"];

fn locate(instance_id: &str) -> Option<u32> {
    let id = HSTRING::from(instance_id);
    let mut node = 0u32;
    // SAFETY: `node` is a valid out pointer and `id` a NUL-terminated string that outlives the call.
    let result = unsafe { CM_Locate_DevNodeW(&mut node, PCWSTR(id.as_ptr()), CM_LOCATE_DEVNODE_NORMAL) };
    (result == CR_SUCCESS).then_some(node)
}

/// Reads a fixed-size property of `node` into a `T`, if it has one of type `expected`.
fn property<T: Copy + Default>(node: u32, key: &DEVPROPKEY, expected: DEVPROPTYPE) -> Option<T> {
    let mut value = T::default();
    let mut kind = DEVPROPTYPE::default();
    let mut size = std::mem::size_of::<T>() as u32;
    // SAFETY: the buffer is `value`, exactly `size` bytes long, and every pointer is valid for the
    // call. The type is checked before the bytes are used as a `T`.
    let result = unsafe {
        CM_Get_DevNode_PropertyW(node, key, &mut kind, Some((&mut value as *mut T).cast()), &mut size, 0)
    };
    (result == CR_SUCCESS && kind == expected && size as usize == std::mem::size_of::<T>()).then_some(value)
}

/// The physical device a node belongs to; nodes of one headset share it.
pub(crate) fn container_id(instance_id: &str) -> Option<GUID> {
    property(locate(instance_id)?, &DEVPKEY_Device_ContainerId, DEVPROP_TYPE_GUID)
}

/// Present device ids under `enumerator`.
fn device_ids(enumerator: &str) -> Vec<String> {
    let filter = HSTRING::from(enumerator);
    let flags = CM_GETIDLIST_FILTER_ENUMERATOR | CM_GETIDLIST_FILTER_PRESENT;
    let mut length = 0u32;
    // SAFETY: `length` is a valid out pointer and `filter` outlives the call.
    if unsafe { CM_Get_Device_ID_List_SizeW(&mut length, PCWSTR(filter.as_ptr()), flags) } != CR_SUCCESS {
        return Vec::new();
    }
    let mut buffer = vec![0u16; length as usize];
    // SAFETY: `buffer` is as long as the size call asked for; the list is a series of
    // NUL-terminated strings ending in an empty one.
    if unsafe { CM_Get_Device_ID_ListW(PCWSTR(filter.as_ptr()), &mut buffer, flags) } != CR_SUCCESS {
        return Vec::new();
    }
    buffer
        .split(|&unit| unit == 0)
        .filter(|id| !id.is_empty())
        .map(String::from_utf16_lossy)
        .collect()
}

/// Battery percentages of the Bluetooth devices that report one, by container.
pub(crate) fn bluetooth_batteries() -> Vec<(GUID, u8)> {
    let mut found: Vec<(GUID, u8)> = Vec::new();
    for id in BLUETOOTH_ENUMERATORS.iter().flat_map(|enumerator| device_ids(enumerator)) {
        let Some(node) = locate(&id) else { continue };
        let Some(level) = property::<u8>(node, &DEVPKEY_BLUETOOTH_BATTERY, DEVPROP_TYPE_BYTE) else { continue };
        let Some(container) = property::<GUID>(node, &DEVPKEY_Device_ContainerId, DEVPROP_TYPE_GUID) else { continue };
        if !found.iter().any(|(known, _)| *known == container) {
            found.push((container, level.min(100)));
        }
    }
    found
}
