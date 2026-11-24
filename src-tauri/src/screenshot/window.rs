//! 截图覆盖层窗口：按下快捷键时铺满光标所在显示器。
//!
//! 窗口启动时就建好（隐藏），按快捷键只是定位 + 通知前端，避免首次创建窗口的延迟。
//! 显示由前端负责：先 show 出遮罩，再把刚抓到的画面贴上去，所以"按下即有反馈"。

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// 窗口 label，同时也是 `?window=` 参数值（对外契约，不要改）。
pub(crate) const WINDOW_LABEL: &str = "screenshot";

/// 通知前端"该抓底图了"的事件名。
pub const ARM_EVENT: &str = "screenshot-arm";

fn build(app: &AppHandle) -> Result<WebviewWindow, String> {
    // 注意：URL 里只能有 window=screenshot 这一个查询参数。
    // 额外参数会让资产解析丢掉查询串，页面就会退化成小岛、收不到快捷键事件。
    let window = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::App("index.html?window=screenshot".into()))
        .decorations(false)
        // 不透明：整屏画面由页面自己画，透明窗口会让 WebView2 不合成、不接收点击。
        .transparent(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(true)
        .visible(false)
        .build()
        .map_err(|error| format!("无法创建截图窗口：{error}"))?;
    Ok(window)
}

/// 启动时先把窗口建好并藏起来，第一次按快捷键就不用再建了。
pub(crate) fn precreate(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(WINDOW_LABEL).is_none() {
        build(app)?;
    }
    Ok(())
}

/// 打开（或重新定位）覆盖层。
pub(crate) fn show_overlay(app: &AppHandle) -> Result<(), String> {
    let window = match app.get_webview_window(WINDOW_LABEL) {
        Some(window) => window,
        None => build(app)?,
    };
    position_on_cursor_monitor(app, &window)?;
    window.emit(ARM_EVENT, ()).map_err(|error| format!("无法通知截图窗口：{error}"))?;
    // 前端 show 之后仍可能抢不到前台，这里再强推一次，避免"要点击一下才出画面"。
    if let Ok(handle) = window.hwnd() {
        crate::win32::foreground::bring_to_front(handle);
    }
    Ok(())
}

/// 覆盖层窗口在屏幕上的物理矩形，前端据此抓一张全屏底图。
#[tauri::command]
pub fn screenshot_window_rect(window: WebviewWindow) -> Result<(i32, i32, u32, u32), String> {
    let position = window.inner_position().map_err(|error| error.to_string())?;
    let size = window.inner_size().map_err(|error| error.to_string())?;
    Ok((position.x, position.y, size.width, size.height))
}

/// 抓完 / 取消后收起覆盖层。
#[tauri::command]
pub fn screenshot_close() -> Result<(), String> {
    Ok(())
}

/// 把窗口铺到光标所在的显示器上（多屏时不要铺到主屏）。
fn position_on_cursor_monitor(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let cursor = window.cursor_position().ok();
    let monitor = cursor
        .and_then(|point| app.monitor_from_point(point.x, point.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or_else(|| "找不到可用的显示器".to_string())?;

    let position = monitor.position();
    let size = monitor.size();
    window
        .set_position(tauri::PhysicalPosition::new(position.x, position.y))
        .map_err(|error| error.to_string())?;
    window
        .set_size(tauri::PhysicalSize::new(size.width, size.height))
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// 显示覆盖层并强制抢到前台。必须"先 show 再抢"，否则对隐藏窗口无效。
#[tauri::command]
pub fn screenshot_activate(window: WebviewWindow) -> Result<(), String> {
    window.show().map_err(|error| error.to_string())?;
    // 小岛本体也是置顶窗口，会压住覆盖层吃掉鼠标：截图期间先藏起来，关闭时恢复。
    if let Some(main) = window.app_handle().get_webview_window("main") {
        let _ = main.hide();
    }
    // 小岛主窗口也是置顶的，会压住覆盖层吃掉点击：重新置顶把自己提到它上面。
    let _ = window.set_always_on_top(false);
    let _ = window.set_always_on_top(true);
    let Ok(handle) = window.hwnd() else {
        return Ok(());
    };
    // 反复抢：一次常常被前台锁挡回去，抢到为止（最多 ~150ms）。
    let mut foreground = false;
    for _ in 0..8 {
        let _ = window.set_focus();
    if let Ok(handle) = window.hwnd() {
        crate::win32::foreground::focus_webview(handle);
    }
        crate::win32::foreground::bring_to_front(handle);
        std::thread::sleep(std::time::Duration::from_millis(20));
        if crate::win32::foreground::is_foreground(handle) {
            foreground = true;
            break;
        }
    }
    trace(&format!("activate: foreground={foreground}"));
    Ok(())
}

fn trace(line: &str) {
    use std::io::Write as _;
    let path = std::env::temp_dir().join("screenshot-trace.log");
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}
/// 收起覆盖层并恢复小岛本体。
#[tauri::command]
pub fn screenshot_dismiss(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let _ = window.hide();
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
    }
    Ok(())
}