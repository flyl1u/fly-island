//! 截图类插件（截图标注 / 长截图 / 录屏）共用的原生能力。
//!
//! 三个插件是三次独立的 PR，但抓屏、裁切、OCR 这些底子是同一套，放在这里共享；
//! 每个插件只加自己的命令与界面。

mod capture;
mod ocr;
mod ocr_engine;
pub(crate) mod hotkey;
pub(crate) mod pin;
pub(crate) mod window;
// Tauri 的 #[command] 宏把辅助符号生成在定义模块（pin）里；注册路径需要这里重导出。


use image::GenericImageView;
use tauri::ipc::Response;

/// 启动截图快捷键（默认 Alt+A，设置里可改），预热抓屏设备并预建覆盖层窗口。
pub(crate) fn init(app: &tauri::AppHandle) {
    use tauri::{Emitter as _, Manager};
    pin::cleanup_stale(app);
    capture::warm_up();
    // 贴图窗口 label → 本地图片路径。窗口 URL 只带 window=pinned-image 一个参数
    // （见 window.rs：查询串带额外参数会被资产解析丢掉），路径由前端用命令取。
    app.manage(std::sync::Mutex::new(std::collections::HashMap::<String, String>::new()));
    // 贴图窗口 label → 框选位置（逻辑坐标）。隐藏窗口 show 时 Windows 可能重定位，
    // 显示前强制 set_position 回这个坐标，保证「框在哪贴哪」不挪动。
    app.manage(std::sync::Mutex::new(std::collections::HashMap::<String, (f64, f64)>::new()));
    // 贴图右键用系统原生菜单（DOM 菜单在小窗口里会被裁掉）。记录菜单属于哪张贴图，
    // 点击后把动作 emit 回那张贴图窗口，由前端执行复制/保存/关闭等。
    app.manage(std::sync::Mutex::new(Option::<(String, tauri::menu::Menu<tauri::Wry>)>::None));
    app.on_menu_event(|app, event| {
        let id = event.id.as_ref();
        if !id.starts_with("pin:") { return; }
        let state = app.state::<std::sync::Mutex<Option<(String, tauri::menu::Menu<tauri::Wry>)>>>();
        let target = state.lock().ok().and_then(|value| value.as_ref().map(|(label, _)| label.clone()));
        if let Some(label) = target {
            let _ = app.emit_to(&label, "pin-menu-action", id.strip_prefix("pin:").unwrap_or(id));
        }
    });
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

/// 把标注合成后的 PNG 写到用户指定的路径（保存弹窗用）。
#[tauri::command]
pub async fn screenshot_save_png_to(png_base64: String, path: String) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|error| format!("图片数据无法解码：{error}"))?;
    let target = std::path::PathBuf::from(&path);
    tauri::async_runtime::spawn_blocking(move || capture::save_image_to(&bytes, &target))
        .await.map_err(|error| format!("保存任务失败：{error}"))??;
    let target = std::path::PathBuf::from(&path);
    Ok(target.to_string_lossy().into_owned())
}

