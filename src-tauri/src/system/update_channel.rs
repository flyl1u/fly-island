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
) -> Result<Option<UpdateInfo>, String> {
    let endpoints = channel_endpoints(&configured_endpoints(&app)?, &channel)?;
    let mut builder = app
        .updater_builder()
        .endpoints(endpoints)
        .map_err(|error| error.to_string())?
        .timeout(CHECK_TIMEOUT);
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

/// Downloads the pending update without installing it.
#[tauri::command]
pub async fn updater_download(on_event: Channel<DownloadEvent>) -> Result<(), String> {
    let mut update = pending()?.clone().ok_or("No update to download")?;
    update.timeout = Some(DOWNLOAD_TIMEOUT);
    let bytes = update
        .download(progress(&on_event), || {
            let _ = on_event.send(DownloadEvent::Finished);
        })
        .await
        .map_err(|error| error.to_string())?;
    *downloaded()? = Some(bytes);
    Ok(())
}

/// Installs the pending update, downloading it first unless `updater_download`
/// already did. On Windows the installer exits the app and relaunches it.
#[tauri::command]
pub async fn updater_install(on_event: Channel<DownloadEvent>) -> Result<(), String> {
    let mut update = pending()?.take().ok_or("No update to install")?;
    if let Some(bytes) = downloaded()?.take() {
        let _ = on_event.send(DownloadEvent::Finished);
        return update.install(bytes).map_err(|error| error.to_string());
    }
    update.timeout = Some(DOWNLOAD_TIMEOUT);
    update
        .download_and_install(progress(&on_event), || {
            let _ = on_event.send(DownloadEvent::Finished);
        })
        .await
        .map_err(|error| error.to_string())
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
