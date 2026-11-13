use std::{fs, io::{Read, Write}, path::{Path, PathBuf}, time::Duration};
use sha2::{Digest, Sha256};
use super::{manifest::Asset, PluginError};

pub(super) fn hash(path: &Path) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 { break; }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}
pub(super) fn verify(path: &Path, asset: &Asset) -> bool {
    fs::metadata(path).is_ok_and(|m| m.len() == asset.size)
        && hash(path).is_ok_and(|h| h == asset.sha256)
}
/// GitHub 在国内常常很慢，先走与应用更新相同的两个加速镜像，最后才直连 GitHub。
/// 文件的大小和 SHA256 都写死在清单里，镜像返回的内容对不上就丢弃、换下一个来源。
const MIRRORS: [&str; 3] = ["https://ghfast.top/", "https://gh-proxy.com/", ""];

pub(super) fn candidate_urls(url: &str) -> Vec<String> {
    MIRRORS.iter().map(|mirror| format!("{mirror}{url}")).collect()
}

pub(super) async fn fetch(directory: &Path, asset: &Asset) -> Result<PathBuf, PluginError> {
    fs::create_dir_all(directory)?;
    let target = directory.join(asset.name);
    if verify(&target, asset) { return Ok(target); }
    let client = reqwest::Client::builder().user_agent("FocuSD-Island-MediaPlugins/1.0")
        .connect_timeout(Duration::from_secs(8)).read_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(90))
        .build().map_err(PluginError::network)?;
    let mut last = PluginError::new("Network", "No download source");
    for url in candidate_urls(asset.url) {
        match fetch_from(&client, &url, directory, &target, asset).await {
            Ok(path) => return Ok(path),
            Err(error) if error.kind == "Io" => return Err(error),
            Err(error) => last = error,
        }
    }
    Err(last)
}

async fn fetch_from(client: &reqwest::Client, url: &str, directory: &Path, target: &Path, asset: &Asset) -> Result<PathBuf, PluginError> {
    let temp = directory.join(format!("{}.download", asset.name));
    let result = async {
        let mut response = client.get(url).send().await.map_err(PluginError::network)?
            .error_for_status().map_err(PluginError::network)?;
        let mut file = fs::File::create(&temp)?;
        let mut size = 0u64;
        while let Some(chunk) = response.chunk().await.map_err(PluginError::network)? {
            size += chunk.len() as u64;
            if size > asset.size { return Err(PluginError::new("HashMismatch", "Download exceeds pinned size")); }
            file.write_all(&chunk)?;
        }
        file.sync_all()?;
        drop(file);
        if !verify(&temp, asset) { return Err(PluginError::new("HashMismatch", "Downloaded size or SHA256 does not match the pinned manifest")); }
        if target.exists() { fs::remove_file(target)?; }
        fs::rename(&temp, target)?;
        Ok(target.to_path_buf())
    }.await;
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result
}