/// 抓取一个矩形，返回原始 RGBA：`[宽 u32 LE][高 u32 LE][像素...]`。
///
/// 前端拿 `ImageData` 直接贴图，省掉 PNG 解码（4K 图能省 100ms 以上）。
#[tauri::command]
pub async fn screenshot_raw(window: tauri::WebviewWindow, x: i32, y: i32, width: i32, height: i32) -> Result<Response, String> {
    if width <= 0 || height <= 0 {
        return Err("选区宽高必须大于 0".into());
    }
    let region = (x, y, x + width, y + height);
    window::hide_and_settle(window).await?;
    let (pixels_wide, pixels_high, rgba) = tauri::async_runtime::spawn_blocking(move || capture::capture_rgba_fresh(region))
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
pub async fn screenshot_windows(window: tauri::WebviewWindow) -> Vec<[i32; 4]> {
    crate::win32::window_rects::visible_window_rects(window.hwnd().ok())
        .into_iter()
        .map(|rect| [rect.left, rect.top, rect.right, rect.bottom])
        .collect()
}

/// 调试用：前端把关键动作写进日志，便于定位生命周期问题。
#[tauri::command]
pub fn screenshot_trace(line: String) {
    eprintln!("screenshot: {line}");
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


/// 贴图诊断：关键节点写进临时日志，卡在哪儿一查便知。
fn trace(line: &str) {
    eprintln!("screenshot: {line}");
}

/// 新建一张贴图窗口，窗口尺寸跟随图片（上限为屏幕的 80%）。
///
/// 窗口创建必须走 run_on_main_thread（eye_care / file_shelf / qq_notifications 同款模式）：
/// 直接在命令线程上 build() 要等 WebView2 的「创建完成」回调，等不到时命令挂死，
/// 前端 busy 卡住 → 整个截图层的功能全部失效、退不出来（贴图「卡死」的根因）。
#[derive(serde::Deserialize)]
pub struct PinOrigin { x: f64, y: f64 }

#[tauri::command]
pub(crate) async fn screenshot_pin_image(
    app: tauri::AppHandle,
    png_base64: String,
    origin: Option<PinOrigin>,
    translation: Option<bool>,
    window: tauri::WebviewWindow,
) -> Result<String, String> {
    use base64::Engine as _;
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    trace("pin: start");
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|error| format!("图片数据无法解码：{error}"))?;
    // 解码图片 + 落盘是重活，丢到阻塞线程池，别占主线程。
    let app_for_file = app.clone();
    let (image_w, image_h, path) = tauri::async_runtime::spawn_blocking(move || {
        let (width, height) = image::load_from_memory(&bytes)
            .map(|image| image.dimensions())
            .map_err(|error| format!("无法解析图片：{error}"))?;
        let path = pin::write_png(&app_for_file, &png_base64)?;
        Ok::<(u32, u32, String), String>((width, height, path))
    })
    .await
    .map_err(|error| format!("贴图任务失败：{error}"))??;
    trace(&format!("pin: file ok {path}"));
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    let label = format!("pinned-image-{stamp}");
    // URL 只带 window=pinned-image 一个参数（见 window.rs：查询串带额外参数会被资产解析丢掉）；
    // 图片路径存进托管状态，贴图窗口用 screenshot_pinned_src 取。
    let is_translation = translation.unwrap_or(false);
    let url = if is_translation { "index.html?window=screenshot-translation" } else { "index.html?window=pinned-image" };
    // PNG 的像素是物理像素（抓屏时乘过 DPI），而 WebviewWindow 的 inner_size 收的是
    // 逻辑像素。不除 scale_factor 的话，150% 缩放屏上贴图会凭空放大 1.5 倍——
    // 用户说的「框选多大贴上去就大一圈」。除回去才能 1:1 还原框选区域。
    let monitor = window.current_monitor().ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    let scale_factor = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0).max(0.1);
    let logical_w = image_w as f64 / scale_factor;
    let logical_h = image_h as f64 / scale_factor;
    let max_w = monitor.as_ref().map(|m| m.size().width as f64 / scale_factor * 0.8).unwrap_or(1280.0);
    let max_h = monitor.as_ref().map(|m| m.size().height as f64 / scale_factor * 0.8).unwrap_or(800.0);
    let fit = (max_w / logical_w).min(max_h / logical_h).min(1.0);
    // 窗口比图片大一圈透明边距，用来画 PixPin 那种图片「外侧」光晕；
    // 图片本身仍是框选的原始 1:1 尺寸，视觉大小不变。
    let glow = 8.0;
    let width = if is_translation { 960.0_f64.min(max_w) } else { (logical_w * fit).max(1.0) + glow * 2.0 };
    let height = if is_translation { 680.0_f64.min(max_h) } else { (logical_h * fit).max(1.0) + glow * 2.0 };
    // 贴图必须钉在框选的那个位置：origin 是框选区左上角的逻辑坐标；
    // builder.position 也收逻辑坐标（内部按 DPI 换算成物理位置）。
    // 窗口外扩了 glow，左上角要相应上移/左移，图片才正好落在框选位置。
    let physical_origin = if is_translation {
        monitor.as_ref().map(|monitor| (
            monitor.position().x as f64 + (monitor.size().width as f64 - width * scale_factor) / 2.0,
            monitor.position().y as f64 + (monitor.size().height as f64 - height * scale_factor) / 2.0,
        ))
    } else {
        let position = window.inner_position().map_err(|error| error.to_string())?;
        origin.map(|value| (position.x as f64 + (value.x - glow) * scale_factor,
                            position.y as f64 + (value.y - glow) * scale_factor))
    };
    // Register before the WebView loads: its first IPC must already find the image.
    use tauri::Manager;
    app.state::<std::sync::Mutex<std::collections::HashMap<String, String>>>()
        .lock().map_err(|error| error.to_string())?.insert(label.clone(), path.clone());
    if let Some(point) = physical_origin {
        app.state::<std::sync::Mutex<std::collections::HashMap<String, (f64, f64)>>>()
            .lock().map_err(|error| error.to_string())?.insert(label.clone(), point);
    }
    // 窗口创建丢到主线程执行，结果用 channel 带回；带 10s 超时，绝不让前端干等。
    let (sender, receiver) = std::sync::mpsc::sync_channel::<Result<(), String>>(1);
    let app_for_build = app.clone();
    let label_for_build = label.clone();
    app.run_on_main_thread(move || {
        let builder = WebviewWindowBuilder::new(&app_for_build, &label_for_build, WebviewUrl::App(url.into()))
            .title("Fly Island")
            .inner_size(width, height)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(is_translation)
            // 光晕改由前端 CSS 画（失焦黑晕/聚焦蓝晕可切换），窗口阴影关掉避免重复。
            .shadow(false)
            // 先隐藏，等前端图片加载完再 show，避免「空白窗口闪一下再出图」。
            .visible(false);
    let builder = if physical_origin.is_none() { builder.center() } else { builder };
        let result = builder
            .build()
            .map(|window| {
                if let Some((x, y)) = physical_origin {
                    let _ = window.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                }
            })
            .map_err(|error| format!("无法创建贴图窗口：{error}"));
        let _ = sender.send(result);
    })
    .map_err(|error| format!("无法调度贴图窗口创建：{error}"))?;
    let built = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(std::time::Duration::from_secs(10))
    })
    .await
    .map_err(|error| format!("贴图任务失败：{error}"))?
    .map_err(|_| "创建贴图窗口超时".to_string())?;
    if let Err(error) = built {
        let _ = app.state::<std::sync::Mutex<std::collections::HashMap<String, String>>>().lock().map(|mut entries| entries.remove(&label));
        let _ = app.state::<std::sync::Mutex<std::collections::HashMap<String, (f64, f64)>>>().lock().map(|mut entries| entries.remove(&label));
        let _ = std::fs::remove_file(path);
        return Err(error);
    }
    trace("pin: window built");
    Ok(label)
}

