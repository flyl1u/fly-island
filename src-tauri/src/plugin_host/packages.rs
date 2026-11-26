use std::{io::{Cursor, Read}, path::Path};
use serde::{Deserialize, Serialize};
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
