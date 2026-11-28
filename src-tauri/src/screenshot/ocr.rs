//! 图片文字识别：用系统自带的 Windows.Media.Ocr，离线、不上传。
//!
//! 系统引擎对"一行小字"很不友好：同一张图放大 3 倍能读对，放大 8 倍反而被
//! 引擎脑补成别的字。所以这里把「多倍率 × 原图/二值化 × 已有引擎」都跑一遍，
//! 按有效字符打分取最好的一份，比固定参数稳。

use windows::{
    Globalization::Language,
    Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap},
    Media::Ocr::OcrEngine,
    Storage::Streams::DataWriter,
};

/// 超过这个尺寸就不再放大，避免无谓的耗时。
const MAX_EDGE: u32 = 4000;

/// 识别 PNG 里的文字，按行返回（换行分隔）。
pub(crate) fn recognize(png: &[u8]) -> Result<String, String> {
    let _com = crate::win32::com::ComApartment::multithreaded().map_err(|error| format!("无法初始化 COM：{error}"))?;
    let _winrt = crate::win32::com::WinRtApartment::multithreaded().map_err(|error| format!("无法初始化 WinRT：{error}"))?;

    let image = image::load_from_memory(png)
        .map_err(|error| format!("无法解析图片：{error}"))?
        .to_rgba8();
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸为 0".into());
    }

    let engines = engines();
    if engines.is_empty() {
        return Err("系统没有安装可用的 OCR 语言包".to_string());
    }

    let mut best = String::new();
    let mut best_score = i32::MIN;
    for factor in [1u32, 2, 3, 5] {
        let scaled_width = width.saturating_mul(factor);
        let scaled_height = height.saturating_mul(factor);
        if scaled_width > MAX_EDGE || scaled_height > MAX_EDGE {
            continue;
        }
        let source = if factor == 1 {
            image.clone()
        } else {
            image::imageops::resize(&image, scaled_width, scaled_height, image::imageops::FilterType::CatmullRom)
        };
        // 原图一份 + 两档二值化：细字压白底的铭牌类图片，二值化后识别率明显更高。
        for threshold in [0u8, 170, 205] {
            let candidate = if threshold == 0 { source.clone() } else { binarize(&source, threshold) };
            let mut pixels = candidate.into_raw();
            for pixel in pixels.as_chunks_mut::<4>().0 {
                pixel.swap(0, 2);
            }
            let Ok(bitmap) = bitmap_from_bgra(&pixels, scaled_width, scaled_height) else {
                continue;
            };
            for engine in &engines {
                let Ok(result) = engine.RecognizeAsync(&bitmap).and_then(|operation| operation.get()) else {
                    continue;
                };
                let Ok(text) = result.Text() else { continue };
                let text = text.to_string_lossy();
                let score = score(&text);
                if score > best_score {
                    best_score = score;
                    best = text;
                }
            }
        }
    }

    Ok(cleanup(&best))
}

/// 去掉汉字之间被引擎插进来的空格；英文单词之间的空格要保留。
fn cleanup(text: &str) -> String {
    let characters: Vec<char> = text.chars().collect();
    let mut output = String::with_capacity(text.len());
    for (index, character) in characters.iter().enumerate() {
        if *character != ' ' && *character != '\u{3000}' {
            output.push(*character);
            continue;
        }
        let before = characters[..index].iter().rev().find(|value| !value.is_whitespace());
        let after = characters[index + 1..].iter().find(|value| !value.is_whitespace());
        let cjk = |value: &char| (0x4E00..=0x9FFF).contains(&(*value as u32));
        // 汉字、中文标点两侧的空格都删掉；英文单词之间的空格保留。
        let punctuation = |value: &char| {
            matches!(*value, '，' | '。' | '！' | '？' | '：' | '；' | '、' | '（' | '）' | '《' | '》')
        };
        if let (Some(left), Some(right)) = (before, after) {
            if (cjk(left) || punctuation(left)) && (cjk(right) || punctuation(right)) {
                continue;
            }
        }
        output.push(*character);
    }
    output.trim().to_string()
}


/// 一行识别结果：文字 + 在原图里的像素矩形。
pub(crate) struct OcrLine {
    pub(crate) text: String,
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: i32,
    pub(crate) height: i32,
}

