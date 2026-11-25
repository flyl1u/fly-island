//! 贴图（截图钉到桌面）：把 PNG 落到本地临时文件，再开一个透明置顶小窗口显示它。
//! 每张贴图一个独立窗口，前端用 ?window=pinned-image&src=<路径> 渲染。

use tauri::{AppHandle, Manager};

/// A previous crash may leave images behind; only remove files created by this feature.
pub(crate) fn cleanup_stale(app: &AppHandle) {
    let Ok(root) = app.path().app_data_dir() else { return; };
    let Ok(entries) = std::fs::read_dir(root.join("pinned-images")) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        let owned = path.file_name().and_then(|value| value.to_str())
            .is_some_and(|name| name.starts_with("pin-") && name.ends_with(".png"));
        if owned && path.is_file() { let _ = std::fs::remove_file(path); }
    }
}

/// 把 base64 PNG 存成临时文件，返回供前端 <img> 使用的本地路径。
pub(crate) fn write_png(app: &AppHandle, png_base64: &str) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|error| format!("图片数据无法解码：{error}"))?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("找不到应用数据目录：{error}"))?
        .join("pinned-images");
    std::fs::create_dir_all(&dir).map_err(|error| format!("无法创建贴图目录：{error}"))?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    let path = dir.join(format!("pin-{stamp}.png"));
    std::fs::write(&path, &bytes).map_err(|error| format!("无法写入贴图：{error}"))?;
    Ok(path.to_string_lossy().replace('\\', "/"))
}
