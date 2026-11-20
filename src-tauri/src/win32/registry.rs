//! Registry reads through the Win32 API.
//!
//! Also compiled into `examples/wechat_reminder_probe.rs` through `#[path]`, so it
//! must not depend on anything else in the crate.

use windows::{
    core::HSTRING,
    Win32::{
        Foundation::ERROR_FILE_NOT_FOUND,
        System::Registry::{
            RegDeleteKeyValueW, RegGetValueW, RegSetKeyValueW, HKEY, REG_SZ, RRF_RT_REG_BINARY,
            RRF_RT_REG_SZ,
        },
    },
};

/// UTF-16 units read per value, including the terminating NUL. Longer values
/// fail with `ERROR_MORE_DATA` and are reported as missing.
const MAX_STRING_UNITS: usize = 2048;
/// StartupApproved values are short binary blobs; keep malformed or unexpectedly large values
/// out of the caller instead of allocating based on registry data.
const MAX_BINARY_BYTES: usize = 64;

/// Reads a `REG_SZ` value under `root\subkey`. Returns `None` when the key or
/// value does not exist, is not a string, or does not fit in the buffer.
pub(crate) fn read_string(root: HKEY, subkey: &str, value: &str) -> Option<String> {
    let subkey = HSTRING::from(subkey);
    let value = HSTRING::from(value);
    let mut data = [0u16; MAX_STRING_UNITS];
    let mut bytes = (data.len() * 2) as u32;
    // SAFETY: `subkey` and `value` are NUL-terminated wide strings that outlive the
    // call. `data` is a writable buffer of exactly `bytes` bytes, and `bytes` is a
    // valid in/out pointer; RegGetValueW writes at most that many bytes.
    let result = unsafe {
        RegGetValueW(
            root,
            &subkey,
            &value,
            RRF_RT_REG_SZ,
            None,
            Some(data.as_mut_ptr().cast()),
            Some(&mut bytes),
        )
    };
    if result.is_err() {
        return None;
    }
    let length = data
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(data.len());
    Some(String::from_utf16_lossy(&data[..length]))
}

/// Reads a `REG_BINARY` value under `root\\subkey`. Returns `None` when the key or value does
/// not exist, is not binary, or does not fit in the bounded buffer.
pub(crate) fn read_binary(root: HKEY, subkey: &str, value: &str) -> Option<Vec<u8>> {
    let subkey = HSTRING::from(subkey);
    let value = HSTRING::from(value);
    let mut data = [0u8; MAX_BINARY_BYTES];
    let mut bytes = data.len() as u32;
    // SAFETY: `subkey` and `value` are NUL-terminated wide strings that outlive the call.
    // `data` is a writable buffer of exactly `bytes` bytes, and `bytes` is a valid in/out
    // pointer; RegGetValueW writes at most that many bytes.
    let result = unsafe {
        RegGetValueW(
            root,
            &subkey,
            &value,
            RRF_RT_REG_BINARY,
            None,
            Some(data.as_mut_ptr().cast()),
            Some(&mut bytes),
        )
    };
    if result.is_err() || bytes as usize > data.len() {
        return None;
    }
    Some(data[..bytes as usize].to_vec())
}

/// Writes `data` as the `REG_SZ` value `value` under `root\subkey`, creating the key if needed.
pub(crate) fn write_string(root: HKEY, subkey: &str, value: &str, data: &str) -> windows::core::Result<()> {
    let subkey = HSTRING::from(subkey);
    let value = HSTRING::from(value);
    let wide: Vec<u16> = data.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes = u32::try_from(wide.len() * 2).map_err(|_| windows::core::Error::from(windows::Win32::Foundation::E_INVALIDARG))?;
    // SAFETY: `subkey` and `value` are NUL-terminated wide strings that outlive the call, and
    // `wide` is a NUL-terminated buffer of exactly `bytes` bytes that RegSetKeyValueW only reads.
    unsafe { RegSetKeyValueW(root, &subkey, &value, REG_SZ.0, Some(wide.as_ptr().cast()), bytes) }.ok()
}

/// Deletes the value `value` under `root\subkey`; a value or key that is already gone is fine.
pub(crate) fn delete_value(root: HKEY, subkey: &str, value: &str) -> windows::core::Result<()> {
    let subkey = HSTRING::from(subkey);
    let value = HSTRING::from(value);
    // SAFETY: `subkey` and `value` are NUL-terminated wide strings that outlive the call.
    let result = unsafe { RegDeleteKeyValueW(root, &subkey, &value) };
    if result == ERROR_FILE_NOT_FOUND {
        return Ok(());
    }
    result.ok()
}

/// The executable in an uninstall entry's `DisplayIcon` value, which may be quoted and end
/// with an icon index: `"C:\App\App.exe",0` → `C:\App\App.exe`.
pub(crate) fn display_icon_path(icon: &str) -> &str {
    icon.rsplit_once(',')
        .filter(|(_, index)| index.trim().parse::<i32>().is_ok())
        .map_or(icon, |(path, _)| path)
        .trim()
        .trim_matches('"')
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

    const CURRENT_VERSION: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";

    #[test]
    fn reads_a_string_value_present_on_every_windows_install() {
        let name = read_string(HKEY_LOCAL_MACHINE, CURRENT_VERSION, "ProductName");
        assert!(name.is_some_and(|name| !name.trim().is_empty()));
    }

    #[test]
    fn missing_keys_and_values_read_as_none() {
        let missing_key = r"Software\FocuSD\NoSuchKey";
        assert_eq!(read_string(HKEY_CURRENT_USER, missing_key, "Value"), None);
        assert_eq!(
            read_string(HKEY_LOCAL_MACHINE, CURRENT_VERSION, "NoSuchValue"),
            None
        );
    }

    #[test]
    fn display_icons_give_the_executable_path() {
        assert_eq!(display_icon_path(r#""D:\Apps\Weixin\Weixin.exe",0"#), r"D:\Apps\Weixin\Weixin.exe");
        assert_eq!(display_icon_path(r"D:\Apps\QQ\QQ.exe, -1"), r"D:\Apps\QQ\QQ.exe");
        assert_eq!(display_icon_path(r"D:\Apps,Tools\QQ.exe"), r"D:\Apps,Tools\QQ.exe");
    }
}
