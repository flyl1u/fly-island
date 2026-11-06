//! The icon an executable shows in Explorer, as RGBA pixels, for labelling where an agent
//! session runs (Orca, Windows Terminal, VS Code, ...).

use std::{ffi::c_void, mem::size_of};

use windows::{
    core::PCWSTR,
    Win32::{
        Graphics::Gdi::{
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
        },
        UI::{
            Shell::ExtractIconExW,
            WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO},
        },
    },
};

/// An icon's pixels, rows top to bottom, 4 bytes (R, G, B, A) each.
pub(crate) struct IconPixels {
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) rgba: Vec<u8>,
}

/// Owns an icon handle and destroys it when dropped.
struct IconHandle(HICON);

impl Drop for IconHandle {
    fn drop(&mut self) {
        // SAFETY: the icon came from ExtractIconExW, is owned only by this value, and is
        // destroyed exactly once here.
        let _ = unsafe { DestroyIcon(self.0) };
    }
}

/// Owns a bitmap from GetIconInfo and deletes it when dropped.
struct BitmapHandle(HBITMAP);

impl Drop for BitmapHandle {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            // SAFETY: GetIconInfo hands the caller ownership of its bitmaps; each is
            // deleted exactly once here.
            let _ = unsafe { DeleteObject(HGDIOBJ(self.0 .0)) };
        }
    }
}

/// The large (32 px at 100% scaling) icon of the executable at `path`, or `None` when it has
/// none or it cannot be read.
pub(crate) fn exe_icon(path: &str) -> Option<IconPixels> {
    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let mut large = HICON::default();
    // SAFETY: `wide` is a NUL-terminated UTF-16 path that outlives the call, and `large`
    // is a valid place for one icon handle (nicons = 1).
    let count = unsafe { ExtractIconExW(PCWSTR(wide.as_ptr()), 0, Some(&mut large), None, 1) };
    if count == 0 || large.is_invalid() {
        return None;
    }
    icon_pixels(&IconHandle(large))
}

fn icon_pixels(icon: &IconHandle) -> Option<IconPixels> {
    let mut info = ICONINFO::default();
    // SAFETY: the icon handle is live and `info` is a valid ICONINFO to fill.
    unsafe { GetIconInfo(icon.0, &mut info) }.ok()?;
    let color = BitmapHandle(info.hbmColor);
    let mask = BitmapHandle(info.hbmMask);
    if color.0.is_invalid() {
        // A monochrome icon; agent hosts never use one.
        return None;
    }

    let mut bitmap = BITMAP::default();
    // SAFETY: `color.0` is a live bitmap and `bitmap` is a BITMAP of the size passed.
    let written = unsafe {
        GetObjectW(
            HGDIOBJ(color.0 .0),
            size_of::<BITMAP>() as i32,
            Some(&mut bitmap as *mut BITMAP as *mut c_void),
        )
    };
    let (width, height) = (u32::try_from(bitmap.bmWidth).ok()?, u32::try_from(bitmap.bmHeight).ok()?);
    if written == 0 || width == 0 || height == 0 || width > 256 || height > 256 {
        return None;
    }

    let mut colors = read_bgra(&color, width, height)?;
    // Old icons have no alpha channel; their transparency is in the mask instead.
    if colors.chunks_exact(4).all(|pixel| pixel[3] == 0) {
        let mask_pixels = read_bgra(&mask, width, height)?;
        for (pixel, masked) in colors.chunks_exact_mut(4).zip(mask_pixels.chunks_exact(4)) {
            pixel[3] = if masked[0] == 0 { 255 } else { 0 };
        }
    }
    for pixel in colors.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    Some(IconPixels { width, height, rgba: colors })
}

/// The pixels of `bitmap` as 32-bit BGRA, rows top to bottom.
fn read_bgra(bitmap: &BitmapHandle, width: u32, height: u32) -> Option<Vec<u8>> {
    if bitmap.0.is_invalid() {
        return None;
    }
    let mut pixels = vec![0u8; width as usize * height as usize * 4];
    let mut header = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width as i32,
            // Negative height: top-down rows.
            biHeight: -(height as i32),
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    // SAFETY: a memory DC compatible with the screen; deleted below.
    let dc = unsafe { CreateCompatibleDC(None) };
    if dc.is_invalid() {
        return None;
    }
    // SAFETY: `dc` is live, `bitmap.0` is a live bitmap not selected into any DC,
    // `pixels` holds `height` rows of `width` 32-bit pixels as `header` describes.
    let rows = unsafe {
        GetDIBits(
            dc,
            bitmap.0,
            0,
            height,
            Some(pixels.as_mut_ptr() as *mut c_void),
            &mut header,
            DIB_RGB_COLORS,
        )
    };
    // SAFETY: `dc` came from CreateCompatibleDC above and is deleted once.
    let _ = unsafe { DeleteDC(dc) };
    (rows == height as i32).then_some(pixels)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn executables_with_an_icon_give_square_pixels_and_missing_files_none() {
        let explorer = std::env::var("WINDIR").map(|dir| format!(r"{dir}\explorer.exe")).unwrap_or_default();
        let icon = exe_icon(&explorer).expect("explorer.exe has an icon");
        assert_eq!(icon.width, icon.height);
        assert_eq!(icon.rgba.len(), (icon.width * icon.height * 4) as usize);
        assert!(icon.rgba.chunks_exact(4).any(|pixel| pixel[3] > 0));
        assert!(exe_icon(r"C:\does\not\exist.exe").is_none());
    }
}
