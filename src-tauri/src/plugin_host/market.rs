//! Plugin market: the index (plugins/index.json in the GitHub repo), package
//! download with size and SHA-256 checks, safe unzip and the folder swap that
//! installs or updates a plugin. Packages are built by scripts/build-plugin-index.mjs.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Read},
    path::Path,
    time::Duration,
};

use super::manifest::{parse_manifest, supports_api_version, version_at_least, LocalizedText, MANIFEST_FILE_NAME};
use super::signature::{verify_index, TRUSTED_KEYS};
use crate::system::updater::get_updater_proxy;

/// The fork's dev branch for now, so publishing plugins leaves main (and upstream
/// PR #36, which tracks it) alone. See MARKET_BASE_URL in scripts/build-plugin-index.mjs.
const MARKET_REPO: &str = "TixXin/fly-island";
const MARKET_BRANCH: &str = "dev";
/// Shown on the settings page; the index itself is read at the branch's newest commit.
pub(super) const INDEX_URL: &str = "https://raw.githubusercontent.com/TixXin/fly-island/dev/plugins/index.json";
const INDEX_VERSION: u32 = 1;
const MAX_INDEX_BYTES: usize = 1024 * 1024;
const MAX_PACKAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_UNPACKED_BYTES: u64 = 100 * 1024 * 1024;
const MAX_PACKAGE_FILES: usize = 2000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// Folders the host itself uses inside plugins/; skipped when listing plugins.
pub(super) const WORK_DIR_PREFIX: char = '.';

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PackageDownload {
    url: String,
    sha256: String,
    size: u64,
}

/// One plugin in the index. Mirrored by `MarketPlugin` in src/features/plugins/api.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketEntry {
    pub(super) id: String,
    name: LocalizedText,
    #[serde(default)]
    description: Option<LocalizedText>,
    pub(super) version: String,
    api_version: u32,
    #[serde(default)]
    min_app_version: Option<String>,
    #[serde(default)]
    author: String,
    #[serde(default)]
    homepage: String,
    #[serde(default)]
    pub(super) permissions: Vec<String>,
    /// "exe", "powershell", "node" or "none"; missing in indexes written before it existed.
    #[serde(default)]
    runtime: Option<String>,
    download: PackageDownload,
}

#[derive(Debug, Deserialize)]
struct MarketIndex {
    version: u32,
    #[serde(default)]
    plugins: Vec<Value>,
}

/// Parses the index. Entries that do not check out are left out rather than
/// failing the whole index.
pub(super) fn parse_index(text: &str) -> Result<Vec<MarketEntry>, String> {
    let index: MarketIndex =
        serde_json::from_str(text).map_err(|error| format!("The plugin index is not valid: {error}"))?;
    if index.version != INDEX_VERSION {
        return Err(format!(
            "The plugin index has format {}; this FocuSD Island reads format {INDEX_VERSION}. Update FocuSD Island.",
            index.version
        ));
    }
    let mut entries: Vec<MarketEntry> = index
        .plugins
        .into_iter()
        .filter_map(|value| serde_json::from_value::<MarketEntry>(value).ok())
        .filter(is_valid_entry)
        .collect();
    entries.sort_by(|left, right| left.id.cmp(&right.id));
    entries.dedup_by(|left, right| left.id == right.id);
    Ok(entries)
}

fn is_valid_entry(entry: &MarketEntry) -> bool {
    let download = &entry.download;
    download.url.starts_with("https://")
        && download.sha256.len() == 64
        && download.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        && download.size > 0
        && download.size <= MAX_PACKAGE_BYTES
        && !entry.id.is_empty()
        && !entry.id.starts_with(WORK_DIR_PREFIX)
        && entry.id.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'.' || byte == b'-')
}

/// Why this build cannot install `entry`, if it cannot.
pub(super) fn incompatibility(entry: &MarketEntry, app_version: &str) -> Option<String> {
    if !supports_api_version(entry.api_version) {
        return Some(format!("Needs plugin API version {}.", entry.api_version));
    }
    match entry.min_app_version.as_deref() {
        Some(min) if !version_at_least(app_version, min) => Some(format!("Needs FocuSD Island {min} or later.")),
        _ => None,
    }
}

fn client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .user_agent(concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION")));
    // Same proxy as the updater: env vars first, then the Windows system proxy.
    if let Some(proxy) = get_updater_proxy() {
        let proxy = reqwest::Proxy::all(&proxy).map_err(|error| format!("Invalid proxy {proxy}: {error}"))?;
        builder = builder.proxy(proxy);
    }
    builder.build().map_err(|error| format!("Could not create the HTTP client: {error}"))
}

async fn download(url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let response = client()?
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Could not reach {url}: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("{url} answered {}.", response.status()));
    }
    if response.content_length().is_some_and(|length| length > limit) {
        return Err(format!("{url} is larger than {limit} bytes."));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Could not download {url}: {error}"))?;
    if bytes.len() as u64 > limit {
        return Err(format!("{url} is larger than {limit} bytes."));
    }
    Ok(bytes.to_vec())
}

/// The newest commit on the market branch, so the index and its signature are
/// read from the same commit and not from a stale CDN copy of the branch.
/// None when the GitHub API cannot be used (offline, rate limited).
async fn market_commit() -> Option<String> {
    let response = client()
        .ok()?
        .get(format!("https://api.github.com/repos/{MARKET_REPO}/commits/{MARKET_BRANCH}"))
        .header("Accept", "application/vnd.github.sha")
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let sha = response.text().await.ok()?.trim().to_string();
    (sha.len() == 40 && sha.bytes().all(|byte| byte.is_ascii_hexdigit())).then_some(sha)
}

