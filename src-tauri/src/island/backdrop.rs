//! The glass materials' backdrop: the desktop wallpaper under the island's monitor, laid out
//! as Windows lays it out, blurred once here and handed to the island as a small JPEG.
//!
//! Why the wallpaper and not the screen (docs/investigations/glass-material-backdrop.md): the
//! island is a WebView in a transparent window much larger than the island, so DWM's own blur
//! would cover the whole window, and capturing the screen would have to keep the island out of
//! every screenshot and recording and stream frames into the page. The wallpaper changes
//! rarely, so the blur costs nothing while the island moves or animates: the page keeps it on a
//! still layer and only clips it to the island's shape.

use base64::Engine;
use image::{
    codecs::jpeg::JpegEncoder,
    imageops::{self, FilterType},
    Rgba, RgbaImage,
};
use serde::Serialize;
use std::{
    path::Path,
    sync::{Mutex, PoisonError},
    time::SystemTime,
};
use tauri::AppHandle;

use crate::win32::wallpaper::{self, DesktopLayout, MonitorWallpaper, WallpaperFit};

/// The backdrop is drawn at a quarter of the monitor's pixels: it is blurred anyway, and a
/// 4K monitor still makes a picture of about 100 KB.
const DOWNSCALE: f64 = 4.0;
/// Decoded wallpapers are kept no larger than this on their long side.
const MAX_SOURCE_SIDE: u32 = 1600;
/// Blur radius at full strength, in backdrop pixels (about 40 screen pixels).
const MAX_SIGMA: f32 = 10.0;

/// Matches IslandBackdrop in src/windows/island/api.ts.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IslandBackdrop {
    /// Changes whenever the picture would; the island sends it back to skip an unchanged one.
    key: String,
    /// `data:image/jpeg;base64,…`, or `None` when `key` matched the one sent.
    data_url: Option<String>,
    /// The monitor the picture covers, in physical screen pixels.
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

struct Source {
    path: String,
    modified: Option<SystemTime>,
    width: u32,
    height: u32,
    image: RgbaImage,
}

static SOURCE: Mutex<Option<Source>> = Mutex::new(None);

/// The blurred wallpaper under the island. `blur` is 0–100; `known_key` is the key of the
/// picture the island already shows.
#[tauri::command]
pub async fn get_island_backdrop(app: AppHandle, blur: f64, known_key: Option<String>) -> Result<IslandBackdrop, String> {
    let window = super::main_window(&app)?;
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let center = (position.x + size.width as i32 / 2, position.y + size.height as i32 / 2);
    tauri::async_runtime::spawn_blocking(move || build(center, blur.clamp(0.0, 100.0), known_key))
        .await
        .map_err(|error| error.to_string())?
}

fn build(center: (i32, i32), blur: f64, known_key: Option<String>) -> Result<IslandBackdrop, String> {
    let layout = wallpaper::desktop_layout()?;
    let monitor = layout
        .monitors
        .iter()
        .find(|monitor| contains(monitor.rect, center))
        .or_else(|| layout.monitors.first())
        .cloned()
        .ok_or_else(|| "没有可用的显示器。".to_string())?;
    let (left, top, right, bottom) = monitor.rect;
    let modified = std::fs::metadata(&monitor.path).and_then(|meta| meta.modified()).ok();
    let key = format!(
        "{}|{:?}|{:?}|{:?}|{:?}|{}",
        monitor.path,
        modified,
        monitor.rect,
        layout.fit,
        layout.background,
        blur.round()
    );
    let mut backdrop = IslandBackdrop { key, data_url: None, left, top, width: right - left, height: bottom - top };
    if known_key.as_deref() == Some(backdrop.key.as_str()) {
        return Ok(backdrop);
    }
    let picture = compose(&layout, &monitor, modified);
    let sigma = (blur / 100.0) as f32 * MAX_SIGMA;
    let picture = if sigma >= 0.3 { imageops::fast_blur(&picture, sigma) } else { picture };
    backdrop.data_url = Some(encode(&vibrant(picture))?);
    Ok(backdrop)
}

fn contains((left, top, right, bottom): (i32, i32, i32, i32), (x, y): (i32, i32)) -> bool {
    x >= left && x < right && y >= top && y < bottom
}

/// The monitor's wallpaper at backdrop size: the background colour, then the picture placed
/// by the fit Windows uses. A picture that cannot be read leaves the colour alone.
fn compose(layout: &DesktopLayout, monitor: &MonitorWallpaper, modified: Option<SystemTime>) -> RgbaImage {
    let (left, top, right, bottom) = monitor.rect;
    let canvas_w = (((right - left) as f64 / DOWNSCALE).ceil() as u32).max(1);
    let canvas_h = (((bottom - top) as f64 / DOWNSCALE).ceil() as u32).max(1);
    let (r, g, b) = layout.background;
    let mut canvas = RgbaImage::from_pixel(canvas_w, canvas_h, Rgba([r, g, b, 255]));
    let mut cache = SOURCE.lock().unwrap_or_else(PoisonError::into_inner);
    let fresh = cache.as_ref().is_some_and(|source| source.path == monitor.path && source.modified == modified);
    if !fresh {
        *cache = load(&monitor.path, modified);
    }
    let Some(source) = cache.as_ref() else { return canvas };
    // The area the picture fills, relative to this monitor: the monitor, or for "span" the
    // box around every monitor.
    let area = if layout.fit == WallpaperFit::Span {
        let union = layout.monitors.iter().fold(monitor.rect, |acc, other| {
            (acc.0.min(other.rect.0), acc.1.min(other.rect.1), acc.2.max(other.rect.2), acc.3.max(other.rect.3))
        });
        (union.0 - left, union.1 - top, union.2 - union.0, union.3 - union.1)
    } else {
        (0, 0, right - left, bottom - top)
    };
    for (x, y, w, h) in placements(layout.fit, area, (source.width, source.height)) {
        let w_px = ((w / DOWNSCALE).round() as u32).max(1);
        let h_px = ((h / DOWNSCALE).round() as u32).max(1);
        let scaled = imageops::resize(&source.image, w_px, h_px, FilterType::Triangle);
        imageops::overlay(&mut canvas, &scaled, (x / DOWNSCALE).round() as i64, (y / DOWNSCALE).round() as i64);
    }
    canvas
}

