//! GDI screen capture: the fallback when Desktop Duplication cannot open (virtual display
//! adapters, another application holding the output's duplication slot). BitBlt from the screen
//! DC reads the DWM-composed desktop, so ordinary windows and DirectX content come through;
//! hardware overlays and protected surfaces do not.

use windows::{
    core::Error,
    Win32::{
        Foundation::E_FAIL,
        Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
            GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            CAPTUREBLT, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ, SRCCOPY,
        },
    },
};

/// A screen rectangle in physical pixels: left, top, right, bottom.
pub(crate) type ScreenRect = (i32, i32, i32, i32);

/// The whole-screen DC, released on drop.
struct ScreenDc(HDC);
impl ScreenDc {
    fn new() -> windows::core::Result<Self> {
        // SAFETY: GetDC with a null window returns the DC of the whole screen; null means failure.
        let dc = unsafe { GetDC(None) };
        if dc.is_invalid() {
            return Err(Error::from_hresult(E_FAIL));
        }
        Ok(Self(dc))
    }
}
impl Drop for ScreenDc {
    fn drop(&mut self) {
        // SAFETY: this DC came from GetDC(null) in new() and is released exactly once here.
        unsafe { ReleaseDC(None, self.0); }
    }
}

/// A memory DC compatible with the screen, deleted on drop.
struct MemoryDc(HDC);
impl MemoryDc {
    fn new(screen: HDC) -> windows::core::Result<Self> {
        // SAFETY: screen is a live DC held by the caller; the new DC is compatible with it.
        let dc = unsafe { CreateCompatibleDC(Some(screen)) };
        if dc.is_invalid() {
            return Err(Error::from_hresult(E_FAIL));
        }
        Ok(Self(dc))
    }
}
impl Drop for MemoryDc {
    fn drop(&mut self) {
        // SAFETY: this DC came from CreateCompatibleDC in new() and is deleted exactly once here.
        unsafe { let _ = DeleteDC(self.0); }
    }
}

/// A bitmap compatible with the screen, deleted on drop.
struct CaptureBitmap(HBITMAP);
impl CaptureBitmap {
    fn new(screen: HDC, width: i32, height: i32) -> windows::core::Result<Self> {
        // SAFETY: screen is a live DC; the bitmap is created compatible with it at the given size.
        let bitmap = unsafe { CreateCompatibleBitmap(screen, width, height) };
        if bitmap.is_invalid() {
            return Err(Error::from_hresult(E_FAIL));
        }
        Ok(Self(bitmap))
    }
}
impl Drop for CaptureBitmap {
    fn drop(&mut self) {
        // SAFETY: this bitmap came from CreateCompatibleBitmap and is no longer selected in any
        // DC when dropped (the select guard below restores the previous object first).
        unsafe { let _ = DeleteObject(self.0.into()); }
    }
}

/// Restores the DC's previous object on drop, so the bitmap can be deleted safely.
struct SelectGuard {
    dc: HDC,
    previous: HGDIOBJ,
}
impl SelectGuard {
    /// Put the previous object back early; GetDIBits needs the bitmap unselected.
    fn restore(&self) {
        // SAFETY: dc is still live and previous is the object SelectObject returned in new().
        unsafe { SelectObject(self.dc, self.previous); }
    }
    fn new(dc: HDC, object: HGDIOBJ) -> Self {
        // SAFETY: dc is a live memory DC and object a live GDI object; the previous object is
        // kept and put back on drop.
        let previous = unsafe { SelectObject(dc, object) };
        Self { dc, previous }
    }
}
impl Drop for SelectGuard {
    fn drop(&mut self) {
        // SAFETY: dc is still live (owned by the caller's MemoryDc, dropped after this guard)
        // and previous is the object SelectObject returned in new().
        unsafe { SelectObject(self.dc, self.previous); }
    }
}

/// Reads a screen rectangle as rows of BGRA with no padding, the same layout Desktop Duplication
/// returns. The caller swaps the channels to RGBA when it needs to.
pub(crate) fn capture_region(region: ScreenRect) -> windows::core::Result<(u32, u32, Vec<u8>)> {
    let width = region.2 - region.0;
    let height = region.3 - region.1;
    if width <= 0 || height <= 0 {
        return Err(Error::from_hresult(E_FAIL));
    }
    let screen = ScreenDc::new()?;
    let memory = MemoryDc::new(screen.0)?;
    let bitmap = CaptureBitmap::new(screen.0, width, height)?;
    let _selected = SelectGuard::new(memory.0, bitmap.0.into());
    // SAFETY: the bitmap is selected in memory; BitBlt copies the screen rectangle into it.
    // CAPTUREBLT includes layered windows.
    unsafe {
        BitBlt(memory.0, 0, 0, width, height, Some(screen.0), region.0, region.1, SRCCOPY | CAPTUREBLT)
    }?;
    let mut info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            // Negative height asks for top-down rows, matching the duplication readback.
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut pixels = vec![0u8; width as usize * height as usize * 4];
    // GetDIBits refuses a bitmap that is still selected into a DC: put the old object back first.
    _selected.restore();
    // SAFETY: the bitmap holds width*height 32bpp pixels copied by BitBlt and is no longer
    // selected in any DC; pixels is sized for exactly those rows, and info describes the layout.
    let lines = unsafe {
        GetDIBits(memory.0, bitmap.0, 0, height as u32, Some(pixels.as_mut_ptr().cast()), &mut info, DIB_RGB_COLORS)
    };
    if lines != height {
        return Err(Error::from_hresult(E_FAIL));
    }
    Ok((width as u32, height as u32, pixels))
}

#[cfg(test)]
mod tests {
    /// Real GDI capture, needs a desktop session: `cargo test -- --ignored gdi_capture`
    #[test]
    #[ignore = "需要真实桌面会话"]
    fn gdi_reads_the_screen() {
        let (width, height, pixels) = super::capture_region((0, 0, 64, 48)).expect("GDI 抓屏应当成功");
        assert_eq!((width, height), (64, 48));
        assert_eq!(pixels.len(), 64 * 48 * 4);
        assert!(pixels.iter().any(|&byte| byte != 0), "屏幕不应全黑");
    }
}
