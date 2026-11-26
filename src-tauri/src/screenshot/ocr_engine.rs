//! 内置 OCR 引擎：PaddleOCR PP-OCRv4（ONNX）+ ONNX Runtime。
//!
//! 系统自带的 Windows OCR 只装了简体中文语言包，小字和英文都读不准，
//! 所以这里内置检测 + 识别两个模型，离线可用。
//!
//! 流程：DB 检测（概率图 → 连通域 → 外扩）→ 按框裁剪 → CTC 解码。

use std::path::{Path, PathBuf};
use std::sync::{atomic::{AtomicU64, Ordering}, Arc, Mutex};

use image::RgbaImage;
use ndarray::{Array4, Array3};
use ort::session::Session;
use ort::value::Value;

/// 检测输入的最小边（与 RapidOCR 默认值一致）。
const DET_LIMIT: u32 = 736;
/// 识别输入高度。
const REC_HEIGHT: u32 = 48;
const REC_MAX_WIDTH: u32 = 1280;
/// 概率图阈值。
const DET_THRESH: f32 = 0.3;
const BOX_THRESH: f32 = 0.5;
const UNCLIP_RATIO: f32 = 1.6;

struct Engine {
    det: Mutex<Session>,
    rec: Mutex<Session>,
    keys: Vec<String>,
}

static ENGINE: Mutex<Option<Arc<Engine>>> = Mutex::new(None);
static IDLE_REVISION: AtomicU64 = AtomicU64::new(0);

struct EngineLease(Arc<Engine>);
impl std::ops::Deref for EngineLease {
    type Target = Engine;
    fn deref(&self) -> &Engine { &self.0 }
}
impl Drop for EngineLease {
    fn drop(&mut self) {
        let revision = IDLE_REVISION.fetch_add(1, Ordering::AcqRel) + 1;
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            if let Ok(mut engine) = ENGINE.lock() {
                if IDLE_REVISION.load(Ordering::Acquire) == revision && engine.as_ref().is_some_and(|value| Arc::strong_count(value) == 1) {
                    *engine = None;
                }
            }
        });
    }
}
pub(crate) fn release() {
    IDLE_REVISION.fetch_add(1, Ordering::AcqRel);
    if let Ok(mut engine) = ENGINE.lock() { *engine = None; }
}

/// 一行结果：文字 + 原图坐标。
pub(crate) struct Line {
    pub(crate) text: String,
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: i32,
    pub(crate) height: i32,
}

fn engine(dir: &Path) -> Option<EngineLease> {
    let mut cached = ENGINE.lock().ok()?;
    if cached.is_none() {
        let dll = dir.join("onnxruntime.dll");
        if dll.exists() {
            // 加载随包附带的 ONNX Runtime，不依赖系统安装。
            let _ = ort::init_from(dll.to_string_lossy().to_string()).commit();
        }
        let det = session(dir.join("det.onnx"))?;
        let rec = session(dir.join("rec.onnx"))?;
        let keys = std::fs::read_to_string(dir.join("keys.txt")).ok()?;
        *cached = Some(Arc::new(Engine {
            det: Mutex::new(det),
            rec: Mutex::new(rec),
            keys: keys.lines().map(|line| line.trim_end_matches('\r').to_string()).collect(),
        }));
    }
    IDLE_REVISION.fetch_add(1, Ordering::AcqRel);
    Some(EngineLease(Arc::clone(cached.as_ref()?)))
}

fn session(path: PathBuf) -> Option<Session> {
    // Desktop OCR should leave CPU time to the user's foreground work, including between jobs.
    Session::builder().ok()?.with_intra_threads(2).ok()?.with_inter_threads(1).ok()?
        .with_intra_op_spinning(false).ok()?.with_inter_op_spinning(false).ok()?.commit_from_file(path).ok()
}

