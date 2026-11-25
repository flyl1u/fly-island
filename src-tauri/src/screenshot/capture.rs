//! 全分辨率抓屏：截图插件的基础。
//!
//! 玻璃用的是 1/4 尺寸回读（`READ_LEVEL = 2`），截图必须原分辨率，
//! 所以走 [`Duplication::read_region_full`]。

use crate::win32::desktop_duplication::Duplication;

/// 屏幕像素矩形：左、上、右、下。
pub(crate) type ScreenRect = (i32, i32, i32, i32);

type Shot = Result<(u32, u32, Vec<u8>), String>;

/// 常驻抓屏线程：D3D 设备与桌面复制只建一次。每次重新创建要 100ms 以上，
/// 用户按快捷键会觉得"要等半天"，所以复用。
fn worker() -> &'static std::sync::mpsc::Sender<(ScreenRect, std::sync::mpsc::Sender<Shot>)> {
    use std::sync::{mpsc, OnceLock};
    static SENDER: OnceLock<mpsc::Sender<(ScreenRect, mpsc::Sender<Shot>)>> = OnceLock::new();
    SENDER.get_or_init(|| {
        let (sender, receiver) = mpsc::channel::<(ScreenRect, mpsc::Sender<Shot>)>();
        std::thread::spawn(move || {
            let mut slot: Option<((i32, i32), Duplication)> = None;
            while let Ok((region, reply)) = receiver.recv() {
                let shot = grab(&mut slot, region);
                let _ = reply.send(shot);
            }
        });
        sender
    })
}

/// 后台预热：提前把 D3D 设备与桌面复制建好，用户第一次按快捷键就不用等 400ms。
pub(crate) fn warm_up() {
    std::thread::spawn(|| {
        // 1×1 像素，只为触发设备创建与首帧。
        if let Err(error) = capture_rgba((0, 0, 1, 1)) {
            eprintln!("screenshot warm-up failed: {error}");
        }
    });
}

fn grab(slot: &mut Option<((i32, i32), Duplication)>, region: ScreenRect) -> Shot {
    let key = (region.0, region.1);
    let mut last_error: Option<String> = None;

    // 桌面复制会失效（换分辨率、全屏游戏、显卡驱动重置），拿到的是
    // 0x887A0026 ACCESS_LOST。这时必须丢掉旧对象重开，否则会一直读到旧画面。
    for attempt in 0..2 {
        if attempt > 0 || slot.as_ref().map(|(current, _)| *current) != Some(key) {
            *slot = None;
            match Duplication::open(key) {
                Ok(duplication) => *slot = Some((key, duplication)),
                Err(error) => {
                    last_error = Some(format!("无法打开屏幕复制：{error}"));
                    continue;
                }
            }
        }
        let Some((_, duplication)) = slot.as_mut() else {
            continue;
        };
        let mut failed = false;
        for _ in 0..3 {
            if let Err(error) = duplication.next_frame(60, region) {
                last_error = Some(format!("抓取屏幕帧失败：{error}"));
                failed = true;
                break;
            }
            if !duplication.has_captured_frame() {
                continue;
            }
            match duplication.read_region_full(region) {
                Ok(Some(read)) => {
                    if read.rect != region {
                        return Err("选区超出当前显示器，请在同一显示器内截图".into());
                    }
                    let mut rgba = read.bgra;
                    for pixel in rgba.as_chunks_mut::<4>().0 {
                        pixel.swap(0, 2);
                    }
                    return Ok((read.width, read.height, rgba));
                }
                Ok(None) => continue,
                Err(error) => {
                    last_error = Some(format!("回读选区失败：{error}"));
                    failed = true;
                    break;
                }
            }
        }
        if !failed {
            last_error = Some("选区落在屏幕外，或桌面没有可截画面".to_string());
        }
    }

    Err(last_error.unwrap_or_else(|| "抓屏失败".to_string()))
}
pub(crate) fn capture_rgba(region: ScreenRect) -> Result<(u32, u32, Vec<u8>), String> {
    if region.2 <= region.0 || region.3 <= region.1 {
        return Err("选区无效：宽或高为 0".into());
    }
    let (sender, receiver) = std::sync::mpsc::channel();
    worker().send((region, sender)).map_err(|_| "抓屏线程已退出".to_string())?;
    receiver.recv().map_err(|_| "抓屏线程没有响应".to_string())?
}

