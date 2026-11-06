//! Plugin market: the index (index.json in TixXin/focusd-plugins), package
//! download with size and SHA-256 checks, safe unzip and the folder swap that
//! installs or updates a plugin. Packages are built by scripts/plugins/build-plugin-index.mjs.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Cursor, Read},
    path::Path,
    sync::Mutex,
    time::{Duration, Instant},
};

use super::author_signing::{self, AuthorKey, AuthorSignature};
use super::lock;
use super::manifest::{compare_versions, parse_manifest, supports_api_version, version_at_least, LocalizedText, MANIFEST_FILE_NAME};
use super::revocations::{parse_revoked, Revocation};
use super::signature::{verify_file, verify_index, TRUSTED_KEYS};
use crate::system::updater::get_updater_proxy;

/// The index repository: index.json, revoked.json and their signatures at its
/// root, rebuilt and signed by its CI (key e862885af5bba3dc). Builds before
/// this change read plugins/ in TixXin/fly-island (main, or dev before that),
/// which `pnpm plugins:index` keeps signed with the older key for them.
const MARKET_REPO: &str = "TixXin/focusd-plugins";
const MARKET_BRANCH: &str = "main";
/// Shown on the settings page; the index itself is read at the branch's newest commit.
pub(super) const INDEX_URL: &str = "https://raw.githubusercontent.com/TixXin/focusd-plugins/main/index.json";
const INDEX_VERSION: u32 = 1;
/// The island's own publisher, shown as "official".
pub(super) const OFFICIAL_PUBLISHER: &str = "TixXin";
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
    /// Asked for while it runs (manifest optionalPermissions); not part of the install consent.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    optional_permissions: Vec<String>,
    /// "exe", "powershell", "node" or "none"; missing in indexes written before it existed.
    #[serde(default)]
    runtime: Option<String>,
    download: PackageDownload,
    /// The GitHub user or organization that publishes it; missing means the
    /// island's own publisher (indexes written before publishers existed).
    #[serde(default)]
    publisher: Option<String>,
    /// The plugin's repository, "owner/name".
    #[serde(default)]
    repo: Option<String>,
    #[serde(default)]
    categories: Vec<String>,
    /// Offered only to installed plugins whose user opted in (`PluginGrant::pre_release`).
    #[serde(default)]
    pub(super) pre_release: bool,
    /// It has pages with its own HTML (template webview); shown as custom UI.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    webview: bool,
    /// The plugin's README.md, Markdown, shown in the market details (at most MAX_MARKET_TEXT).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    readme: Option<String>,
    /// The plugin's CHANGELOG.md, Markdown, shown as its version history.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    changelog: Option<String>,
    /// The author's signature of this package (author_signing.rs), when the author signs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    author_signature: Option<AuthorSignature>,
    /// The keys the author registered with the market.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    author_keys: Vec<AuthorKey>,
}

/// Longest README / changelog text kept from the index (MAX_MARKET_TEXT in build-plugin-index.mjs).
const MAX_MARKET_TEXT: usize = 16 * 1024;

/// `text` cut to MAX_MARKET_TEXT characters; the index is signed, but a page of text is enough.
fn cap_text(text: String) -> String {
    match text.char_indices().nth(MAX_MARKET_TEXT) {
        Some((end, _)) => format!("{}\n\n…", &text[..end]),
        None => text,
    }
}

impl MarketEntry {
    pub(super) fn publisher(&self) -> &str {
        self.publisher.as_deref().filter(|name| !name.is_empty()).unwrap_or(OFFICIAL_PUBLISHER)
    }

    /// The author key that signed this package, None when unsigned; an error when the signature is wrong.
    pub(super) fn signer(&self) -> Result<Option<String>, String> {
        author_signing::signer(&self.id, &self.version, &self.download.sha256, self.author_signature.as_ref(), &self.author_keys)
    }