/// 识别整张图，返回按阅读顺序排列的行。
pub(crate) fn recognize_lines(png: &[u8], dir: &Path) -> Result<Vec<Line>, String> {
    let Some(engine) = engine(dir) else {
        return Err("内置 OCR 模型加载失败（检查 resources/ocr 是否随包安装）".to_string());
    };
    let image = image::load_from_memory(png)
        .map_err(|error| format!("无法解析图片：{error}"))?
        .to_rgba8();
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸为 0".into());
    }

    let boxes = detect(&engine, &image)?;
    if boxes.is_empty() {
        return Ok(Vec::new());
    }
    let mut lines = Vec::new();
    for quad in boxes {
        if let Ok(text) = recognize_box(&engine, &image, quad) {
            let text = text.trim().to_string();
            if text.is_empty() {
                continue;
            }
            let (x, y, w, h) = quad_bounds(quad);
            lines.push(Line {
                text,
                x,
                y,
                width: w,
                height: h,
            });
        }
    }
    lines.sort_by_key(|line| (line.y / 8, line.x));
    Ok(lines)
}

/// 拼接所有行文字。
pub(crate) fn recognize_text(png: &[u8], dir: &Path) -> Result<String, String> {
    let lines = recognize_lines(png, dir)?;
    Ok(lines
        .into_iter()
        .map(|line| line.text)
        .collect::<Vec<_>>()
        .join("\n"))
}

type Quad = [(f32, f32); 4];

fn quad_bounds(quad: Quad) -> (i32, i32, i32, i32) {
    let xs: Vec<f32> = quad.iter().map(|point| point.0).collect();
    let ys: Vec<f32> = quad.iter().map(|point| point.1).collect();
    let left = xs.iter().cloned().fold(f32::MAX, f32::min).max(0.0) as i32;
    let top = ys.iter().cloned().fold(f32::MAX, f32::min).max(0.0) as i32;
    let right = xs.iter().cloned().fold(f32::MIN, f32::max) as i32;
    let bottom = ys.iter().cloned().fold(f32::MIN, f32::max) as i32;
    (left, top, (right - left).max(1), (bottom - top).max(1))
}

