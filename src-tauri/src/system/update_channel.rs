//! Update channels. The stable channel reads the endpoints in tauri.conf.json,
//! which point at the GitHub "latest" release; GitHub never marks a pre-release
//! as latest, so stable users never see a beta. The beta channel reads a
//! separate manifest that the release script keeps on the `beta-channel`
//! release, so only users who opt in are offered pre-releases.

use std::{sync::Mutex, time::Duration};

use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

const STABLE_MANIFEST: &str = "releases/latest/download/latest.json";
const BETA_MANIFEST: &str = "releases/download/beta-channel/latest.json";
const CHECK_TIMEOUT: Duration = Duration::from_secs(20);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);
/// The same two GitHub mirrors the media plugins download through (media_plugins/download.rs). GitHub
/// itself is often unreachable from mainland China while these answer.
const DOWNLOAD_MIRRORS: [&str; 2] = ["https://ghfast.top/", "https://gh-proxy.com/"];

/// The update found by the last check, kept for `updater_download` and `updater_install`.
static PENDING: Mutex<Option<Update>> = Mutex::new(None);
/// The package `updater_download` fetched for the pending update. The island
/// downloads it quietly at startup and installs it only when the user agrees
/// to restart.
static DOWNLOADED: Mutex<Option<Vec<u8>>> = Mutex::new(None);

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    body: Option<String>,
}

/// Mirrors the download events of `@tauri-apps/plugin-updater`, so the
/// settings panel handles them the same way.
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    Started {
        #[serde(rename = "contentLength")]
        content_length: Option<u64>,
    },
    Progress {
        #[serde(rename = "chunkLength")]
        chunk_length: usize,
    },
    Finished,
}

/// The endpoints to check for `channel`. The beta manifest sits next to the
/// stable one on every configured mirror. The stable endpoints follow it, so a
/// missing or unreachable beta manifest still lets beta users get final releases
/// (the updater moves on to the next endpoint when one fails).
pub(crate) fn channel_endpoints(configured: &[Url], channel: &str) -> Result<Vec<Url>, String> {
    match channel {
        "stable" => Ok(configured.to_vec()),
        "beta" => {
            let mut endpoints = configured
                .iter()
                .map(|endpoint| {
                    let url = endpoint.as_str();
                    let base = url
                        .strip_suffix(STABLE_MANIFEST)
                        .ok_or_else(|| format!("Cannot derive the beta channel from {url}"))?;
                    Url::parse(&format!("{base}{BETA_MANIFEST}")).map_err(|error| error.to_string())
                })
                .collect::<Result<Vec<_>, _>>()?;
            endpoints.extend_from_slice(configured);
            Ok(endpoints)
        }
        other => Err(format!("Unknown update channel: {other}")),
    }
}

fn configured_endpoints(app: &AppHandle) -> Result<Vec<Url>, String> {
    let config = app
        .config()
        .plugins
        .0
        .get("updater")
        .cloned()
        .ok_or("The updater is not configured")?;
    serde_json::from_value::<tauri_plugin_updater::Config>(config)
        .map(|config| config.endpoints)
        .map_err(|error| error.to_string())
}

fn pending() -> Result<std::sync::MutexGuard<'static, Option<Update>>, String> {
    PENDING.lock().map_err(|_| "The update state is unavailable".to_string())
}

fn downloaded() -> Result<std::sync::MutexGuard<'static, Option<Vec<u8>>>, String> {
    DOWNLOADED.lock().map_err(|_| "The update state is unavailable".to_string())
}

/// Reports `download` progress as `Started` once, then one `Progress` per chunk.
fn progress(on_event: &Channel<DownloadEvent>) -> impl FnMut(usize, Option<u64>) + '_ {
    let mut started = false;
    move |chunk_length, content_length| {
        if !started {
            started = true;
            let _ = on_event.send(DownloadEvent::Started { content_length });
        }
        let _ = on_event.send(DownloadEvent::Progress { chunk_length });
    }
}

#[tauri::command]
pub async fn updater_check(
    app: AppHandle,
    channel: String,
    proxy: Option<String>,
    allow_downgrade: Option<bool>,
) -> Result<Option<UpdateInfo>, String> {
    let endpoints = channel_endpoints(&configured_endpoints(&app)?, &channel)?;
    let mut builder = app
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|error| error.to_string())?
        .timeout(CHECK_TIMEOUT);
    // Going back from a beta to the latest stable release: any other version is the update.
    if allow_downgrade == Some(true) {
        builder = builder.version_comparator(|current, update| update.version != current);
    }
    if let Some(proxy) = proxy {
        builder = builder.proxy(Url::parse(&proxy).map_err(|error| error.to_string())?);
    }
    let found = builder
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;

    let info = found.as_ref().map(|update| UpdateInfo {
        version: update.version.clone(),
        body: update.body.clone(),
    });
    *pending()? = found;
    *downloaded()? = None;
    Ok(info)
}

