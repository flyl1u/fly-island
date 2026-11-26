//! 截图覆盖层窗口：按下快捷键时铺满光标所在显示器。
//!
//! 窗口启动时就建好（隐藏），按快捷键只是定位 + 通知前端，避免首次创建窗口的延迟。
//! 前端抓到干净底图并画好遮罩之后才显示，避免下一轮把自己抓进底图。

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// 窗口 label，同时也是 `?window=` 参数值（对外契约，不要改）。
pub(crate) const WINDOW_LABEL: &str = "screenshot";

/// 通知前端"该抓底图了"的事件名。
pub const ARM_EVENT: &str = "screenshot-arm";

/// 一次截图会话是否正在进行（含"按了热键、还在抓底图、窗口尚未显示"的窗口期）。
/// 重复按热键时忽略，否则会重新抓屏、把用户已经框好的区域和标注清空。
static SESSION: super::session::CaptureSession = super::session::CaptureSession::new();
static RESTORE_MAIN: AtomicBool = AtomicBool::new(false);

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
        .focused(false)
        .visible(false)
        .build()
        .map_err(|error| format!("无法创建截图窗口：{error}"))?;
    exclude_overlay(&window);
    Ok(window)
}

fn exclude_overlay(window: &WebviewWindow) {
    if let Ok(handle) = window.hwnd() {
        // Hidden capture remains the fallback on systems without this DWM attribute.
        crate::win32::desktop_duplication::exclude_from_capture(handle, true);
    }
}

/// Fullscreen transitions can restore a saved visible placement. Hide on the UI thread,
/// then wait for DWM before opening a new duplication session or releasing the hotkey guard.
pub(crate) async fn hide_and_settle(window: WebviewWindow) -> Result<(), String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    let overlay = window.clone();
    window.run_on_main_thread(move || {
        exclude_overlay(&overlay);
        let _ = sender.send(overlay.hide().map_err(|error| error.to_string()));
    }).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(std::time::Duration::from_secs(2))
            .map_err(|error| format!("等待截图窗口隐藏失败：{error}"))??;
        crate::win32::desktop_duplication::wait_for_compositor();
        Ok(())
    }).await.map_err(|error| error.to_string())?
}

/// 启动时先把窗口建好并藏起来，第一次按快捷键就不用再建了。
pub(crate) fn precreate(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(WINDOW_LABEL).is_none() {
        build(app)?;
    }
    Ok(())
}

/// 打开（或重新定位）覆盖层。已经在截图时重复按键直接忽略。
pub(crate) fn show_overlay(app: &AppHandle) -> Result<(), String> {
    // swap 原子地「读取并置位」：第一次拿到 false 继续，重复按键拿到 true 直接返回。
    if !SESSION.open() {
        return Ok(());
    }
    // 任一步失败都要复位，否则用户卡在「再也按不出截图」的状态。
    if let Err(error) = show_overlay_inner(app) {
        SESSION.cancel();
        return Err(error);
    }
    Ok(())
}

