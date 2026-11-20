//! Share one hardware scan between webviews, including its latest partial result.
use serde_json::Value;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tokio::sync::watch;

const SNAPSHOT_TTL: Duration = Duration::from_secs(10 * 60);

#[derive(Clone, Default)]
struct Snapshot {
    latest: Option<Value>,
    result: Option<Result<Value, String>>,
}

#[derive(Default)]
struct Scans {
    active: Mutex<HashMap<PathBuf, watch::Receiver<Snapshot>>>,
    latest: Mutex<HashMap<PathBuf, CachedSnapshot>>,
}

struct CachedSnapshot {
    value: Value,
    saved_at: Instant,
}

impl Scans {
    fn subscribe(
        &self,
        path: &Path,
    ) -> Result<(watch::Receiver<Snapshot>, Option<watch::Sender<Snapshot>>), String> {
        let mut active = self.active.lock().map_err(|_| "Battery reader is unavailable")?;
        if let Some(current) = active.get(path) {
            return Ok((current.clone(), None));
        }
        let mut latest = self.latest.lock().map_err(|_| "Battery reader is unavailable")?;
        latest.retain(|_, entry| entry.saved_at.elapsed() <= SNAPSHOT_TTL);
        let cached = latest.get(path).map(|entry| mark_cached(&entry.value));
        let (sender, receiver) = watch::channel(Snapshot { latest: cached, result: None });
        active.insert(path.to_path_buf(), receiver.clone());
        Ok((receiver, Some(sender)))
    }

    fn publish(&self, path: &Path, sender: &watch::Sender<Snapshot>, value: Value) {
        let mut latest = self.latest.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        latest.insert(
            path.to_path_buf(),
            CachedSnapshot { value: value.clone(), saved_at: Instant::now() },
        );
        sender.send_replace(Snapshot { latest: Some(value), result: None });
    }

    fn finish(
        &self,
        path: &Path,
        sender: &watch::Sender<Snapshot>,
        result: Result<Value, String>,
    ) {
        // Remove and complete under the same lock so a new caller cannot join a finished scan.
        let mut active = self.active.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Ok(value) = &result {
            self.latest
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .insert(
                    path.to_path_buf(),
                    CachedSnapshot { value: value.clone(), saved_at: Instant::now() },
                );
        }
        sender.send_modify(|snapshot| snapshot.result = Some(result));
        active.remove(path);
    }
}

fn mark_cached(value: &Value) -> Value {
    let mut cached = value.clone();
    cached["errors"] = serde_json::json!([]);
    if let Some(devices) = cached["devices"].as_array_mut() {
        for device in devices {
            if device["percent"].is_number() && device["measurementState"] == "current" {
                device["measurementState"] = Value::String("cached".into());
            }
        }
    }
    cached
}

pub(super) async fn read(
    path: PathBuf,
    mut progress: impl FnMut(Value),
) -> Result<Value, String> {
    static SCANS: OnceLock<Scans> = OnceLock::new();
    static HARDWARE: Mutex<()> = Mutex::new(());
    let scans = SCANS.get_or_init(Scans::default);
    let (mut receiver, sender) = scans.subscribe(&path)?;
    if let Some(sender) = sender {
        // The worker owns the scan even if the initiating webview is closed.
        tauri::async_runtime::spawn(async move {
            let worker_sender = sender.clone();
            let worker_path = path.clone();
            let result = tauri::async_runtime::spawn_blocking(move || {
                let _guard = HARDWARE.lock().map_err(|_| "Battery reader is unavailable")?;
                let progress_path = worker_path.clone();
                super::read_hardware(&worker_path, move |value| {
                    scans.publish(&progress_path, &worker_sender, value);
                })
            })
            .await
            .map_err(|error| error.to_string())
            .and_then(|result| result);
            scans.finish(&path, &sender, result);
        });
    }
    loop {
        let snapshot = receiver.borrow_and_update().clone();
        if let Some(latest) = snapshot.latest { progress(latest); }
        if let Some(result) = snapshot.result { return result; }
        receiver
            .changed()
            .await
            .map_err(|_| "Battery reader stopped before returning a result")?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn overlapping_windows_share_scan_and_replay_progress() {
        let scans = Scans::default();
        let path = PathBuf::from("plugin");
        let (mut island, sender) = scans.subscribe(&path).unwrap();
        let sender = sender.unwrap();
        sender.send_modify(|snapshot| snapshot.latest = Some(json!({"devices":[{"percent":89}]})));
        let (mut settings, second_worker) = scans.subscribe(&path).unwrap();
        assert!(second_worker.is_none());
        assert_eq!(settings.borrow_and_update().latest, island.borrow_and_update().latest);
        let result = json!({"devices":[{"percent":88}],"errors":[]});
        scans.finish(&path, &sender, Ok(result.clone()));
        assert_eq!(island.borrow_and_update().result, Some(Ok(result.clone())));
        assert_eq!(settings.borrow_and_update().result, Some(Ok(result)));
        assert!(scans.subscribe(&path).unwrap().1.is_some());
    }

    #[test]
    fn failed_scan_releases_slot_and_keeps_partial_snapshot() {
        let scans = Scans::default();
        let path = PathBuf::from("plugin");
        let (receiver, sender) = scans.subscribe(&path).unwrap();
        let sender = sender.unwrap();
        sender.send_modify(|snapshot| snapshot.latest = Some(json!({"devices":[{"percent":89}]})));
        scans.finish(&path, &sender, Err("timeout".into()));
        assert!(receiver.borrow().latest.is_some());
        assert_eq!(receiver.borrow().result, Some(Err("timeout".into())));
        assert!(scans.subscribe(&path).unwrap().1.is_some());
    }

    #[test]
    fn completed_reading_seeds_a_later_window_as_cached() {
        let scans = Scans::default();
        let path = PathBuf::from("plugin");
        let (_, sender) = scans.subscribe(&path).unwrap();
        let sender = sender.unwrap();
        let result = json!({"devices":[{"percent":89,"measurementState":"current"}],"errors":[]});
        scans.finish(&path, &sender, Ok(result));
        let (mut settings, next_sender) = scans.subscribe(&path).unwrap();
        assert!(next_sender.is_some());
        assert_eq!(settings.borrow_and_update().latest.as_ref().unwrap()["devices"][0]["measurementState"], "cached");
        assert_eq!(settings.borrow().result, None);
    }
}
