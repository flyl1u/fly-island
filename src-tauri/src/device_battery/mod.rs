//! Optional local, headless MyFinder-derived plugin; no worker runs on application startup.
mod inventory;
mod process;
mod scan;
use crate::plugin_host::PluginHost;
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, PoisonError, RwLock,
    },
};

static AUDIO_QUERY: Mutex<()> = Mutex::new(());

/// One enabled installation. Teardown cancels and drains its readers before a package can be replaced.
pub(crate) struct DevicePackage {
    path: PathBuf,
    generation: u64,
    stopped: AtomicBool,
    readers: RwLock<()>,
}

impl DevicePackage {
    pub(crate) fn new(path: PathBuf) -> Result<Self, String> {
        static GENERATION: AtomicU64 = AtomicU64::new(0);
        for relative in [
            "device-battery-bridge.exe",
            "engine/runtime/python.exe",
            "engine/server.py",
        ] {
            let file = path
                .join(relative)
                .canonicalize()
                .map_err(|_| "Device battery package is incomplete")?;
            if !file.starts_with(&path) || !file.is_file() {
                return Err("Invalid device battery package".into());
            }
        }
        Ok(Self {
            path,
            generation: GENERATION.fetch_add(1, Ordering::Relaxed),
            stopped: AtomicBool::new(false),
            readers: RwLock::new(()),
        })
    }

    fn is_stopped(&self) -> bool {
        self.stopped.load(Ordering::Acquire)
    }

    pub(crate) fn stop(&self) {
        self.stopped.store(true, Ordering::Release);
        let _drained = self.readers.write().unwrap_or_else(PoisonError::into_inner);
        scan::forget(self.generation);
    }

    fn bridge(&self, args: &[String]) -> Result<Value, String> {
        process::run(
            &self.path.join("device-battery-bridge.exe"),
            args,
            12,
            &|| self.is_stopped(),
        )
    }
}

fn audio(
    package: &DevicePackage,
    speaker_id: String,
    headset_id: String,
    target: Option<String>,
) -> Result<Value, String> {
    // Binding changes and reads from another window can overlap. Each bridge call
    // has a timeout; wait for the prior call instead of leaving the UI stale on "busy".
    let _guard = AUDIO_QUERY
        .lock()
        .map_err(|_| "Audio reader is unavailable")?;
    let _reader = package
        .readers
        .read()
        .map_err(|_| "Device reader is unavailable")?;
    if speaker_id.len() > 4096 || headset_id.len() > 4096 {
        return Err("Audio binding is too long".into());
    }
    let mut args = vec![
        if target.is_some() { "switch" } else { "audio" }.to_string(),
        speaker_id,
        headset_id,
    ];
    if let Some(target) = target {
        if target != "speaker" && target != "headset" {
            return Err("Unknown audio output".into());
        }
        args.push(target);
    }
    package.bridge(&args)
}

#[tauri::command]
pub(crate) async fn device_battery_audio(
    host: tauri::State<'_, PluginHost>,
    speaker_id: String,
    headset_id: String,
    target: Option<String>,
) -> Result<Value, String> {
    let package = host.device_battery()?;
    tauri::async_runtime::spawn_blocking(move || audio(&package, speaker_id, headset_id, target))
        .await
        .map_err(|e| e.to_string())?
}

fn merge(native: Value, generic: Result<Value, String>) -> Value {
    let mut devices = native["devices"].as_array().cloned().unwrap_or_default();
    let mut errors = Vec::<String>::new();
    match generic {
        Ok(value) => {
            devices.extend(value["devices"].as_array().cloned().unwrap_or_default());
            inventory::append_unread_receivers(&mut devices, &value);
            if let Some(list) = value["errors"].as_array() {
                errors.extend(list.iter().filter_map(Value::as_str).map(str::to_owned));
            }
        }
        Err(error) => errors.push(error),
    }
    json!({"devices": devices, "errors": errors})
}

#[tauri::command]
pub(crate) async fn device_battery_read(
    host: tauri::State<'_, PluginHost>,
    webview: tauri::Webview,
    progress: Option<tauri::ipc::JavaScriptChannelId>,
) -> Result<Value, String> {
    let progress = progress.map(|id| id.channel_on::<_, Value>(webview));
    scan::read(host.device_battery()?, move |value| {
        if let Some(channel) = &progress {
            let _ = channel.send(value);
        }
    })
    .await
}

fn read_hardware(
    package: &Arc<DevicePackage>,
    mut progress: impl FnMut(Value) + Send + 'static,
) -> Result<Value, String> {
    let _reader = package
        .readers
        .read()
        .map_err(|_| "Device reader is unavailable")?;
    let path: &Path = &package.path;
    let native = package.bridge(&["battery".into()])?;
    if native["devices"]
        .as_array()
        .is_some_and(|items| !items.is_empty())
    {
        progress(merge(native.clone(), Ok(json!({"devices":[],"errors":[]}))));
    }
    let generic = {
        let native_progress = native.clone();
        let mut latest = None;
        process::poll(
            &path.join("engine/runtime/python.exe"),
            &[
                "-I".into(),
                "-B".into(),
                path.join("engine/server.py").to_string_lossy().into_owned(),
            ],
            &|| package.is_stopped(),
            move |snapshot| {
                let value = merge(native_progress.clone(), Ok(snapshot.clone()));
                if latest.as_ref() != Some(&value)
                    && (latest.is_some()
                        || value["devices"]
                            .as_array()
                            .is_some_and(|items| !items.is_empty()))
                {
                    progress(value.clone());
                    latest = Some(value);
                }
            },
        )
    };
    Ok(merge(native, generic))
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)* crate::device_battery::device_battery_audio, crate::device_battery::device_battery_read,] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partial_failure_preserves_native_readings_and_reports_failure() {
        let result = merge(
            json!({"devices":[{"id":"native","percent":null}]}),
            Err("offline".into()),
        );
        assert!(result["devices"][0]["percent"].is_null());
        assert_eq!(result["errors"][0], "offline");
    }
    #[test]
    fn retains_quality_and_unknown_values() {
        let result = merge(
            json!({"devices":[]}),
            Ok(
                json!({"devices":[{"percent":null,"measurementState":"unknown","approximate":true}]}),
            ),
        );
        assert!(result["devices"][0]["percent"].is_null());
        assert_eq!(result["devices"][0]["measurementState"], "unknown");
    }
}