/// 贴图窗口取自己的本地图片路径。
#[tauri::command]
pub(crate) fn screenshot_pinned_src(app: tauri::AppHandle, label: String) -> Result<String, String> {
    use tauri::Manager;
    let map = app.state::<std::sync::Mutex<std::collections::HashMap<String, String>>>();
    let entries = map.lock().map_err(|error| format!("贴图状态不可用：{error}"))?;
    entries
        .get(&label)
        .cloned()
        .ok_or_else(|| "贴图不存在或已关闭".to_string())
}

/// 图片就绪后显示贴图：先强制设回框选坐标（show 不会挪位），再显示+聚焦。
#[tauri::command]
pub(crate) async fn screenshot_pin_reveal(app: tauri::AppHandle, label: String) -> Result<(), String> {
    use tauri::Manager;
    let window = app.get_webview_window(&label).ok_or_else(|| "贴图窗口不存在".to_string())?;
    // 先把坐标拷出来（State 借用 app，不能直接跨 set_position 调用）。
    let origin = {
        let origins = app.state::<std::sync::Mutex<std::collections::HashMap<String, (f64, f64)>>>();
        origins.lock().ok().and_then(|entries| entries.get(&label).copied())
    };
    if let Some((x, y)) = origin {
        // set_position 收逻辑坐标；先定位再 show，避免窗口出现在默认位置再跳过去。
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x: x as i32, y: y as i32 }));
    }
    window.show().map_err(|error| format!("显示贴图失败：{error}"))?;
    let _ = window.set_focus();
    Ok(())
}

