//! Only reads PNGs directly inside the store's managed image directory.
use base64::{engine::general_purpose, Engine as _};
use std::{
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
};

use super::store::MAX_IMAGE_PNG_BYTES;

pub(super) fn managed_path(directory: &Path, stored_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(stored_path);
    if path
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("Clipboard image path is invalid.".to_string());
    }
    let directory = fs::canonicalize(directory).map_err(|error| error.to_string())?;
    let path = fs::canonicalize(path)
        .map_err(|error| format!("Clipboard image is unavailable: {error}"))?;
    if path.parent() != Some(directory.as_path()) || path.extension().is_none_or(|ext| ext != "png")
    {
        return Err("Clipboard image is outside the history folder.".to_string());
    }
    Ok(path)
}

pub(super) fn read_image(directory: &Path, stored_path: &str) -> Result<String, String> {
    let path = managed_path(directory, stored_path)?;
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_PNG_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Failed to read clipboard image: {error}"))?;
    if bytes.len() > MAX_IMAGE_PNG_BYTES || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Clipboard image is invalid or too large.".to_string());
    }
    Ok(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn only_managed_bounded_png_files_are_read() {
        let dir = std::env::temp_dir().join(format!(
            "clipboard-image-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let images = dir.join("clipboard-images");
        fs::create_dir_all(&images).unwrap();
        let inside = images.join("sample.png");
        fs::write(&inside, b"\x89PNG\r\n\x1a\nsample").unwrap();
        assert!(read_image(&images, &inside.to_string_lossy())
            .unwrap()
            .starts_with("data:image/png;base64,"));
        let outside = dir.join("outside.png");
        fs::write(&outside, b"\x89PNG\r\n\x1a\n").unwrap();
        assert!(read_image(&images, &outside.to_string_lossy()).is_err());
        assert!(read_image(&images, &images.join("../outside.png").to_string_lossy()).is_err());
        assert!(read_image(&images, &images.join("missing.png").to_string_lossy()).is_err());
        fs::write(&inside, b"not png").unwrap();
        assert!(read_image(&images, &inside.to_string_lossy()).is_err());
        let oversized = fs::File::create(&inside).unwrap();
        oversized.set_len(MAX_IMAGE_PNG_BYTES as u64 + 1).unwrap();
        assert!(read_image(&images, &inside.to_string_lossy()).is_err());
        drop(oversized);
        fs::remove_dir_all(dir).unwrap();
    }
}