/// Where the update package can come from, in the order to try: the address the manifest names,
/// then the same file through each mirror. The bytes are still checked against the manifest's
/// signature when installed, so a mirror cannot substitute a different package.
pub(crate) fn package_urls(download_url: &Url) -> Vec<Url> {
    let mut urls = vec![download_url.clone()];
    for mirror in DOWNLOAD_MIRRORS {
        if let Ok(url) = Url::parse(&format!("{mirror}{download_url}")) {
            urls.push(url);
        }
    }
    urls
}

/// Downloads the package from the first source that answers; the error is the last one tried.
async fn download_package(update: &Update, on_event: &Channel<DownloadEvent>) -> Result<Vec<u8>, String> {
    let mut last_error = String::from("No download source");
    for url in package_urls(&update.download_url) {
        let mut candidate = update.clone();
        candidate.download_url = url;
        candidate.timeout = Some(DOWNLOAD_TIMEOUT);
        // Each attempt reports its own Started, so the progress restarts from zero.
        match candidate
            .download(progress(on_event), || {
                let _ = on_event.send(DownloadEvent::Finished);
            })
            .await
        {
            Ok(bytes) => return Ok(bytes),
            Err(error) => last_error = error.to_string(),
        }
    }
    Err(last_error)
}

/// Downloads the pending update without installing it.
#[tauri::command]
pub async fn updater_download(on_event: Channel<DownloadEvent>) -> Result<(), String> {
    let update = pending()?.clone().ok_or("No update to download")?;
    let bytes = download_package(&update, &on_event).await?;
    *downloaded()? = Some(bytes);
    Ok(())
}

/// Installs the pending update, downloading it first unless `updater_download`
/// already did. On Windows the installer exits the app and relaunches it.
#[tauri::command]
pub async fn updater_install(on_event: Channel<DownloadEvent>) -> Result<(), String> {
    let update = pending()?.take().ok_or("No update to install")?;
    if let Some(bytes) = downloaded()?.take() {
        let _ = on_event.send(DownloadEvent::Finished);
        return update.install(bytes).map_err(|error| error.to_string());
    }
    let bytes = download_package(&update, &on_event).await?;
    update.install(bytes).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn urls(list: &[&str]) -> Vec<Url> {
        list.iter().filter_map(|url| Url::parse(url).ok()).collect()
    }

    #[test]
    fn stable_keeps_the_configured_endpoints() {
        let configured = urls(&["https://github.com/o/r/releases/latest/download/latest.json"]);
        assert_eq!(channel_endpoints(&configured, "stable"), Ok(configured));
    }

    #[test]
    fn beta_reads_the_beta_manifest_on_every_mirror_then_falls_back_to_stable() {
        let configured = urls(&[
            "https://github.com/o/r/releases/latest/download/latest.json",
            "https://ghfast.top/https://github.com/o/r/releases/latest/download/latest.json",
        ]);
        let beta = urls(&[
            "https://github.com/o/r/releases/download/beta-channel/latest.json",
            "https://ghfast.top/https://github.com/o/r/releases/download/beta-channel/latest.json",
            "https://github.com/o/r/releases/latest/download/latest.json",
            "https://ghfast.top/https://github.com/o/r/releases/latest/download/latest.json",
        ]);
        assert_eq!(channel_endpoints(&configured, "beta"), Ok(beta));
    }

    #[test]
    fn unknown_channels_and_unrecognized_endpoints_are_refused() {
        let configured = urls(&["https://example.com/update.json"]);
        assert!(channel_endpoints(&configured, "beta").is_err());
        assert!(channel_endpoints(&configured, "nightly").is_err());
    }

    #[test]
    fn packages_try_the_manifest_address_first_then_each_mirror() {
        let url = Url::parse("https://github.com/o/r/releases/download/v1/app-setup.exe").expect("url");
        let candidates: Vec<String> = package_urls(&url).iter().map(ToString::to_string).collect();
        assert_eq!(
            candidates,
            [
                "https://github.com/o/r/releases/download/v1/app-setup.exe",
                "https://ghfast.top/https://github.com/o/r/releases/download/v1/app-setup.exe",
                "https://gh-proxy.com/https://github.com/o/r/releases/download/v1/app-setup.exe",
            ]
        );
    }

    #[test]
    fn the_shipped_endpoints_have_a_beta_channel() {
        let config: serde_json::Value = serde_json::from_str(include_str!("../../tauri.conf.json"))
            .expect("tauri.conf.json must be valid JSON");
        let updater: tauri_plugin_updater::Config =
            serde_json::from_value(config["plugins"]["updater"].clone())
                .expect("plugins.updater must deserialize");
        let beta = channel_endpoints(&updater.endpoints, "beta").expect("beta endpoints");
        assert_eq!(beta.len(), 2 * updater.endpoints.len());
    }
}