/// 贴图右键菜单：系统原生菜单，弹出在鼠标处，不受贴图小窗口边界裁剪。
#[tauri::command]
#[expect(clippy::too_many_arguments, reason = "Preserve the existing typed IPC arguments")]
pub(crate) async fn screenshot_pin_menu(
    app: tauri::AppHandle,
    label: String,
    x: f64,
    y: f64,
    text_selectable: bool,
    shadow: bool,
    topmost: bool,
    english: Option<bool>,
) -> Result<(), String> {
    use tauri::menu::{CheckMenuItem, ContextMenu, Menu, MenuItem, PredefinedMenuItem};
    use tauri::Manager;
    let window = app.get_webview_window(&label).ok_or_else(|| "贴图窗口不存在".to_string())?;
    let en = english.unwrap_or(false);
    // Native menus use the same locale as their WebView.
    let text = CheckMenuItem::with_id(&app, "pin:text", if en { "Text selectable" } else { "文本可选" }, true, text_selectable, None::<&str>)
        .map_err(|error| format!("菜单创建失败：{error}"))?;
    let recognize = MenuItem::with_id(&app, "pin:recognize", if en { "Recognize and copy text" } else { "识别并复制文字" }, true, None::<&str>)
        .map_err(|error| format!("菜单创建失败：{error}"))?;
    let copy = MenuItem::with_id(&app, "pin:copy", if en { "Copy image" } else { "复制图像" }, true, None::<&str>)
        .map_err(|error| format!("菜单创建失败：{error}"))?;
    let save = MenuItem::with_id(&app, "pin:save", if en { "Save image" } else { "保存图像" }, true, None::<&str>)
        .map_err(|error| format!("菜单创建失败：{error}"))?;
    let translate = MenuItem::with_id(&app, "pin:translate", if en { "Translate (Ctrl+Q)" } else { "翻译 (Ctrl+Q)" }, true, None::<&str>)
        .map_err(|error| format!("菜单创建失败：{error}"))?;
    let sep1 = PredefinedMenuItem::separator(&app).map_err(|error| format!("菜单创建失败：{error}"))?;
    let shadow_item = CheckMenuItem::with_id(&app, "pin:shadow", if en { "Window shadow" } else { "窗口阴影" }, true, shadow, None::<&str>)
        .map_err(|error| format!("菜单创建失败：{error}"))?;
    let topmost_item = CheckMenuItem::with_id(&app, "pin:topmost", if en { "Always on top" } else { "窗口置顶" }, true, topmost, None::<&str>)
        .map_err(|error| format!("菜单创建失败：{error}"))?;
    let sep2 = PredefinedMenuItem::separator(&app).map_err(|error| format!("菜单创建失败：{error}"))?;
    let close = MenuItem::with_id(&app, "pin:close", if en { "Close" } else { "关闭" }, true, None::<&str>)
        .map_err(|error| format!("菜单创建失败：{error}"))?;
    let destroy = MenuItem::with_id(&app, "pin:destroy", if en { "Destroy" } else { "销毁" }, true, None::<&str>)
        .map_err(|error| format!("菜单创建失败：{error}"))?;
    let menu = Menu::with_items(&app, &[
        &text, &recognize, &translate, &copy, &save, &sep1, &shadow_item, &topmost_item, &sep2, &close, &destroy,
    ]).map_err(|error| format!("菜单创建失败：{error}"))?;
    // 菜单对象必须保活到点击完成，存进托管状态（新菜单会替掉旧的）。
    let state = app.state::<std::sync::Mutex<Option<(String, tauri::menu::Menu<tauri::Wry>)>>>();
    if let Ok(mut slot) = state.lock() { *slot = Some((label, menu.clone())); }
    // 不传坐标：muda 在 Windows 上用 GetCursorPos() 取当前鼠标位置（屏幕坐标），
    // 正好是右键指针处。传 PhysicalPosition 反而要相对窗口左上角且被 DPI 换算搞偏。
    let _ = (x, y);
    menu.popup(window.as_ref().window())
        .map_err(|error| format!("菜单弹出失败：{error}"))?;
    Ok(())
}