fn show_overlay_inner(app: &AppHandle) -> Result<(), String> {
    let window = match app.get_webview_window(WINDOW_LABEL) {
        Some(window) => window,
        None => build(app)?,
    };
    window.hide().map_err(|error| error.to_string())?;
    position_on_cursor_monitor(app, &window)?;
    window.hide().map_err(|error| error.to_string())?;
    window.emit(ARM_EVENT, ()).map_err(|error| format!("无法通知截图窗口：{error}"))?;
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
pub async fn screenshot_close(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    screenshot_dismiss(app, window).await
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
    // Re-entering fullscreen restores a saved placement and can briefly show an unpainted
    // WebView. Most captures stay on the same monitor and need no native transition at all.
    if window.is_fullscreen().unwrap_or(false)
        && window.inner_position().ok().as_ref() == Some(position)
        && window.inner_size().ok().as_ref() == Some(size) {
        return Ok(());
    }
    // Leave the previous monitor's fullscreen geometry before moving the hidden overlay.
    window.set_fullscreen(false).map_err(|error| error.to_string())?;
    window
        .set_position(tauri::PhysicalPosition::new(position.x, position.y))
        .map_err(|error| error.to_string())?;
    window
        .set_size(tauri::PhysicalSize::new(size.width, size.height))
        .map_err(|error| error.to_string())?;
    // Borderless fullscreen removes Windows' non-client top inset and includes the taskbar area.
    window.set_fullscreen(true).map_err(|error| error.to_string())?;
    Ok(())
}

/// 显示覆盖层并强制抢到前台。必须"先 show 再抢"，否则对隐藏窗口无效。
#[tauri::command]
pub async fn screenshot_activate(window: WebviewWindow) -> Result<(), String> {
    // HWND focus on a pool thread is ineffective. Focus the Tauri WebView controller
    // on its own UI thread, and confirm its document received focus before returning.
    for _ in 0..8 {
        let overlay = window.clone();
        let (sender, receiver) = std::sync::mpsc::channel();
        window.run_on_main_thread(move || {
            if !SESSION.active() { let _ = sender.send(false); return; }
            if let Some(main) = overlay.app_handle().get_webview_window("main") {
                if main.is_visible().unwrap_or(false) { RESTORE_MAIN.store(true, Ordering::Release); let _ = main.hide(); }
            }
            let _ = overlay.show();
            let _ = overlay.set_always_on_top(true);
            // The app's focus helper avoids tao's synthetic Alt-up fallback, which
            // can interrupt a quickly repeated Alt+A gesture while Alt is still held.
            let _ = crate::system::window_focus::focus_window(&overlay);
            let view: &tauri::Webview = overlay.as_ref();
            let _ = view.set_focus();
            let _ = overlay.eval("window.focus(); if (!document.activeElement || document.activeElement === document.body) document.querySelector('.screenshot-overlay')?.focus({preventScroll:true});");
            let focused = overlay.hwnd().is_ok_and(|handle| crate::win32::window::foreground_window() == handle);
            let _ = sender.send(focused);
        }).map_err(|error| error.to_string())?;
        let focused = tauri::async_runtime::spawn_blocking(move || {
            let focused = receiver.recv_timeout(std::time::Duration::from_secs(2)).unwrap_or(false);
            std::thread::sleep(std::time::Duration::from_millis(20));
            focused
        }).await.map_err(|error| error.to_string())?;
        if focused || !SESSION.active() { return Ok(()); }
    }
    SESSION.cancel();
    Err("无法激活截图窗口，请重新触发截图。".into())
}

/// 收起覆盖层并恢复小岛本体。
#[tauri::command]
pub async fn screenshot_dismiss(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if !SESSION.begin_close() { return Ok(()); }
    if let Err(error) = hide_and_settle(window.clone()).await { SESSION.cancel(); return Err(error); }
    let restore = app.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    let dispatched = window.run_on_main_thread(move || {
        if RESTORE_MAIN.swap(false, Ordering::AcqRel) {
            if let Some(main) = restore.get_webview_window("main") { let _ = main.show(); }
        }
        let _ = sender.send(());
    });
    if let Err(error) = dispatched { SESSION.cancel(); return Err(error.to_string()); }
    let restored = tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(std::time::Duration::from_secs(2))).await;
    if !matches!(restored, Ok(Ok(()))) { SESSION.cancel(); return Err("恢复截图窗口状态失败，请重试。".into()); }
    if SESSION.finish_close() {
        if let Err(error) = show_overlay_inner(&app) { SESSION.cancel(); return Err(error); }
    }
    Ok(())
}

#[cfg(test)]
#[path = "native_tests.rs"]
mod native_tests;

#[cfg(test)]
#[path = "focus_tests.rs"]
mod focus_tests;