/// DB 检测：缩放 → 归一化 → 推理 → 概率图 → 连通域 → 外扩成框。
fn detect(engine: &Engine, image: &RgbaImage) -> Result<Vec<Quad>, String> {
    let (width, height) = image.dimensions();
    let scale = (DET_LIMIT as f32 / width.min(height) as f32).max(1.0);
    let mut target_w = ((width as f32 * scale) / 32.0).round().max(1.0) as u32 * 32;
    let mut target_h = ((height as f32 * scale) / 32.0).round().max(1.0) as u32 * 32;
    target_w = target_w.clamp(32, 2048);
    target_h = target_h.clamp(32, 2048);

    let resized = image::imageops::resize(image, target_w, target_h, image::imageops::FilterType::Triangle);
    let mut input = Array4::<f32>::zeros((1, 3, target_h as usize, target_w as usize));
    for (x, y, pixel) in resized.enumerate_pixels() {
        let [r, g, b, _] = pixel.0;
        for (channel, value) in [r, g, b].iter().enumerate() {
            input[[0, channel, y as usize, x as usize]] = (*value as f32 / 255.0 - 0.5) / 0.5;
        }
    }

    let mut det = engine.det.lock().map_err(|_| "检测模型被占用".to_string())?;
    let value = Value::from_array(input).map_err(|error| format!("检测输入失败：{error}"))?;
    let outputs = det.run(ort::inputs!["x" => value]).map_err(|error| format!("检测推理失败：{error}"))?;
    let output = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|error| format!("检测输出无法读取：{error}"))?;
    let shape = output.shape().to_vec();
    if shape.len() != 4 {
        return Err("检测输出形状异常".to_string());
    }
    let (out_h, out_w) = (shape[2], shape[3]);
    let map = output.as_slice().ok_or_else(|| "检测输出不是连续内存".to_string())?.to_vec();

    // 二值化
    let mut mask = vec![false; out_h * out_w];
    for index in 0..out_h * out_w {
        mask[index] = map[index] > DET_THRESH;
    }

    // 连通域
    let mut visited = vec![false; out_h * out_w];
    let mut quads = Vec::new();
    for start in 0..out_h * out_w {
        if !mask[start] || visited[start] {
            continue;
        }
        let mut stack = vec![start];
        visited[start] = true;
        let (mut min_x, mut min_y, mut max_x, mut max_y) = (out_w, out_h, 0usize, 0usize);
        let mut count = 0usize;
        let mut score_sum = 0f32;
        while let Some(index) = stack.pop() {
            let x = index % out_w;
            let y = index / out_w;
            count += 1;
            score_sum += map[index];
            min_x = min_x.min(x);
            max_x = max_x.max(x);
            min_y = min_y.min(y);
            max_y = max_y.max(y);
            for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                let nx = x as i32 + dx;
                let ny = y as i32 + dy;
                if nx < 0 || ny < 0 || nx >= out_w as i32 || ny >= out_h as i32 {
                    continue;
                }
                let next = ny as usize * out_w + nx as usize;
                if mask[next] && !visited[next] {
                    visited[next] = true;
                    stack.push(next);
                }
            }
        }
        if count < 6 {
            continue;
        }
        let score = score_sum / count as f32;
        if score < BOX_THRESH {
            continue;
        }
        // 外扩：按面积/周长估算扩张像素
        let box_w = (max_x - min_x + 1) as f32;
        let box_h = (max_y - min_y + 1) as f32;
        let area = box_w * box_h;
        let perimeter = 2.0 * (box_w + box_h);
        let expand = (area * UNCLIP_RATIO / perimeter).max(1.0);
        let ratio_x = width as f32 / target_w as f32;
        let ratio_y = height as f32 / target_h as f32;
        let left = ((min_x as f32 - expand) * ratio_x).max(0.0);
        let top = ((min_y as f32 - expand) * ratio_y).max(0.0);
        let right = (((max_x + 1) as f32 + expand) * ratio_x).min(width as f32);
        let bottom = (((max_y + 1) as f32 + expand) * ratio_y).min(height as f32);
        if right - left < 4.0 || bottom - top < 4.0 {
            continue;
        }
        quads.push([
            (left, top),
            (right, top),
            (right, bottom),
            (left, bottom),
        ]);
        let _ = &mut quads;
    }

    // 少框的情况兜底：整图当一行
    if quads.is_empty() {
        quads.push([
            (0.0, 0.0),
            (width as f32, 0.0),
            (width as f32, height as f32),
            (0.0, height as f32),
        ]);
    }
    Ok(quads)
}