/// 把一段文本写进剪贴板（贴图窗口复制 OCR 文字用；WebView 的 navigator.clipboard 不可靠）。
#[tauri::command]
pub(crate) fn screenshot_copy_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|error| format!("无法打开剪贴板：{error}"))?;
    clipboard.set_text(text).map_err(|error| format!("无法写入剪贴板：{error}"))
}

/// 从托管状态取贴图的临时文件路径。
fn pinned_path(app: &tauri::AppHandle, label: &str) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let state = app.state::<std::sync::Mutex<std::collections::HashMap<String, String>>>();
    let entries = state.lock().map_err(|error| format!("贴图状态不可用：{error}"))?;
    let path = entries.get(label).ok_or_else(|| "找不到这张贴图的文件记录".to_string())?;
    Ok(std::path::PathBuf::from(path))
}

/// 复制贴图图片到剪贴板：直接读临时文件，绕开 WebView canvas 可能的跨域污染。
#[tauri::command]
pub(crate) async fn screenshot_pin_copy_image(app: tauri::AppHandle, label: String) -> Result<(), String> {
    let path = pinned_path(&app, &label)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|error| format!("读取贴图文件失败：{error}"))?;
        capture::copy_png_to_clipboard(&bytes)
    })
    .await
    .map_err(|error| format!("复制任务失败：{error}"))?
}

/// 把贴图另存为用户指定的文件。
#[tauri::command]
pub(crate) async fn screenshot_pin_save_image(app: tauri::AppHandle, label: String, target: String) -> Result<(), String> {
    let path = pinned_path(&app, &label)?;
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|error| format!("读取贴图失败：{error}"))?;
        capture::save_image_to(&bytes, std::path::Path::new(&target))
    })
    .await
    .map_err(|error| format!("保存任务失败：{error}"))?
}

/// 按行识别贴图里的文字，坐标是原图像素；读临时文件，不经过 WebView。
#[tauri::command]
pub(crate) async fn screenshot_pin_ocr_lines(app: tauri::AppHandle, label: String) -> Result<Vec<(String, i32, i32, i32, i32)>, String> {
    use image::GenericImageView as _;
    let dir = resolve_engine_dir(&app);
    let path = pinned_path(&app, &label)?;
    let (lines, zoom) = tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|error| format!("读取贴图文件失败：{error}"))?;
        // 小图上的字太小、OCR 识别不全：放大到至少 2 倍再识别，坐标最后按比例缩回。
        let (source, zoom) = match image::load_from_memory(&bytes) {
            Ok(img) if img.width() < 1000 => {
                let (w, h) = img.dimensions();
                let big = img.resize_exact(w * 2, h * 2, image::imageops::FilterType::Lanczos3);
                let mut png = Vec::new();
                big.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
                    .map_err(|error| format!("准备识别图片失败：{error}"))?;
                (png, 2)
            }
            _ => (bytes, 1),
        };
        let lines = match dir {
            Some(dir) => ocr_engine::recognize_lines(&source, &dir),
            None => ocr::recognize_lines(&source).map(|items| {
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
        }
        .map_err(|error| format!("文字识别失败：{error}"))?;
        Ok::<_, String>((lines, zoom))
    })
    .await
    .map_err(|error| format!("识别任务失败：{error}"))??;
    Ok(lines
        .into_iter()
        .map(|line| (line.text, line.x / zoom, line.y / zoom, line.width / zoom, line.height / zoom))
        .collect())
}

