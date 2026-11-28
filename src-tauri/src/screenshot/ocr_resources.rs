//! Optional, pinned OCR resource pack. No model or runtime DLL is bundled with the host.
use std::{fs, io::Write, path::{Path, PathBuf}, time::Duration};
use ring::digest::{Context, SHA256};
use tauri::{AppHandle, Manager};

static INSTALL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
const PACK: &str = "ppocr-v4-ort-1.22";
const SOURCE: &str = "https://raw.githubusercontent.com/Philipfanw/fly-island/2b196e358404a0fca7240049edd72bef1665d720/src-tauri/resources/ocr";
const FILES: &[(&str, u64, &str)] = &[
    ("det.onnx", 4745517, "d2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9"),
    ("rec.onnx", 10857958, "48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b"),
    ("keys.txt", 26250, "a1c84d9bdb9ab29043c58896224d32941783eb821629618416dcb08f12886492"),
    ("onnxruntime.dll", 14854696, "b7d046825412fe3d6c582145f527a197817b2ed717a3a3f21c6e81896f5fce48"),
];

fn destination(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("screenshot-ocr").join(PACK))
}
fn ready(dir: &Path) -> bool {
    dir.join("complete").is_file() && FILES.iter().all(|(name, length, _)|
        fs::metadata(dir.join(name)).is_ok_and(|meta| meta.is_file() && meta.len() == *length))
}
pub(super) fn installed_dir(app: &AppHandle) -> Option<PathBuf> {
    destination(app).ok().filter(|dir| ready(dir))
}

#[tauri::command]
pub(crate) async fn screenshot_ocr_installed(app: AppHandle) -> bool { installed_dir(&app).is_some() }

async fn download(client: &reqwest::Client, directory: &Path, name: &str, size: u64, hash: &str) -> Result<(), String> {
    let mut response = client.get(format!("{SOURCE}/{name}")).send().await.map_err(|error| error.to_string())?
        .error_for_status().map_err(|error| error.to_string())?;
    if response.content_length().is_some_and(|length| length != size) { return Err("Unexpected OCR resource size".into()); }
    let mut file = fs::File::create(directory.join(name)).map_err(|error| error.to_string())?;
    let mut digest = Context::new(&SHA256);
    let mut received = 0;
    while let Some(bytes) = response.chunk().await.map_err(|error| error.to_string())? {
        received += bytes.len() as u64;
        if received > size { return Err("OCR resource exceeded its expected size".into()); }
        digest.update(&bytes);
        file.write_all(&bytes).map_err(|error| error.to_string())?;
    }
    file.sync_all().map_err(|error| error.to_string())?;
    let checksum: String = digest.finish().as_ref().iter().map(|byte| format!("{byte:02x}")).collect();
    if received != size || checksum != hash { return Err("OCR resource integrity check failed".into()); }
    Ok(())
}

#[tauri::command]
pub(crate) async fn install_screenshot_ocr(app: AppHandle) -> Result<(), String> {
    let _install = INSTALL.lock().await;
    let directory = destination(&app)?;
    if ready(&directory) { return Ok(()); }
    let staging = directory.with_extension("download");
    // This is a fixed, app-owned staging directory; interrupted packs are never loaded.
    if staging.exists() { fs::remove_dir_all(&staging).map_err(|error| error.to_string())?; }
    fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
    let result = async {
        let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(45)).timeout(Duration::from_secs(900))
            .build().map_err(|error| error.to_string())?;
        for &(name, size, checksum) in FILES { download(&client, &staging, name, size, checksum).await?; }
        fs::write(staging.join("ONNX-Runtime-MIT.txt"), include_str!("licenses/ONNX-Runtime-MIT.txt"))
            .map_err(|error| error.to_string())?;
        fs::write(staging.join("PaddleOCR-Apache-2.0.txt"), include_str!("licenses/PaddleOCR-Apache-2.0.txt"))
            .map_err(|error| error.to_string())?;
        fs::write(staging.join("complete"), PACK).map_err(|error| error.to_string())?;
        if directory.exists() { fs::remove_dir_all(&directory).map_err(|error| error.to_string())?; }
        fs::rename(&staging, &directory).map_err(|error| error.to_string())
    }.await;
    if result.is_err() { let _ = fs::remove_dir_all(staging); }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn incomplete_and_wrong_sized_packs_never_become_available() {
        let dir = std::env::temp_dir().join(format!("fly-island-ocr-pack-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        assert!(!ready(&dir));
        fs::write(dir.join("complete"), PACK).unwrap();
        for &(name, _, _) in FILES { fs::write(dir.join(name), b"partial").unwrap(); }
        assert!(!ready(&dir));
        fs::remove_dir_all(dir).unwrap();
    }
}