/// 把 PNG 存到用户「下载」目录，返回保存路径。
pub(crate) fn save_png(png: &[u8]) -> Result<std::path::PathBuf, String> {
    let dir = crate::win32::known_folder::downloads().ok_or_else(|| "找不到下载目录".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| format!("无法创建保存目录：{error}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("shot-{stamp}.png"));
    std::fs::write(&path, png).map_err(|error| format!("无法写入文件：{error}"))?;
    Ok(path)
}

/// 把一张 PNG 放进剪贴板（前端标注合成后传回来）。
pub(crate) fn copy_png_to_clipboard(png: &[u8]) -> Result<(), String> {
    let image = image::load_from_memory(png)
        .map_err(|error| format!("无法解析这张图：{error}"))?
        .to_rgba8();
    let (width, height) = image.dimensions();
    let mut clipboard = arboard::Clipboard::new().map_err(|error| format!("无法打开剪贴板：{error}"))?;
    clipboard
        .set_image(arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: std::borrow::Cow::from(image.into_raw()),
        })
        .map_err(|error| format!("无法写入剪贴板：{error}"))
}

/// 抓取 `region` 并编码成 PNG。
pub(crate) fn capture_png(region: ScreenRect) -> Result<Vec<u8>, String> {
    let (width, height, rgba) = capture_rgba(region)?;
    let image = image::RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| "图像尺寸与像素数据不匹配".to_string())?;
    let mut png = Vec::new();
    image
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .map_err(|error| format!("PNG 编码失败：{error}"))?;
    Ok(png)
}

/// 抓取 `region` 并直接放进系统剪贴板。
pub(crate) fn copy_region_to_clipboard(region: ScreenRect) -> Result<(), String> {
    let (width, height, rgba) = capture_rgba(region)?;
    let mut clipboard = arboard::Clipboard::new().map_err(|error| format!("无法打开剪贴板：{error}"))?;
    clipboard
        .set_image(arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: std::borrow::Cow::from(rgba),
        })
        .map_err(|error| format!("无法写入剪贴板：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 真实抓屏，需要桌面会话：`cargo test -- --ignored screenshot`
    #[test]
    #[ignore = "需要真实桌面会话"]
    fn captures_a_region_as_png() {
        let png = capture_png((100, 100, 300, 250)).expect("抓屏应当成功");
        assert!(png.len() > 8, "PNG 太小：{} 字节", png.len());
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n", "不是合法的 PNG 头");
    }

    /// 连拍两张，第二张应当明显快（设备与桌面复制已复用）：`cargo test -- --ignored screenshot`
    #[test]
    #[ignore = "需要真实桌面会话"]
    fn repeated_capture_is_fast() {
        let first = std::time::Instant::now();
        capture_png((100, 100, 300, 250)).expect("第一张应当成功");
        let first_ms = first.elapsed().as_millis();
        let second = std::time::Instant::now();
        capture_png((100, 100, 300, 250)).expect("第二张应当成功");
        let second_ms = second.elapsed().as_millis();
        println!("first={first_ms}ms second={second_ms}ms");
        assert!(second_ms <= 400, "复用后第二张仍要 {second_ms}ms");
    }

    #[test]
    fn rejects_empty_region() {
        assert!(capture_png((10, 10, 10, 50)).is_err());
        assert!(capture_png((10, 10, 50, 10)).is_err());
    }
}

/// Encode according to the chosen suffix, rejecting accidental arbitrary-file writes.
pub(crate) fn save_image_to(bytes: &[u8], target: &std::path::Path) -> Result<(), String> {
    if !target.is_absolute() { return Err("请选择完整的保存路径".into()); }
    let suffix = target.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let format = match suffix.as_str() {
        "png" => image::ImageFormat::Png,
        "jpg" | "jpeg" => image::ImageFormat::Jpeg,
        _ => return Err("只支持 PNG 或 JPG 格式".into()),
    };
    let image = image::load_from_memory(bytes).map_err(|error| format!("无法解析图片：{error}"))?;
    let image = if format == image::ImageFormat::Jpeg { image::DynamicImage::ImageRgb8(image.to_rgb8()) } else { image };
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("无法创建保存目录：{error}"))?;
    }
    image.save_with_format(target, format).map_err(|error| format!("无法保存图片：{error}"))
}

#[cfg(test)]
mod save_tests {
    use super::save_image_to;
    #[test]
    fn saved_image_uses_requested_encoding_and_keeps_dimensions() {
        let image = image::RgbaImage::from_pixel(13, 7, image::Rgba([100, 150, 200, 255]));
        let mut bytes = std::io::Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        let root = std::env::temp_dir().join(format!("fly-island-save-test-{}", std::process::id()));
        for (suffix, format) in [("png", image::ImageFormat::Png), ("jpg", image::ImageFormat::Jpeg)] {
            let target = root.join(format!("shot.{suffix}"));
            save_image_to(bytes.get_ref(), &target).unwrap();
            let saved = std::fs::read(&target).unwrap();
            assert_eq!(image::guess_format(&saved).unwrap(), format);
            let decoded = image::load_from_memory(&saved).unwrap();
            assert_eq!((decoded.width(), decoded.height()), (13, 7));
        }
        assert!(save_image_to(bytes.get_ref(), &root.join("invalid.exe")).is_err());
        assert!(!root.join("invalid.exe").exists());
        assert!(save_image_to(bytes.get_ref(), std::path::Path::new("relative.png")).is_err());
        let _ = std::fs::remove_dir_all(root);
    }
}
