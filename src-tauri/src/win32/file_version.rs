use std::{ffi::c_void, path::Path};
use windows::{core::{w, PCWSTR}, Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW, VS_FIXEDFILEINFO}};

pub(crate) fn read(path: &Path) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: 路径以零结尾，缓冲区在调用期间有效。
    let size = unsafe { GetFileVersionInfoSizeW(PCWSTR(wide.as_ptr()), None) };
    if size == 0 { return None; }
    let mut data = vec![0u8; size as usize];
    // SAFETY: 缓冲区长度来自版本 API，路径与写入地址有效。
    unsafe { GetFileVersionInfoW(PCWSTR(wide.as_ptr()), None, size, data.as_mut_ptr().cast()) }.ok()?;
    let mut value: *mut c_void = std::ptr::null_mut();
    let mut length = 0;
    // SAFETY: data 是完整版本块，输出指针及长度均有效。
    if !unsafe { VerQueryValueW(data.as_ptr().cast(), w!("\\"), &mut value, &mut length) }.as_bool()
        || value.is_null() || length < std::mem::size_of::<VS_FIXEDFILEINFO>() as u32 { return None; }
    // SAFETY: 上一步确认了返回区域大小，使用非对齐读取避免字节缓冲区的对齐要求。
    let info = unsafe { std::ptr::read_unaligned(value.cast::<VS_FIXEDFILEINFO>()) };
    if info.dwSignature != 0xfeef04bd { return None; }
    Some(format!("{}.{}.{}.{}", info.dwFileVersionMS >> 16, info.dwFileVersionMS & 0xffff, info.dwFileVersionLS >> 16, info.dwFileVersionLS & 0xffff))
}
