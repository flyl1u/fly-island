//! Optional local, headless MyFinder-derived plugin; no worker runs on application startup.
mod process;
mod inventory;
mod scan;
use serde_json::{json, Value};
use std::{path::{Path, PathBuf}, sync::Mutex};

static AUDIO_QUERY: Mutex<()> = Mutex::new(());

fn plugin_directory(directory: &str) -> Result<PathBuf, String> {
    let path = Path::new(directory).canonicalize().map_err(|_| "Choose the built device-battery plugin folder")?;
    let marker = std::fs::read(path.join("device-battery-plugin.json")).map_err(|_| "Not a device-battery plugin folder")?;
    let marker: Value = serde_json::from_slice(&marker).map_err(|_| "Invalid device-battery plugin marker")?;
    if marker["id"] != "device-battery" || marker["version"] != 1 { return Err("Unsupported device-battery plugin".into()); }
    if !path.join("device-battery-bridge.exe").is_file() { return Err("Build the device-battery bridge first".into()); }
    Ok(path)
}

fn audio(directory: String, speaker_id: String, headset_id: String, target: Option<String>) -> Result<Value, String> {
    // Binding changes and reads from another window can overlap. Each bridge call
    // has a timeout; wait for the prior call instead of leaving the UI stale on "busy".
    let _guard = AUDIO_QUERY.lock().map_err(|_| "Audio reader is unavailable")?;
    let path = plugin_directory(&directory)?;
    if speaker_id.len() > 4096 || headset_id.len() > 4096 { return Err("Audio binding is too long".into()); }
    let mut args = vec![if target.is_some() { "switch" } else { "audio" }.to_string(), speaker_id, headset_id];
    if let Some(target) = target {
        if target != "speaker" && target != "headset" { return Err("Unknown audio output".into()); }
        args.push(target);
    }
    process::run(&path.join("device-battery-bridge.exe"), &args, 12)
}

#[tauri::command]
pub(crate) async fn device_battery_audio(directory: String, speaker_id: String, headset_id: String, target: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || audio(directory, speaker_id, headset_id, target)).await.map_err(|e| e.to_string())?
}

fn merge(native: Value, generic: Result<Value, String>) -> Value {
    let mut devices = native["devices"].as_array().cloned().unwrap_or_default();
    let mut errors = Vec::<String>::new();
    match generic {
        Ok(value) => {
            devices.extend(value["devices"].as_array().cloned().unwrap_or_default());
            inventory::append_unread_receivers(&mut devices, &value);
            if let Some(list) = value["errors"].as_array() { errors.extend(list.iter().filter_map(Value::as_str).map(str::to_owned)); }
        }
        Err(error) => errors.push(error),
    }
    json!({"devices": devices, "errors": errors})
}

#[tauri::command]
pub(crate) async fn device_battery_read(
    directory: String, webview: tauri::Webview, progress: Option<tauri::ipc::JavaScriptChannelId>,
) -> Result<Value, String> {
    let progress = progress.map(|id| id.channel_on::<_, Value>(webview));
    let path = plugin_directory(&directory)?;
    scan::read(path, move |value| {
        if let Some(channel) = &progress { let _ = channel.send(value); }
    }).await
}

