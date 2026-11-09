//! Icons as RGBA pixels: the icon an executable shows in Explorer, for labelling where an
//! agent session runs (Orca, Windows Terminal, VS Code, ...), and the shell icon of a file or
//! file type, for the file shelf.

use std::{ffi::c_void, mem::size_of};

use windows::{
    core::PCWSTR,
    Win32::{
        Graphics::Gdi::{
            CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
            BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
        },
        Storage::FileSystem::{FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_NORMAL},
        UI::{
            Controls::{IImageList, ILD_TRANSPARENT},
            Shell::{
                ExtractIconExW, SHGetFileInfoW, SHGetImageList, SHFILEINFOW, SHGFI_SYSICONINDEX,
                SHGFI_USEFILEATTRIBUTES, SHIL_EXTRALARGE,
            },
            WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO},
        },
    },
};

use super::com::ComApartment;

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

/// Where [`shell_icon`] takes an icon from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ShellIconSource {
    /// The file or folder itself: its own icon (an executable's, a shortcut's target's).
    /// Reads the disk.
    Item,
    /// Only the name's file type, as if a file of that name existed. Never touches the disk.
    FileType,
    /// The plain folder icon. Never touches the disk.
    Folder,
}

/// The extra-large (48 px at 100% scaling) Explorer icon for `path`, or `None` when the shell
/// has none for it.
pub(crate) fn shell_icon(path: &str, source: ShellIconSource) -> Option<IconPixels> {
    // The shell's image lists want COM; a thread that already has it keeps its own.
    let _com = ComApartment::multithreaded().ok();
    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let (attributes, flags) = match source {
        ShellIconSource::Item => (FILE_ATTRIBUTE_NORMAL, SHGFI_SYSICONINDEX),
        ShellIconSource::FileType => (FILE_ATTRIBUTE_NORMAL, SHGFI_SYSICONINDEX | SHGFI_USEFILEATTRIBUTES),
        ShellIconSource::Folder => (FILE_ATTRIBUTE_DIRECTORY, SHGFI_SYSICONINDEX | SHGFI_USEFILEATTRIBUTES),
    };
    let mut info = SHFILEINFOW::default();
    // SAFETY: `wide` is a NUL-terminated UTF-16 path that outlives the call; `info` is a
    // valid SHFILEINFOW of the size passed. SHGFI_SYSICONINDEX returns no icon handle to free.
    let found = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            attributes,
            Some(&mut info),
            size_of::<SHFILEINFOW>() as u32,
            flags,
        )
    };
    if found == 0 {
        return None;
    }
    // SAFETY: SHGetImageList takes no pointers here and returns an owned interface.
    let list: IImageList = unsafe { SHGetImageList(SHIL_EXTRALARGE as i32) }.ok()?;
    // SAFETY: `list` is a live image list and `info.iIcon` an index the shell just gave for it;
    // the returned icon is owned by the caller and destroyed by IconHandle.
    let icon = unsafe { list.GetIcon(info.iIcon, ILD_TRANSPARENT.0) }.ok()?;
    if icon.is_invalid() {
        return None;
    }
    icon_pixels(&IconHandle(icon))
}

fn icon_pixels(icon: &IconHandle) -> Option<IconPixels> {
    let mut info = ICONINFO::default();
    // SAFETY: the icon handle is live and `info` is a valid ICONINFO to fill.
    unsafe { GetIconInfo(icon.0, &mut info) }.ok()?;
    let color = BitmapHandle(info.hbmColor);
    let mask = BitmapHandle(info.hbmMask);
    if color.0.is_invalid() {
        // A monochrome icon; agent hosts and file types do not use one.
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
    if colors.as_chunks::<4>().0.iter().all(|pixel| pixel[3] == 0) {
        let mask_pixels = read_bgra(&mask, width, height)?;
        for (pixel, masked) in colors.as_chunks_mut::<4>().0.iter_mut().zip(mask_pixels.as_chunks::<4>().0) {
            pixel[3] = if masked[0] == 0 { 255 } else { 0 };
        }
    }
    for pixel in colors.as_chunks_mut::<4>().0 {
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
        assert!(icon.rgba.as_chunks::<4>().0.iter().any(|pixel| pixel[3] > 0));
        assert!(exe_icon(r"C:\does\not\exist.exe").is_none());
    }

    #[test]
    fn file_types_and_folders_have_shell_icons_without_the_file_existing() {
        for (path, source) in [
            (r"C:\does\not\exist\report.txt", ShellIconSource::FileType),
            (r"C:\does\not\exist\folder", ShellIconSource::Folder),
        ] {
            let icon = shell_icon(path, source).expect("the shell has an icon for the type");
            assert_eq!(icon.width, icon.height);
            assert!(icon.rgba.as_chunks::<4>().0.iter().any(|pixel| pixel[3] > 0));
        }
        let explorer = std::env::var("WINDIR").map(|dir| format!(r"{dir}\explorer.exe")).unwrap_or_default();
        assert!(shell_icon(&explorer, ShellIconSource::Item).is_some());
    }
}