/// 按行识别，带回每行的位置（划词翻译要把译文画在原文下面）。
pub(crate) fn recognize_lines(png: &[u8]) -> Result<Vec<OcrLine>, String> {
    let _com = crate::win32::com::ComApartment::multithreaded().map_err(|error| format!("无法初始化 COM：{error}"))?;
    let _winrt = crate::win32::com::WinRtApartment::multithreaded().map_err(|error| format!("无法初始化 WinRT：{error}"))?;

    let image = image::load_from_memory(png)
        .map_err(|error| format!("无法解析图片：{error}"))?
        .to_rgba8();
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Err("图片尺寸为 0".into());
    }

    // 小字放大后识别更准；位置最后再缩回原图坐标。
    let factor = if height < 40 { 8 } else if height < 80 { 5 } else if height < 160 { 2 } else { 1 };
    let scaled_width = width.saturating_mul(factor);
    let scaled_height = height.saturating_mul(factor);
    if scaled_width > MAX_EDGE || scaled_height > MAX_EDGE {
        return Ok(Vec::new());
    }
    let source = if factor == 1 {
        image.clone()
    } else {
        image::imageops::resize(&image, scaled_width, scaled_height, image::imageops::FilterType::CatmullRom)
    };
    let mut pixels = source.into_raw();
    for pixel in pixels.as_chunks_mut::<4>().0 {
        pixel.swap(0, 2);
    }
    let bitmap = bitmap_from_bgra(&pixels, scaled_width, scaled_height)?;

    let mut best: Vec<OcrLine> = Vec::new();
    let mut best_score = i32::MIN;
    for engine in engines() {
        let Ok(result) = engine.RecognizeAsync(&bitmap).and_then(|operation| operation.get()) else {
            continue;
        };
        let Ok(lines) = result.Lines() else { continue };
        let mut found = Vec::new();
        for line in &lines {
            let Ok(text) = line.Text() else { continue };
            let text = text.to_string_lossy();
            if text.trim().is_empty() {
                continue;
            }
            let Ok(words) = line.Words() else { continue };
            let mut left = f32::MAX;
            let mut top = f32::MAX;
            let mut right = f32::MIN;
            let mut bottom = f32::MIN;
            for word in &words {
                if let Ok(rect) = word.BoundingRect() {
                    left = left.min(rect.X);
                    top = top.min(rect.Y);
                    right = right.max(rect.X + rect.Width);
                    bottom = bottom.max(rect.Y + rect.Height);
                }
            }
            if left >= right || top >= bottom {
                continue;
            }
            let scale_back = factor as f32;
            found.push(OcrLine {
                text: text.trim().to_string(),
                x: (left / scale_back) as i32,
                y: (top / scale_back) as i32,
                width: ((right - left) / scale_back) as i32,
                height: ((bottom - top) / scale_back) as i32,
            });
        }
        let score: i32 = found.iter().map(|line| score(&line.text)).sum();
        if score > best_score {
            best_score = score;
            best = found;
        }
    }
    Ok(best)
}
/// 灰度 + 阈值二值化，输出白底黑字。
fn binarize(source: &image::RgbaImage, threshold: u8) -> image::RgbaImage {
    let mut output = source.clone();
    for pixel in output.pixels_mut() {
        let [red, green, blue, _] = pixel.0;
        let gray = 0.299 * f32::from(red) + 0.587 * f32::from(green) + 0.114 * f32::from(blue);
        let value = if gray < f32::from(threshold) { 0 } else { 255 };
        pixel.0 = [value, value, value, 255];
    }
    output
}

/// 打分：字母、数字、汉字算有效，其余符号扣分。
///
/// 只按长度选会偏向"把英文读成一堆汉字"的那次结果，所以标点要重罚。
fn score(text: &str) -> i32 {
    text.chars()
        .map(|character| {
            let code = character as u32;
            let is_cjk = (0x4E00..=0x9FFF).contains(&code) || (0x3400..=0x4DBF).contains(&code);
            if character.is_alphanumeric() || is_cjk {
                2
            } else if character.is_whitespace() {
                0
            } else {
                -3
            }
        })
        .sum()
}

fn bitmap_from_bgra(pixels: &[u8], width: u32, height: u32) -> Result<SoftwareBitmap, String> {
    let writer = DataWriter::new().map_err(|error| format!("无法创建写入器：{error}"))?;
    writer.WriteBytes(pixels).map_err(|error| format!("无法写入像素：{error}"))?;
    let buffer = writer.DetachBuffer().map_err(|error| format!("无法取出缓冲区：{error}"))?;
    let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, width as i32, height as i32)
        .map_err(|error| format!("无法创建位图：{error}"))?;
    let _ = BitmapAlphaMode::Ignore;
    Ok(bitmap)
}