/// Where copies of a `source`-sized picture go in `area` (x, y, width, height in physical
/// pixels relative to the monitor), for each fit.
fn placements(fit: WallpaperFit, area: (i32, i32, i32, i32), source: (u32, u32)) -> Vec<(f64, f64, f64, f64)> {
    let (ax, ay, aw, ah) = (area.0 as f64, area.1 as f64, area.2 as f64, area.3 as f64);
    let (iw, ih) = (source.0.max(1) as f64, source.1.max(1) as f64);
    let centred = |w: f64, h: f64| vec![(ax + (aw - w) / 2.0, ay + (ah - h) / 2.0, w, h)];
    match fit {
        WallpaperFit::Fill | WallpaperFit::Span => {
            let scale = (aw / iw).max(ah / ih);
            centred(iw * scale, ih * scale)
        }
        WallpaperFit::Fit => {
            let scale = (aw / iw).min(ah / ih);
            centred(iw * scale, ih * scale)
        }
        WallpaperFit::Stretch => vec![(ax, ay, aw, ah)],
        WallpaperFit::Center => centred(iw, ih),
        WallpaperFit::Tile => {
            let mut tiles = Vec::new();
            let mut y = ay;
            // Bounded: a tiny tile on a huge monitor would otherwise make thousands of copies.
            while y < ay + ah && tiles.len() < 400 {
                let mut x = ax;
                while x < ax + aw && tiles.len() < 400 {
                    tiles.push((x, y, iw, ih));
                    x += iw;
                }
                y += ih;
            }
            tiles
        }
    }
}

fn load(path: &str, modified: Option<SystemTime>) -> Option<Source> {
    if path.is_empty() || !Path::new(path).is_file() {
        return None;
    }
    let decoded = image::ImageReader::open(path).ok()?.with_guessed_format().ok()?.decode().ok()?;
    let (width, height) = (decoded.width(), decoded.height());
    let image = if width.max(height) > MAX_SOURCE_SIDE {
        decoded.resize(MAX_SOURCE_SIDE, MAX_SOURCE_SIDE, FilterType::Triangle).to_rgba8()
    } else {
        decoded.to_rgba8()
    };
    Some(Source { path: path.to_string(), modified, width, height, image })
}

/// What is seen through glass reads a little richer: saturation up by a fifth.
fn vibrant(mut picture: RgbaImage) -> RgbaImage {
    for pixel in picture.pixels_mut() {
        let [r, g, b, a] = pixel.0;
        let luma = 0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32;
        let boost = |channel: u8| (luma + (channel as f32 - luma) * 1.2).round().clamp(0.0, 255.0) as u8;
        pixel.0 = [boost(r), boost(g), boost(b), a];
    }
    picture
}

fn encode(picture: &RgbaImage) -> Result<String, String> {
    let rgb = image::DynamicImage::ImageRgba8(picture.clone()).to_rgb8();
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, 82)
        .encode_image(&rgb)
        .map_err(|error| format!("无法生成玻璃背景：{error}"))?;
    Ok(format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fill_covers_and_fit_contains_the_area() {
        let fill = placements(WallpaperFit::Fill, (0, 0, 1920, 1080), (1000, 1000));
        assert_eq!(fill, vec![(0.0, -420.0, 1920.0, 1920.0)]);
        let fit = placements(WallpaperFit::Fit, (0, 0, 1920, 1080), (1000, 1000));
        assert_eq!(fit, vec![(420.0, 0.0, 1080.0, 1080.0)]);
        let stretch = placements(WallpaperFit::Stretch, (0, 0, 1920, 1080), (10, 10));
        assert_eq!(stretch, vec![(0.0, 0.0, 1920.0, 1080.0)]);
    }

    #[test]
    fn tiles_repeat_from_the_corner_and_stop_at_a_bound() {
        let tiles = placements(WallpaperFit::Tile, (0, 0, 300, 200), (100, 100));
        assert_eq!(tiles.len(), 6);
        assert_eq!(tiles[4], (100.0, 100.0, 100.0, 100.0));
        assert_eq!(placements(WallpaperFit::Tile, (0, 0, 4000, 4000), (1, 1)).len(), 400);
    }

    #[test]
    fn a_solid_colour_desktop_composes_to_its_colour() {
        let layout = DesktopLayout {
            monitors: vec![MonitorWallpaper { rect: (0, 0, 400, 200), path: String::new() }],
            fit: WallpaperFit::Fill,
            background: (10, 20, 30),
        };
        let picture = compose(&layout, &layout.monitors[0], None);
        assert_eq!(picture.dimensions(), (100, 50));
        assert_eq!(picture.get_pixel(50, 25).0, [10, 20, 30, 255]);
        assert!(encode(&picture).unwrap().starts_with("data:image/jpeg;base64,"));
    }
}