async fn download_text(url: &str) -> Result<String, String> {
    let bytes = download(url, MAX_INDEX_BYTES as u64).await?;
    String::from_utf8(bytes).map_err(|_| format!("{url} is not UTF-8."))
}

/// Downloads the index and its signature, checks the signature, then parses it.
pub(super) async fn fetch_index() -> Result<Vec<MarketEntry>, String> {
    let reference = market_commit().await.unwrap_or_else(|| MARKET_BRANCH.to_string());
    let base = format!("https://raw.githubusercontent.com/{MARKET_REPO}/{reference}/plugins");
    let text = download_text(&format!("{base}/index.json")).await?;
    let signature = download_text(&format!("{base}/index.json.sig")).await?;
    verify_index(&text, &signature, TRUSTED_KEYS)?;
    parse_index(&text)
}

/// Downloads the package and checks its size and SHA-256 against the index.
pub(super) async fn fetch_package(entry: &MarketEntry) -> Result<Vec<u8>, String> {
    let bytes = download(&entry.download.url, entry.download.size).await?;
    verify_package(&bytes, &entry.download)?;
    Ok(bytes)
}

pub(super) fn verify_package(bytes: &[u8], download: &PackageDownload) -> Result<(), String> {
    if bytes.len() as u64 != download.size {
        return Err(format!("The package is {} bytes; the index says {}.", bytes.len(), download.size));
    }
    let digest: String = Sha256::digest(bytes).iter().map(|byte| format!("{byte:02x}")).collect();
    if !digest.eq_ignore_ascii_case(&download.sha256) {
        return Err("The package does not match the checksum in the index; it was not installed.".into());
    }
    Ok(())
}

/// Unzips into `target` (which must not exist), refusing paths that leave it
/// and archives that unpack too large.
pub(super) fn extract_package(bytes: &[u8], target: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|error| format!("The package is not a valid zip: {error}"))?;
    if archive.len() > MAX_PACKAGE_FILES {
        return Err(format!("The package has more than {MAX_PACKAGE_FILES} files."));
    }
    fs::create_dir_all(target).map_err(|error| format!("Could not create {}: {error}", target.display()))?;
    let mut unpacked: u64 = 0;
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|error| format!("Could not read the package: {error}"))?;
        let name = file.name().map(|name| name.into_owned()).unwrap_or_default();
        let relative = file
            .enclosed_name()
            .ok_or_else(|| format!("The package has an unsafe path: {name}"))?;
        let path = target.join(relative);
        if file.is_dir() {
            fs::create_dir_all(&path).map_err(|error| format!("Could not create {}: {error}", path.display()))?;
            continue;
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
        }
        let mut data = Vec::new();
        let budget = MAX_UNPACKED_BYTES - unpacked;
        (&mut file)
            .take(budget + 1)
            .read_to_end(&mut data)
            .map_err(|error| format!("Could not unpack {name}: {error}"))?;
        unpacked += data.len() as u64;
        if unpacked > MAX_UNPACKED_BYTES {
            return Err("The package unpacks to more than 100 MB.".into());
        }
        fs::write(&path, data).map_err(|error| format!("Could not write {}: {error}", path.display()))?;
    }
    Ok(())
}

/// Unpacks `bytes` for `entry` next to the installed plugins, checks the
/// manifest, then swaps it in for any older version. The caller stops the
/// plugin first.
pub(super) fn install_package(plugins_dir: &Path, entry: &MarketEntry, bytes: &[u8], app_version: &str) -> Result<(), String> {
    let staging = plugins_dir.join(format!("{WORK_DIR_PREFIX}installing-{}", entry.id));
    let old = plugins_dir.join(format!("{WORK_DIR_PREFIX}old-{}", entry.id));
    let target = plugins_dir.join(&entry.id);
    for leftover in [&staging, &old] {
        if leftover.exists() {
            fs::remove_dir_all(leftover).map_err(|error| format!("Could not clean up {}: {error}", leftover.display()))?;
        }
    }

    let checked = extract_package(bytes, &staging).and_then(|()| check_unpacked(&staging, entry, app_version));
    if let Err(error) = checked {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }

    if target.exists() {
        fs::rename(&target, &old).map_err(|error| {
            let _ = fs::remove_dir_all(&staging);
            format!("Could not move the installed version aside (is a file in it open?): {error}")
        })?;
    }
    if let Err(error) = fs::rename(&staging, &target) {
        // Put the old version back so the plugin keeps working.
        if old.exists() {
            let _ = fs::rename(&old, &target);
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("Could not install the new version: {error}"));
    }
    let _ = fs::remove_dir_all(&old);
    Ok(())
}

/// The unpacked manifest must be the plugin and version the index described,
/// asking for no permission the index did not list (those are what the user saw).
fn check_unpacked(dir: &Path, entry: &MarketEntry, app_version: &str) -> Result<(), String> {
    let text = fs::read_to_string(dir.join(MANIFEST_FILE_NAME))
        .map_err(|_| format!("The package has no {MANIFEST_FILE_NAME} at its top level."))?;
    let manifest = parse_manifest(&text, &entry.id, app_version)?;
    if manifest.version != entry.version {
        return Err(format!("The package is version {}; the index says {}.", manifest.version, entry.version));
    }
    if let Some(extra) = manifest.permissions.iter().find(|name| !entry.permissions.contains(name)) {
        return Err(format!("The package asks for \"{extra}\", which the index does not list."));
    }
    Ok(())
}
