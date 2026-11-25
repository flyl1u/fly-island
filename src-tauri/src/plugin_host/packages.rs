use std::{io::{Cursor, Read}, path::Path};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use super::manifest::{valid_id, relative_path, Localized, Manifest};

const MAX_PACKAGE: u64 = 100 * 1024 * 1024;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct IndexEntry {
    pub id: String,
    pub version: String,
    pub name: Localized,
    pub description: Localized,
    pub api_version: u32,
    pub url: String,
    pub sha256: String,
    pub size: u64,
    pub min_app_version: String,
}

impl IndexEntry {
    pub fn compatible(&self) -> bool {
        let app = semver::Version::parse(env!("CARGO_PKG_VERSION"));
        let required = semver::Version::parse(&self.min_app_version);
        matches!((app, required), (Ok(app), Ok(required)) if required <= app)
    }
}

pub fn parse_index(bytes: &[u8]) -> Result<Vec<IndexEntry>, String> {
    let entries: Vec<IndexEntry> = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    let mut ids = std::collections::HashSet::new();
    if entries.len() > 200 { return Err("Plugin index too large".into()); }
    for e in &entries {
        if !valid_id(&e.id) || !ids.insert(&e.id) || e.api_version != 1
            || semver::Version::parse(&e.version).is_err()
            || semver::Version::parse(&e.min_app_version).is_err()
            || e.sha256.len() != 64 || !e.sha256.bytes().all(|b| b.is_ascii_hexdigit())
            || e.size > MAX_PACKAGE || e.size == 0 {
            return Err("Invalid or incompatible plugin index entry".into());
        }
    }
    Ok(entries)
}

pub async fn download(url: &str, local: bool, limit: u64) -> Result<Vec<u8>, String> {
    if local && Path::new(url).is_absolute() {
        return read_local(Path::new(url), limit);
    }
    let parsed = reqwest::Url::parse(url).map_err(|e| e.to_string())?;
    if parsed.scheme() == "file" && local {
        let path = parsed.to_file_path().map_err(|_| "Invalid local plugin URL")?;
        return read_local(&path, limit);
    }
    if !network_source_allowed(&parsed, local) {
        return Err("Plugin downloads require HTTPS (local sources need developer mode)".into());
    }
    let redirects = reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= 5 { attempt.error("Too many plugin redirects") }
        else if !network_source_allowed(attempt.url(), local) { attempt.error("Unsupported plugin redirect") }
        else { attempt.follow() }
    });
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).redirect(redirects).build().map_err(|e| e.to_string())?;
    let mut response = client.get(parsed).send().await.map_err(|e| e.without_url().to_string())?.error_for_status().map_err(|e| e.without_url().to_string())?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.without_url().to_string())? {
        if bytes.len() as u64 + chunk.len() as u64 > limit { return Err("Plugin download too large".into()); }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

pub(super) fn network_source_allowed(url: &reqwest::Url, local: bool) -> bool {
    url.username().is_empty() && url.password().is_none() && url.host_str().is_some()
        && (url.scheme() == "https" || (local && url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))))
}

fn read_local(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > limit { return Err("Invalid or oversized plugin file".into()); }
    let mut bytes = Vec::new();
    file.take(limit.saturating_add(1)).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit { return Err("Plugin file too large".into()); }
    Ok(bytes)
}

pub fn verify(bytes: &[u8], entry: &IndexEntry) -> Result<(), String> {
    if bytes.len() as u64 != entry.size || format!("{:x}", Sha256::digest(bytes)) != entry.sha256.to_lowercase() {
        return Err("Plugin SHA-256 or size mismatch".into());
    }
    Ok(())
}

pub fn extract(bytes: &[u8], destination: &Path, entry: &IndexEntry) -> Result<Manifest, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    if zip.len() > 256 { return Err("Too many plugin files".into()); }
    let mut total = 0u64;
    let mut names = std::collections::HashSet::new();
    for i in 0..zip.len() {
        let mut file = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().trim_end_matches('/');
        if !relative_path(name) || name.split('/').any(|s| s.ends_with(['.', ' ']) || s.eq_ignore_ascii_case("con") || s.eq_ignore_ascii_case("nul"))
            || !names.insert(name.to_lowercase()) || file.is_symlink() {
            return Err("Unsafe plugin archive path".into());
        }
        total = total.checked_add(file.size()).ok_or("Plugin archive too large")?;
        if total > 200 * 1024 * 1024 { return Err("Plugin archive too large".into()); }
        let path = destination.join(name);
        if file.is_dir() { std::fs::create_dir_all(&path).map_err(|e| e.to_string())?; continue; }
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        let mut output = std::fs::OpenOptions::new().write(true).create_new(true).open(path).map_err(|e| e.to_string())?;
        let size = file.size();
        let copied = std::io::copy(&mut file.by_ref().take(size + 1), &mut output).map_err(|e| e.to_string())?;
        if copied != file.size() { return Err("Plugin file size mismatch".into()); }
    }
    let manifest = Manifest::read(&destination.join("fly-island-plugin.json"))?;
    if manifest.id != entry.id || manifest.version != entry.version || manifest.api_version != entry.api_version {
        return Err("Plugin archive does not match index".into());
    }
    let executable = destination.join(&manifest.runtime.command).canonicalize().map_err(|e| e.to_string())?;
    if !executable.is_file() || !executable.starts_with(destination.canonicalize().map_err(|e| e.to_string())?) { return Err("Unsafe plugin executable".into()); }
    Ok(manifest)
}

pub const INDEX_LIMIT: u64 = 1024 * 1024;
pub const PACKAGE_LIMIT: u64 = MAX_PACKAGE;
