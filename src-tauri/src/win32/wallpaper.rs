//! The desktop wallpaper as Windows lays it out (IDesktopWallpaper): the image on each
//! monitor, how it is fitted, and the background colour around it. Read only; the glass
//! material blurs it under the island (island/backdrop.rs).

use windows::{
    core::PWSTR,
    Win32::{
        Foundation::RECT,
        System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL},
        UI::Shell::{DesktopWallpaper, IDesktopWallpaper, DESKTOP_WALLPAPER_POSITION},
    },
};

use super::com::ComApartment;

/// How the image fills a monitor, as Settings → Personalization names it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub(crate) enum WallpaperFit {
    Center,
    Tile,
    Stretch,
    Fit,
    Fill,
    Span,
}

/// One monitor's wallpaper. `path` is empty for a solid colour or a slideshow Windows
/// could not name; the background colour then shows alone.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct MonitorWallpaper {
    /// Physical screen pixels: left, top, right, bottom.
    pub(crate) rect: (i32, i32, i32, i32),
    pub(crate) path: String,
}

#[derive(Clone, Debug)]
pub(crate) struct DesktopLayout {
    pub(crate) monitors: Vec<MonitorWallpaper>,
    pub(crate) fit: WallpaperFit,
    pub(crate) background: (u8, u8, u8),
}

struct TaskMemString(PWSTR);

impl TaskMemString {
    fn take(self) -> String {
        if self.0.is_null() {
            return String::new();
        }
        // SAFETY: a non-null PWSTR from IDesktopWallpaper is a NUL-terminated UTF-16
        // buffer that stays valid until Drop frees it.
        unsafe { self.0.to_string() }.unwrap_or_default()
    }
}

impl Drop for TaskMemString {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // SAFETY: allocated by the shell with CoTaskMemAlloc and freed exactly once.
            unsafe { CoTaskMemFree(Some(self.0.0.cast())) };
        }
    }
}

fn fit_from(position: DESKTOP_WALLPAPER_POSITION) -> WallpaperFit {
    // DWPOS_CENTER 0, TILE 1, STRETCH 2, FIT 3, FILL 4, SPAN 5.
    match position.0 {
        0 => WallpaperFit::Center,
        1 => WallpaperFit::Tile,
        2 => WallpaperFit::Stretch,
        3 => WallpaperFit::Fit,
        5 => WallpaperFit::Span,
        _ => WallpaperFit::Fill,
    }
}

/// Every monitor's wallpaper. Runs on the calling thread in its own COM apartment.
pub(crate) fn desktop_layout() -> Result<DesktopLayout, String> {
    desktop_layout_inner().map_err(|error| format!("无法读取桌面壁纸：{error}"))
}

fn desktop_layout_inner() -> windows::core::Result<DesktopLayout> {
    let _com = ComApartment::multithreaded()?;
    // SAFETY: COM is initialized on this thread for the lifetime of `_com`, which
    // outlives the interface (dropped at the end of this function, before `_com`).
    let wallpaper: IDesktopWallpaper = unsafe { CoCreateInstance(&DesktopWallpaper, None, CLSCTX_ALL) }?;
    // SAFETY: plain getters on a live interface; returned strings are owned by
    // TaskMemString and freed once.
    let (count, position, color) = unsafe {
        (
            wallpaper.GetMonitorDevicePathCount()?,
            wallpaper.GetPosition().unwrap_or(DESKTOP_WALLPAPER_POSITION(4)),
            wallpaper.GetBackgroundColor().map(|color| color.0).unwrap_or(0),
        )
    };
    let mut monitors = Vec::new();
    for index in 0..count {
        // SAFETY: index < count; the device path buffer is freed by TaskMemString.
        let Ok(id) = (unsafe { wallpaper.GetMonitorDevicePathAt(index) }) else { continue };
        let id = TaskMemString(id);
        // SAFETY: id.0 is the NUL-terminated device path just returned, alive until `id` drops.
        let rect: RECT = match unsafe { wallpaper.GetMonitorRECT(id.0) } {
            Ok(rect) => rect,
            // A device path for a monitor that is not attached.
            Err(_) => continue,
        };
        // SAFETY: as above; the image path buffer is owned by TaskMemString.
        let path = unsafe { wallpaper.GetWallpaper(id.0) }.map(|path| TaskMemString(path).take()).unwrap_or_default();
        monitors.push(MonitorWallpaper { rect: (rect.left, rect.top, rect.right, rect.bottom), path });
    }
    // COLORREF is 0x00BBGGRR.
    let background = ((color & 0xFF) as u8, ((color >> 8) & 0xFF) as u8, ((color >> 16) & 0xFF) as u8);
    Ok(DesktopLayout { monitors, fit: fit_from(position), background })
}