    /// How this version's signer compares with the keys remembered for the installed
    /// plugin, counting keys they endorsed; an error when the signature is wrong.
    pub(super) fn key_check(&self, remembered: &[String]) -> Result<author_signing::KeyCheck, String> {
        let trusted = author_signing::endorsed_keys(&self.id, remembered, &self.author_keys);
        Ok(author_signing::check_key(&trusted, self.signer()?.as_deref()))
    }

    pub(super) fn is_newer_than(&self, installed: &str) -> bool {
        compare_versions(&self.version, installed) == std::cmp::Ordering::Greater
    }
}

/// The index and the revocation list, read from the same commit.
#[derive(Clone)]
pub(super) struct MarketData {
    /// Stable entries, one per plugin; what the market page lists.
    pub entries: Vec<MarketEntry>,
    /// The newest pre-release of each plugin that has one.
    pub pre_releases: Vec<MarketEntry>,
    pub revoked: Vec<Revocation>,
}

impl MarketData {
    /// What to install or update `id` to: its pre-release when the user opted in and
    /// it is newer than the stable version (or there is no stable one), else stable.
    pub(super) fn entry_for(&self, id: &str, pre_release: bool) -> Option<&MarketEntry> {
        let stable = self.entries.iter().find(|entry| entry.id == id);
        match (stable, self.pre_release_of(id).filter(|_| pre_release)) {
            (Some(stable), Some(pre)) if pre.is_newer_than(&stable.version) => Some(pre),
            (Some(stable), _) => Some(stable),
            (None, pre) => pre,
        }
    }

    /// The newest pre-release of `id` that is newer than its stable version.
    pub(super) fn pre_release_of(&self, id: &str) -> Option<&MarketEntry> {
        let pre = self.pre_releases.iter().find(|entry| entry.id == id)?;
        let stable = self.entries.iter().find(|entry| entry.id == id);
        stable.is_none_or(|stable| pre.is_newer_than(&stable.version)).then_some(pre)
    }
}

/// The last market read that passed its signature checks, and when. Lets the
/// market page show something at once and an install skip a second download.
static LAST_MARKET: Mutex<Option<(Instant, MarketData)>> = Mutex::new(None);

/// The last verified market, if it was read within `max_age`.
pub(super) fn recent_market(max_age: Duration) -> Option<MarketData> {
    lock(&LAST_MARKET)
        .as_ref()
        .filter(|(at, _)| at.elapsed() <= max_age)
        .map(|(_, data)| data.clone())
}

#[derive(Debug, Deserialize)]
struct MarketIndex {
    version: u32,
    #[serde(default)]
    plugins: Vec<Value>,
}

/// The index's stable entries, one per plugin.
#[cfg(test)]
pub(super) fn parse_index(text: &str) -> Result<Vec<MarketEntry>, String> {
    split_index(text).map(|(stable, _)| stable)
}

/// Parses the index into stable entries and the newest pre-release of each plugin.
/// Entries that do not check out are left out rather than failing the whole index.
pub(super) fn split_index(text: &str) -> Result<(Vec<MarketEntry>, Vec<MarketEntry>), String> {
    let index: MarketIndex =
        serde_json::from_str(text).map_err(|error| format!("The plugin index is not valid: {error}"))?;
    if index.version != INDEX_VERSION {
        return Err(format!(
            "The plugin index has format {}; this FocuSD Island reads format {INDEX_VERSION}. Update FocuSD Island.",
            index.version
        ));
    }
    let (mut pre_releases, mut entries): (Vec<MarketEntry>, Vec<MarketEntry>) = index
        .plugins
        .into_iter()
        .filter_map(|value| serde_json::from_value::<MarketEntry>(value).ok())
        .filter(is_valid_entry)
        .map(|entry| MarketEntry { readme: entry.readme.map(cap_text), changelog: entry.changelog.map(cap_text), ..entry })
        .partition(|entry| entry.pre_release);
    entries.sort_by(|left, right| left.id.cmp(&right.id));
    entries.dedup_by(|left, right| left.id == right.id);
    // Newest first within each plugin, so dedup keeps the newest pre-release.
    pre_releases.sort_by(|left, right| left.id.cmp(&right.id).then_with(|| compare_versions(&right.version, &left.version)));
    pre_releases.dedup_by(|left, right| left.id == right.id);
    Ok((entries, pre_releases))
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

async fn download(client: &reqwest::Client, url: &str, limit: u64) -> Result<Vec<u8>, String> {
    download_unless_missing(client, url, limit)
        .await?
        .ok_or_else(|| format!("{url} answered 404 Not Found."))
}

/// None when the file does not exist (404).
async fn download_unless_missing(client: &reqwest::Client, url: &str, limit: u64) -> Result<Option<Vec<u8>>, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Could not reach {url}: {error}"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
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
    Ok(Some(bytes.to_vec()))
}

