//! 截图类插件（截图标注 / 长截图 / 录屏）共用的原生能力。
//!
//! 三个插件是三次独立的 PR，但抓屏、裁切、OCR 这些底子是同一套，放在这里共享；
//! 每个插件只加自己的命令与界面。

mod capture;
mod ocr;
mod ocr_engine;
pub(crate) mod hotkey;
pub(crate) mod window;

use tauri::ipc::Response;

/// 启动截图快捷键（默认 Alt+A，设置里可改），预热抓屏设备并预建覆盖层窗口。
pub(crate) fn init(app: &tauri::AppHandle) {
    capture::warm_up();
    if let Err(error) = window::precreate(app) {
        eprintln!("failed to precreate the screenshot window: {error}");
    }
    hotkey::init(app);
}

/// 打开截图覆盖层；设置页的「立即截图」按钮也走这里。
#[tauri::command]
pub fn screenshot_open(app: tauri::AppHandle) -> Result<(), String> {
    window::show_overlay(&app)
}

/// 抓取屏幕上的一个矩形，返回 PNG 字节。
///
/// 走 `ipc::Response` 而不是返回 `Vec<u8>`：后者会被序列化成 JSON 数字数组，
/// 一张 4K 截图能膨胀到几十 MB；这里直接回二进制。
#[tauri::command]
pub async fn screenshot_capture(x: i32, y: i32, width: i32, height: i32) -> Result<Response, String> {
    if width <= 0 || height <= 0 {
        return Err("选区宽高必须大于 0".into());
    }
    let region = (x, y, x + width, y + height);
    let png = tauri::async_runtime::spawn_blocking(move || capture::capture_png(region))
        .await
        .map_err(|error| format!("抓屏任务失败：{error}"))??;
    Ok(Response::new(png))
}

/// 抓取一个矩形并直接放进剪贴板（不经过前端，避免大图来回传）。
#[tauri::command]
pub async fn screenshot_copy(x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    if width <= 0 || height <= 0 {
        return Err("选区宽高必须大于 0".into());
    }
    let region = (x, y, x + width, y + height);
    tauri::async_runtime::spawn_blocking(move || capture::copy_region_to_clipboard(region))
        .await
        .map_err(|error| format!("复制任务失败：{error}"))?
}

/// 把标注合成后的 PNG（base64）放进剪贴板。
#[tauri::command]
pub async fn screenshot_copy_png(png_base64: String) -> Result<(), String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|error| format!("图片数据无法解码：{error}"))?;
    tauri::async_runtime::spawn_blocking(move || capture::copy_png_to_clipboard(&bytes))
        .await
        .map_err(|error| format!("复制任务失败：{error}"))?
}

/// 把标注合成后的 PNG（base64）保存到「图片\fly-island」，返回保存路径。
#[tauri::command]
pub async fn screenshot_save_png(png_base64: String) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|error| format!("图片数据无法解码：{error}"))?;
    tauri::async_runtime::spawn_blocking(move || capture::save_png(&bytes))
        .await
        .map_err(|error| format!("保存任务失败：{error}"))?
        .map(|path| path.to_string_lossy().into_owned())
}

/// 抓取一个矩形，返回原始 RGBA：`[宽 u32 LE][高 u32 LE][像素...]`。
///
/// 前端拿 `ImageData` 直接贴图，省掉 PNG 解码（4K 图能省 100ms 以上）。
#[tauri::command]
pub async fn screenshot_raw(x: i32, y: i32, width: i32, height: i32) -> Result<Response, String> {
    if width <= 0 || height <= 0 {
        return Err("选区宽高必须大于 0".into());
    }
    let region = (x, y, x + width, y + height);
    let (pixels_wide, pixels_high, rgba) = tauri::async_runtime::spawn_blocking(move || capture::capture_rgba(region))
        .await
        .map_err(|error| format!("抓屏任务失败：{error}"))??;
    let mut payload = Vec::with_capacity(8 + rgba.len());
    payload.extend_from_slice(&pixels_wide.to_le_bytes());
    payload.extend_from_slice(&pixels_high.to_le_bytes());
    payload.extend_from_slice(&rgba);
    Ok(Response::new(payload))
}