/// 候选引擎：简体中文优先，其次繁体，最后英文和用户配置语言。
fn engines() -> Vec<OcrEngine> {
    let mut found = Vec::new();
    for tag in ["zh-Hans", "zh-Hant", "en-US", "ja-JP"] {
        let Ok(language) = Language::CreateLanguage(&windows::core::HSTRING::from(tag)) else {
            continue;
        };
        if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&language) {
            found.push(engine);
        }
    }
    if let Ok(engine) = OcrEngine::TryCreateFromUserProfileLanguages() {
        found.push(engine);
    }
    found
}

#[cfg(test)]
mod tests {
    /// 打印每个倍率/阈值的识别结果，用来挑参数。
    #[test]
    #[ignore = "调试用"]
    fn ocr_variants() {
        let Ok(path) = std::env::var("SHOT_OCR_FILE") else { return };
        let bytes = std::fs::read(&path).expect("读取图片失败");
        let image = image::load_from_memory(&bytes).expect("解析图片失败").to_rgba8();
        let (width, height) = image.dimensions();
        let _com = crate::win32::com::ComApartment::multithreaded().expect("COM");
        let _winrt = crate::win32::com::WinRtApartment::multithreaded().expect("WinRT");
        let engines = super::engines();
        for factor in [1u32, 2, 3, 5, 8] {
            let source = if factor == 1 {
                image.clone()
            } else {
                image::imageops::resize(&image, width * factor, height * factor, image::imageops::FilterType::CatmullRom)
            };
            for threshold in [0u8, 170, 205] {
                let candidate = if threshold == 0 { source.clone() } else { super::binarize(&source, threshold) };
                let mut pixels = candidate.into_raw();
                for pixel in pixels.as_chunks_mut::<4>().0 {
                    pixel.swap(0, 2);
                }
                let Ok(bitmap) = super::bitmap_from_bgra(&pixels, width * factor, height * factor) else { continue };
                for engine in &engines {
                    if let Ok(result) = engine.RecognizeAsync(&bitmap).and_then(|operation| operation.get()) {
                        if let Ok(text) = result.Text() {
                            println!("f={factor} t={threshold} => {}", text.to_string_lossy().replace('"', ""));
                        }
                    }
                }
            }
        }
    }

    /// 把一张含文字的图片识别一遍：`SHOT_OCR_FILE=xxx.png cargo test -- --ignored ocr_file`
    #[test]
    #[ignore = "需要一张含文字的图片和一个可用的 OCR 语言包"]
    fn ocr_file() {
        let Ok(path) = std::env::var("SHOT_OCR_FILE") else {
            return;
        };
        let bytes = std::fs::read(&path).expect("读取图片失败");
        let text = super::recognize(&bytes).expect("识别失败");
        println!("OCR => {text}");
        assert!(!text.trim().is_empty(), "没有识别出任何文字");
    }

    #[test]
    #[ignore = "需要一张含文字的图片"]
    fn ocr_line_boxes() {
        let Ok(path) = std::env::var("SHOT_OCR_FILE") else { return };
        let bytes = std::fs::read(&path).expect("读取图片失败");
        let lines = super::recognize_lines(&bytes).expect("识别失败");
        println!("lines = {}", lines.len());
        for line in lines.iter().take(6) {
            println!("LINE ({},{},{},{}) => {}", line.x, line.y, line.width, line.height, line.text);
        }
        assert!(!lines.is_empty(), "没有识别到行");
    }

    #[test]
    #[ignore = "打印本机安装的 OCR 语言"]
    fn print_ocr_languages() {
        let _com = crate::win32::com::ComApartment::multithreaded().expect("COM");
        let _winrt = crate::win32::com::WinRtApartment::multithreaded().expect("WinRT");
        if let Ok(list) = windows::Media::Ocr::OcrEngine::AvailableRecognizerLanguages() {
            for language in list {
                match language.LanguageTag() {
                    Ok(tag) => println!("LANG => {}", tag.to_string_lossy()),
                    Err(_) => println!("LANG => <unknown>"),
                }
            }
        }
    }

    #[test]
    fn score_prefers_real_text() {
        assert!(super::score("PS-XAYT-Vertex-IQ200") > super::score("PS · 、 仃 已 已 02 開"));
    }
}