/// The newest commit on the market branch, so the index and its signature are
/// read from the same commit and not from a stale CDN copy of the branch.
/// None when the GitHub API cannot be used (offline, rate limited).
async fn market_commit(client: &reqwest::Client) -> Option<String> {
    let response = client
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

/// Starts downloading one market file (up to the index size limit) on its own task.
fn spawn_download(client: &reqwest::Client, url: String) -> tauri::async_runtime::JoinHandle<Result<Option<Vec<u8>>, String>> {
    let client = client.clone();
    tauri::async_runtime::spawn(async move { download_unless_missing(&client, &url, MAX_INDEX_BYTES as u64).await })
}

/// The text of a file from `spawn_download`, or None when it does not exist.
async fn finish_download(
    name: &str,
    task: tauri::async_runtime::JoinHandle<Result<Option<Vec<u8>>, String>>,
) -> Result<Option<String>, String> {
    let bytes = task.await.map_err(|error| format!("Downloading {name} failed: {error}"))??;
    bytes
        .map(|bytes| String::from_utf8(bytes).map_err(|_| format!("{name} is not UTF-8.")))
        .transpose()
}

/// Downloads the index and the revocation list with their signatures from the
/// same commit, checks the signatures, then parses them. A market without
/// revoked.json (older ones) has nothing revoked; one that has it must have it signed.
/// The four files are fetched at once over one client: each GitHub request costs
/// a TLS handshake, and one after another they made the market page slow.
pub(super) async fn fetch_market() -> Result<MarketData, String> {
    let client = client()?;
    let reference = market_commit(&client).await.unwrap_or_else(|| MARKET_BRANCH.to_string());
    let base = format!("https://raw.githubusercontent.com/{MARKET_REPO}/{reference}");
    let index = spawn_download(&client, format!("{base}/index.json"));
    let index_signature = spawn_download(&client, format!("{base}/index.json.sig"));
    let revoked = spawn_download(&client, format!("{base}/revoked.json"));
    let revoked_signature = spawn_download(&client, format!("{base}/revoked.json.sig"));

    let missing = |name: &str| format!("{base}/{name} answered 404 Not Found.");
    let text = finish_download("index.json", index).await?.ok_or_else(|| missing("index.json"))?;
    let signature = finish_download("index.json.sig", index_signature)
        .await?
        .ok_or_else(|| missing("index.json.sig"))?;
    verify_index(&text, &signature, TRUSTED_KEYS)?;
    let (entries, pre_releases) = split_index(&text)?;
    let revoked_text = finish_download("revoked.json", revoked).await?;
    let revoked_signature = finish_download("revoked.json.sig", revoked_signature).await?;
    let revoked = match revoked_text {
        None => Vec::new(),
        Some(text) => {
            let signature = revoked_signature.ok_or_else(|| missing("revoked.json.sig"))?;
            verify_file(&text, &signature, TRUSTED_KEYS, "revocation list")?;
            parse_revoked(&text)?
        }
    };
    let data = MarketData { entries, pre_releases, revoked };
    *lock(&LAST_MARKET) = Some((Instant::now(), data.clone()));
    Ok(data)
}

/// Downloads the package and checks its size and SHA-256 against the index.
pub(super) async fn fetch_package(entry: &MarketEntry) -> Result<Vec<u8>, String> {
    let bytes = download(&client()?, &entry.download.url, entry.download.size).await?;
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
