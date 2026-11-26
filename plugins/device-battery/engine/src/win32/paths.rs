//! Present HID interface paths and the USB parent of one path. Neither opens the device.
use super::{from_wide, to_wide};
use windows::core::PCWSTR;
use windows::Win32::Devices::DeviceAndDriverInstallation::{
    CM_Get_Device_IDW, CM_Get_Device_Interface_ListW, CM_Get_Device_Interface_List_SizeW,
    CM_Get_Parent, SetupDiCreateDeviceInfoList, SetupDiDestroyDeviceInfoList,
    SetupDiGetDeviceInterfaceDetailW, SetupDiOpenDeviceInterfaceW,
    CM_GET_DEVICE_INTERFACE_LIST_PRESENT, CR_BUFFER_SMALL, CR_SUCCESS, SP_DEVICE_INTERFACE_DATA,
    SP_DEVICE_INTERFACE_DETAIL_DATA_W, SP_DEVINFO_DATA,
};
use windows::Win32::Devices::HumanInterfaceDevice::GUID_DEVINTERFACE_HID;

/// Lower-cased paths of the present HID interfaces, sorted and unique.
pub(crate) fn hid_interface_paths() -> Option<Vec<String>> {
    // The list can grow between the size query and the read.
    for _ in 0..4 {
        let mut size = 0u32;
        // SAFETY: `size` is a live u32 and the GUID is a static constant.
        let result = unsafe {
            CM_Get_Device_Interface_List_SizeW(
                &mut size,
                &GUID_DEVINTERFACE_HID,
                PCWSTR::null(),
                CM_GET_DEVICE_INTERFACE_LIST_PRESENT,
            )
        };
        if result != CR_SUCCESS {
            return None;
        }
        let mut buffer = vec![0u16; size as usize + 1];
        // SAFETY: the binding passes the buffer together with its own length.
        let result = unsafe {
            CM_Get_Device_Interface_ListW(
                &GUID_DEVINTERFACE_HID,
                PCWSTR::null(),
                &mut buffer,
                CM_GET_DEVICE_INTERFACE_LIST_PRESENT,
            )
        };
        if result == CR_BUFFER_SMALL {
            continue;
        }
        if result != CR_SUCCESS {
            return None;
        }
        let mut paths: Vec<String> = buffer
            .split(|&c| c == 0)
            .filter(|part| !part.is_empty())
            .map(|part| String::from_utf16_lossy(part).to_lowercase())
            .collect();
        paths.sort();
        paths.dedup();
        return Some(paths);
    }
    None
}

/// The lower-cased PnP instance id of the USB device that owns a HID interface, when
/// Windows can prove it.
pub(crate) fn usb_parent(path: &str) -> Option<String> {
    // SAFETY: no class GUID and no parent window are valid arguments.
    let set = unsafe { SetupDiCreateDeviceInfoList(None, None) }.ok()?;
    let found = parent_in_set(set, path);
    // SAFETY: `set` was created above and is destroyed exactly once.
    let _ = unsafe { SetupDiDestroyDeviceInfoList(set) };
    found
}

fn parent_in_set(
    set: windows::Win32::Devices::DeviceAndDriverInstallation::HDEVINFO,
    path: &str,
) -> Option<String> {
    let wide = to_wide(path);
    let mut interface = SP_DEVICE_INTERFACE_DATA {
        cbSize: size_of::<SP_DEVICE_INTERFACE_DATA>() as u32,
        ..Default::default()
    };
    // SAFETY: `wide` is NUL terminated and `interface` carries its own size.
    unsafe {
        SetupDiOpenDeviceInterfaceW(set, PCWSTR(wide.as_ptr()), 0, Some(&mut interface)).ok()?;
    }
    let mut size = 0u32;
    // SAFETY: a size query: no detail buffer is passed.
    let _ = unsafe {
        SetupDiGetDeviceInterfaceDetailW(set, &interface, None, 0, Some(&mut size), None)
    };
    if !(8..=65_536).contains(&size) {
        return None;
    }
    // u64 elements keep the variable-length structure aligned.
    let mut detail = vec![0u64; (size as usize).div_ceil(8)];
    let header = detail
        .as_mut_ptr()
        .cast::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>();
    // SAFETY: the buffer is aligned and at least `size` (>= 8) bytes long.
    unsafe {
        (*header).cbSize = size_of::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>() as u32;
    }
    let mut device = SP_DEVINFO_DATA {
        cbSize: size_of::<SP_DEVINFO_DATA>() as u32,
        ..Default::default()
    };
    // SAFETY: `header` points at `size` writable bytes and `device` carries its size.
    unsafe {
        SetupDiGetDeviceInterfaceDetailW(
            set,
            &interface,
            Some(header),
            size,
            None,
            Some(&mut device),
        )
        .ok()?;
    }
    let mut node = device.DevInst;
    for _ in 0..12 {
        let mut text = vec![0u16; 4096];
        // SAFETY: the binding passes the buffer together with its own length.
        if unsafe { CM_Get_Device_IDW(node, &mut text, 0) } != CR_SUCCESS {
            return None;
        }
        let id = from_wide(&text).to_lowercase();
        if is_usb_device_id(&id) {
            return Some(id);
        }
        let mut parent = 0u32;
        // SAFETY: `parent` is a live u32.
        if unsafe { CM_Get_Parent(&mut parent, node, 0) } != CR_SUCCESS {
            break;
        }
        node = parent;
    }
    None
}

/// A USB device node, not one interface (`&mi_`) of a composite device.
fn is_usb_device_id(id: &str) -> bool {
    id.starts_with("usb\\vid_") && !id.split('\\').nth(1).unwrap_or("").contains("&mi_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_whole_usb_device_is_a_parent() {
        assert!(is_usb_device_id("usb\\vid_046d&pid_c547\\abc"));
        assert!(!is_usb_device_id("usb\\vid_046d&pid_c547&mi_02\\abc"));
        assert!(!is_usb_device_id("hid\\vid_046d&pid_c547\\abc"));
    }
}