fn read_hardware(path: &Path, mut progress: impl FnMut(Value) + Send + 'static) -> Result<Value, String> {
    let native = process::run(&path.join("device-battery-bridge.exe"), &["battery".into()], 12)?;
    if native["devices"].as_array().is_some_and(|items| !items.is_empty()) {
        progress(merge(native.clone(), Ok(json!({"devices":[],"errors":[]}))));
    }
    let generic = if path.join("engine/runtime/python.exe").is_file() {
        let native_progress = native.clone();
        let mut latest = None;
        process::poll(&path.join("engine/runtime/python.exe"), &[
            "-I".into(), "-B".into(), path.join("engine/server.py").to_string_lossy().into_owned(),
        ], move |snapshot| {
            let value = merge(native_progress.clone(), Ok(snapshot.clone()));
            if latest.as_ref() != Some(&value) && (latest.is_some() || value["devices"].as_array().is_some_and(|items| !items.is_empty())) {
                progress(value.clone());
                latest = Some(value);
            }
        })
    } else { Err("Portable Python reader is missing; rebuild without -SkipRuntime".to_string()) };
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
        let result = merge(json!({"devices":[{"id":"native","percent":null}]}), Err("offline".into()));
        assert!(result["devices"][0]["percent"].is_null());
        assert_eq!(result["errors"][0], "offline");
    }
    #[test]
    fn retains_quality_and_unknown_values() {
        let result = merge(json!({"devices":[]}), Ok(json!({"devices":[{"percent":null,"measurementState":"unknown","approximate":true}]})));
        assert!(result["devices"][0]["percent"].is_null());
        assert_eq!(result["devices"][0]["measurementState"], "unknown");
    }
    #[test]
    fn rejects_directories_without_plugin_marker() {
        assert!(plugin_directory(env!("CARGO_MANIFEST_DIR")).is_err());
    }
    #[test]
    #[ignore = "Requires locally built plugin; set FLY_ISLAND_DEVICE_BATTERY_TEST_DIR"]
    fn local_audio_bridge_reads_without_switching() {
        let directory = std::env::var("FLY_ISLAND_DEVICE_BATTERY_TEST_DIR").unwrap();
        let before = audio(directory.clone(), String::new(), String::new(), None).unwrap();
        let after = audio(directory, String::new(), String::new(), None).unwrap();
        assert!(after["Devices"].is_array());
        assert_eq!(before["ConsoleOutputId"], after["ConsoleOutputId"]);
        assert_eq!(before["CommunicationsOutputId"], after["CommunicationsOutputId"]);
    }
    #[test]
    #[ignore = "Requires locally built plugin runtime; set FLY_ISLAND_DEVICE_BATTERY_TEST_DIR"]
    fn local_portable_engine_smoke_uses_isolated_process_runner() {
        let directory = std::env::var("FLY_ISLAND_DEVICE_BATTERY_TEST_DIR").unwrap();
        let path = plugin_directory(&directory).unwrap();
        let result = process::run(&path.join("engine/runtime/python.exe"), &[
            "-I".into(), "-B".into(), path.join("engine/server.py").to_string_lossy().into_owned(),
            "--package-smoke".into(), "--once".into()
        ], 15).unwrap();
        assert_eq!(result["packageSmoke"], true);
        assert!(result["providerCount"].as_u64().unwrap() > 0);
        assert_eq!(result["errors"], json!([]));
    }
    #[test]
    #[ignore = "Queries attached hardware with the locally built plugin runtime"]
    fn local_engine_polls_hardware_through_the_streaming_runner() {
        let directory = std::env::var("FLY_ISLAND_DEVICE_BATTERY_TEST_DIR").unwrap();
        let path = plugin_directory(&directory).unwrap();
        let start = std::time::Instant::now();
        let result = process::poll(&path.join("engine/runtime/python.exe"), &[
            "-I".into(), "-B".into(), path.join("engine/server.py").to_string_lossy().into_owned(),
        ], move |snapshot| {
            if let Some(mouse) = snapshot["devices"].as_array().and_then(|items| items.iter().find(|d| d["provider"] == "wlmouse")) {
                eprintln!("WLmouse: {}% after {:?}", mouse["percent"], start.elapsed());
            }
        }).unwrap();
        let merged = merge(json!({"devices":[]}), Ok(result));
        let devices = merged["devices"].as_array().unwrap();
        for device in devices {
            eprintln!("{}: {} (receiver only: {})", device["name"], device["percent"], device["receiverOnly"]);
        }
        eprintln!("Completed after {:?}; errors: {}", start.elapsed(), merged["errors"]);
    }
    #[test]
    #[ignore = "Queries attached hardware with the locally built plugin runtime"]
    fn local_overlapping_battery_windows_receive_same_progress_and_result() {
        let directory = std::env::var("FLY_ISLAND_DEVICE_BATTERY_TEST_DIR").unwrap();
        let path = plugin_directory(&directory).unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        let first_path = path.clone();
        let first = tauri::async_runtime::spawn(async move {
            scan::read(first_path, move |value| { let _ = sender.send(value); }).await
        });
        let partial = receiver.recv_timeout(std::time::Duration::from_secs(30)).unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        let second = tauri::async_runtime::spawn(async move {
            scan::read(path, move |value| { let _ = sender.send(value); }).await
        });
        let replay = receiver.recv_timeout(std::time::Duration::from_secs(2)).unwrap();
        assert_eq!(partial, replay);
        let (first, second) = tauri::async_runtime::block_on(async { (first.await.unwrap(), second.await.unwrap()) });
        assert_eq!(first.unwrap(), second.unwrap());
        eprintln!("Both windows received partial readings and the same completed scan");
    }
    #[test]
    #[ignore = "Requires locally built plugin; set FLY_ISLAND_DEVICE_BATTERY_TEST_DIR"]
    fn local_overlapping_audio_reads_both_complete() {
        let directory = std::env::var("FLY_ISLAND_DEVICE_BATTERY_TEST_DIR").unwrap();
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
        std::thread::scope(|scope| {
            let readers: Vec<_> = (0..2).map(|_| {
                let barrier = barrier.clone();
                let directory = directory.clone();
                scope.spawn(move || {
                    barrier.wait();
                    audio(directory, String::new(), String::new(), None)
                })
            }).collect();
            barrier.wait();
            for reader in readers {
                assert!(reader.join().unwrap().unwrap()["Devices"].is_array());
            }
        });
    }
}