/// 识别 PNG 里的文字（系统自带 OCR，离线）。
#[tauri::command]
pub async fn screenshot_ocr(app: tauri::AppHandle, png_base64: String) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|error| format!("图片数据无法解码：{error}"))?;
    let dir = resolve_engine_dir(&app);
    tauri::async_runtime::spawn_blocking(move || match dir {
        Some(dir) => ocr_engine::recognize_text(&bytes, &dir),
        None => ocr::recognize(&bytes),
    })
    .await
    .map_err(|error| format!("识别任务失败：{error}"))?
}

/// 当前可见窗口的矩形（屏幕物理像素，最上层在前），供前端做鼠标吸附。
#[tauri::command]
pub fn screenshot_windows() -> Vec<[i32; 4]> {
    crate::win32::window_rects::visible_window_rects()
        .into_iter()
        .map(|rect| [rect.left, rect.top, rect.right, rect.bottom])
        .collect()
}

/// 调试用：前端把关键动作写进日志，便于定位生命周期问题。
#[tauri::command]
pub fn screenshot_trace(line: String) {
    use std::io::Write as _;
    let path = std::env::temp_dir().join("screenshot-trace.log");
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

/// 系统已安装字体族，供字体下拉使用（复用现有 DirectWrite 枚举）。
#[tauri::command]
pub fn screenshot_fonts() -> Result<Vec<String>, String> {
    let families = crate::win32::fonts::installed_families(false).map_err(|error| error.to_string())?;
    Ok(families.into_iter().map(|(name, _label)| name).collect())
}

/// 按行识别，返回 (文字, x, y, 宽, 高)，坐标是截图区域的像素。
#[tauri::command]
pub async fn screenshot_ocr_lines(app: tauri::AppHandle, png_base64: String) -> Result<Vec<(String, i32, i32, i32, i32)>, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|error| format!("图片数据无法解码：{error}"))?;
    let dir = resolve_engine_dir(&app);
    let lines = tauri::async_runtime::spawn_blocking(move || match dir {
        Some(dir) => ocr_engine::recognize_lines(&bytes, &dir),
        None => ocr::recognize_lines(&bytes).map(|items| {
            items
                .into_iter()
                .map(|line| ocr_engine::Line {
                    text: line.text,
                    x: line.x,
                    y: line.y,
                    width: line.width,
                    height: line.height,
                })
                .collect()
        }),
    })
    .await
    .map_err(|error| format!("识别任务失败：{error}"))??;
    Ok(lines
        .into_iter()
        .map(|line| (line.text, line.x, line.y, line.width, line.height))
        .collect())
}
/// 内置 OCR 模型的资源目录；没随包安装时返回 None，调用方退回系统 OCR。
fn resolve_engine_dir(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    let base = app.path().resource_dir().ok();
    ocr_engine::resolve_dir(base)
}

/// This module's Tauri commands, chained into `generate_handler!` by `lib.rs`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::screenshot::screenshot_capture,
            crate::screenshot::screenshot_raw,
            crate::screenshot::screenshot_copy,
            crate::screenshot::screenshot_copy_png,
            crate::screenshot::screenshot_save_png,
            crate::screenshot::screenshot_ocr,
            crate::screenshot::screenshot_ocr_lines,
            crate::screenshot::screenshot_windows,
            crate::screenshot::screenshot_fonts,
            crate::screenshot::screenshot_trace,
            crate::screenshot::screenshot_open,
            crate::screenshot::window::screenshot_window_rect,
            crate::screenshot::window::screenshot_activate,
            crate::screenshot::window::screenshot_dismiss,
            crate::screenshot::window::screenshot_close,
            crate::screenshot::hotkey::set_screenshot_shortcut,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