/// 识别单个框：裁剪 → 缩放到固定高度 → CTC 解码。
fn recognize_box(engine: &Engine, image: &RgbaImage, quad: Quad) -> Result<String, String> {
    let (x, y, w, h) = quad_bounds(quad);
    let (image_w, image_h) = image.dimensions();
    let pad = 2i32;
    let left = (x - pad).max(0) as u32;
    let top = (y - pad).max(0) as u32;
    let right = ((x + w + pad) as u32).min(image_w);
    let bottom = ((y + h + pad) as u32).min(image_h);
    if right <= left || bottom <= top {
        return Ok(String::new());
    }
    let crop = image::imageops::crop_imm(image, left, top, right - left, bottom - top).to_image();
    let ratio = crop.height() as f32 / REC_HEIGHT as f32;
    let target_w = ((crop.width() as f32 / ratio).round() as u32).clamp(16, REC_MAX_WIDTH);
    let resized = image::imageops::resize(&crop, target_w, REC_HEIGHT, image::imageops::FilterType::Triangle);

    let mut input = Array4::<f32>::zeros((1, 3, REC_HEIGHT as usize, target_w as usize));
    for (px, py, pixel) in resized.enumerate_pixels() {
        let [r, g, b, _] = pixel.0;
        for (channel, value) in [r, g, b].iter().enumerate() {
            input[[0, channel, py as usize, px as usize]] = (*value as f32 / 255.0 - 0.5) / 0.5;
        }
    }

    let mut rec = engine.rec.lock().map_err(|_| "识别模型被占用".to_string())?;
    let value = Value::from_array(input).map_err(|error| format!("识别输入失败：{error}"))?;
    let outputs = rec.run(ort::inputs!["x" => value]).map_err(|error| format!("识别推理失败：{error}"))?;
    let output = outputs[0]
        .try_extract_array::<f32>()
        .map_err(|error| format!("识别输出无法读取：{error}"))?;
    let shape = output.shape().to_vec();
    if shape.len() != 3 {
        return Err("识别输出形状异常".to_string());
    }
    let (steps, classes) = (shape[1], shape[2]);
    let logits: Array3<f32> = output
        .to_owned()
        .into_dimensionality::<ndarray::Ix3>()
        .map_err(|error| format!("识别输出维度异常：{error}"))?;

    let mut text = String::new();
    let mut last = 0usize;
    for step in 0..steps {
        let mut best = 0usize;
        let mut best_score = f32::MIN;
        for class in 0..classes {
            let score = logits[[0, step, class]];
            if score > best_score {
                best_score = score;
                best = class;
            }
        }
        if best != 0 && best != last {
            if let Some(character) = engine.keys.get(best - 1) {
                text.push_str(character);
            }
        }
        last = best;
    }
    Ok(text)
}

/// 资源目录：随包安装时由 Tauri 提供，测试时用 `SHOT_OCR_DIR` 覆盖。
pub(crate) fn resolve_dir(resource_dir: Option<PathBuf>) -> Option<PathBuf> {
    if let Ok(path) = std::env::var("SHOT_OCR_DIR") {
        let dir = PathBuf::from(path);
        if dir.join("det.onnx").exists() {
            return Some(dir);
        }
    }
    let base = resource_dir?;
    [base.join("resources/ocr"), base.join("ocr")].into_iter()
        .find(|candidate| candidate.join("det.onnx").exists())
}
#[cfg(test)]
mod tests {
    /// 用内置模型识别一张图：`SHOT_OCR_DIR=... SHOT_OCR_FILE=... cargo test -- --ignored engine_reads`
    #[test]
    #[ignore = "需要内置模型文件"]
    fn engine_reads_synthetic() {
        let dir = super::resolve_dir(None).expect("找不到模型目录");
        let path = std::env::var("SHOT_OCR_FILE").expect("缺少 SHOT_OCR_FILE");
        let bytes = std::fs::read(&path).expect("读取图片失败");
        let lines = super::recognize_lines(&bytes, &dir).expect("识别失败");
        println!("ENGINE lines = {}", lines.len());
        for line in lines.iter().take(8) {
            println!("ENGINE LINE ({},{},{},{}) => {}", line.x, line.y, line.width, line.height, line.text);
        }
        let text = super::recognize_text(&bytes, &dir).expect("识别失败");
        println!("ENGINE => {text}");
        assert!(!text.trim().is_empty(), "没有识别出文字");
        let previous = std::sync::Arc::downgrade(super::ENGINE.lock().unwrap().as_ref().unwrap());
        super::release();
        assert_eq!(previous.strong_count(), 0, "模型缓存应完整释放");
        assert_eq!(super::recognize_text(&bytes, &dir).unwrap(), text, "释放后仍可重新加载模型");
        super::release();
    }

    #[test]
    #[ignore = "需要内置模型文件，并等待 60 秒空闲回收"]
    fn engine_idle_release() {
        let dir = super::resolve_dir(None).expect("找不到模型目录");
        let lease = super::engine(&dir).expect("加载模型");
        let previous = std::sync::Arc::downgrade(&lease.0);
        drop(lease);
        std::thread::sleep(std::time::Duration::from_secs(62));
        assert_eq!(previous.strong_count(), 0, "空闲计时器应释放模型会话");
        assert!(super::ENGINE.lock().unwrap().is_none());
    }
}
