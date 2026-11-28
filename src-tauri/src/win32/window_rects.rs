//! 枚举可见的顶层窗口矩形，供截图时"鼠标停在窗口上自动吸附"使用。
//!
//! 用 DWM 的扩展边框（`DWMWA_EXTENDED_FRAME_BOUNDS`），否则 `GetWindowRect`
//! 会把不可见的阴影边距也算进去，吸附出来的框会比窗口大一圈。

use windows::Win32::{
    Foundation::{HWND, RECT},
    Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS},
};

/// 一个候选吸附区域，屏幕物理像素。
#[derive(Clone, Copy)]
pub(crate) struct WindowRect {
    pub(crate) left: i32,
    pub(crate) top: i32,
    pub(crate) right: i32,
    pub(crate) bottom: i32,
}

/// 按 z 序（最上层在前）返回可见窗口的矩形；太小或不可见的会被丢掉。
pub(crate) fn visible_window_rects(exclude: Option<HWND>) -> Vec<WindowRect> {
    let mut found = Vec::new();
    let _ = crate::win32::window::for_each_top_level_window(|window| {
        if Some(window) == exclude || !crate::win32::window::is_visible(window) || crate::win32::window::is_minimized(window) {
            return;
        }
        // 工具窗口（托盘弹出菜单等）不参与吸附。
        let (style, ex_style) = crate::win32::window::styles(window);
        const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
        if ex_style & WS_EX_TOOLWINDOW != 0 {
            return;
        }
        let _ = style;
        if let Some(rect) = frame_rect(window) {
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            // 16px 以下的多半是分隔条、隐藏宿主之类。
            if width >= 16 && height >= 16 {
                found.push(rect);
            }
        }
    });
    found
}

fn frame_rect(window: HWND) -> Option<WindowRect> {
    let mut rect = RECT::default();
    // SAFETY: 传入的 RECT 是栈上有效内存，长度与类型匹配。
    let result = unsafe {
        DwmGetWindowAttribute(
            window,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut _ as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
    };
    if result.is_ok() && rect.right > rect.left && rect.bottom > rect.top {
        return Some(WindowRect { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    }
    crate::win32::window::normal_position(window).map(|rect| WindowRect {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
    })
}