/// 关掉一张贴图窗口。
#[tauri::command]
pub(crate) async fn screenshot_pin_close(app: tauri::AppHandle, label: String) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|error| format!("无法关闭贴图：{error}"))?;
    }
    if let Ok(mut entries) = app
        .state::<std::sync::Mutex<std::collections::HashMap<String, String>>>()
        .lock()
    {
        if let Some(path) = entries.remove(&label) { let _ = std::fs::remove_file(path); }
    }
    let _ = app.state::<std::sync::Mutex<std::collections::HashMap<String, (f64, f64)>>>().lock().map(|mut entries| entries.remove(&label));
    Ok(())
}

/// 销毁一张贴图窗口：关闭之外还要删掉临时图片文件（PixPin 的「销毁」语义）。
#[tauri::command]
pub(crate) async fn screenshot_pin_destroy(app: tauri::AppHandle, label: String) -> Result<(), String> {
    use tauri::Manager;
    let path = {
        let state = app.state::<std::sync::Mutex<std::collections::HashMap<String, String>>>();
        let mut entries = state.lock().map_err(|error| format!("贴图状态不可用：{error}"))?;
        entries.remove(&label)
    };
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|error| format!("无法关闭贴图：{error}"))?;
    }
    let _ = app.state::<std::sync::Mutex<std::collections::HashMap<String, (f64, f64)>>>().lock().map(|mut entries| entries.remove(&label));
    if let Some(path) = path {
        // 先关窗再删文件；删失败不影响关闭。
        let _ = std::fs::remove_file(&path);
    }
    Ok(())
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
            crate::screenshot::screenshot_save_png_to,
            crate::screenshot::screenshot_pin_image,
            crate::screenshot::screenshot_pin_translate,
            crate::screenshot::screenshot_pin_close,
            crate::screenshot::screenshot_pin_destroy,
            crate::screenshot::screenshot_pinned_src,
            crate::screenshot::screenshot_copy_text,
            crate::screenshot::screenshot_pin_copy_image,
            crate::screenshot::screenshot_pin_save_image,
            crate::screenshot::screenshot_pin_ocr_lines,
            crate::screenshot::screenshot_pin_menu,
            crate::screenshot::screenshot_pin_reveal,
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

#[tauri::command]
pub(crate) async fn screenshot_pin_translate(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<String, String> {
    use base64::Engine as _;
    let path = pinned_path(&app, window.label())?;
    let bytes = std::fs::read(path).map_err(|error| format!("读取贴图失败：{error}"))?;
    screenshot_pin_image(app, base64::engine::general_purpose::STANDARD.encode(bytes), None, Some(true), window).await
}

/// Also runs for Alt+F4 / OS destruction, not only the explicit Close button.
pub(crate) fn cleanup_pin(app: &tauri::AppHandle, label: &str) {
    use tauri::Manager;
    if !label.starts_with("pinned-image-") { return; }
    if let Ok(mut entries) = app.state::<std::sync::Mutex<std::collections::HashMap<String, String>>>().lock() {
        if let Some(path) = entries.remove(label) { let _ = std::fs::remove_file(path); }
    }
    let _ = app.state::<std::sync::Mutex<std::collections::HashMap<String, (f64, f64)>>>().lock().map(|mut entries| entries.remove(label));
    if let Ok(mut menu) = app.state::<std::sync::Mutex<Option<(String, tauri::menu::Menu<tauri::Wry>)>>>().lock() {
        if menu.as_ref().is_some_and(|(target, _)| target == label) { *menu = None; }
    }
}
