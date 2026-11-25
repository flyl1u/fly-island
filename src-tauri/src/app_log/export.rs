use std::{fs, io::{self, Cursor, Read, Seek, SeekFrom, Write}, path::{Path, PathBuf}};

use serde_json::{Map, Value};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use super::{file, format, frontend, worker, DATA_DIR, LOG_DIR};
use crate::{config_transfer, win32::{file_dialog::FileType, std_handle::local_timestamp}};

const PLUGIN_LOG_LIMIT: u64 = 128 * 1024;
const PLUGIN_FILE_LIMIT: usize = 48;

#[tauri::command]
pub(crate) async fn export_diagnostic_bundle(window: tauri::WebviewWindow, title: String, settings: Map<String, Value>) -> Result<Option<String>, String> {
    let root = DATA_DIR.get().ok_or("Diagnostic data directory unavailable")?;
    let now = local_timestamp();
    let date = now.get(..10).unwrap_or("today");
    let name = format!("fly-island-diagnostics-{date}.zip");
    let Some(path) = config_transfer::dialog(&window, Some(name), title, FileType::Zip).await? else { return Ok(None) };
    tauri::async_runtime::spawn_blocking(move || {
        let destination = Path::new(&path);
        if !destination.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("zip")) {
            return Err("Diagnostic bundle requires a .zip extension".into());
        }
        let snapshot = worker::snapshot()?;
        let archive = build_zip(root, snapshot, &settings)?;
        config_transfer::write_export(destination, Some(&archive))?;
        Ok(Some(path))
    }).await.map_err(|error| error.to_string())?
}

fn build_zip(root: &Path, snapshot: worker::Snapshot, settings: &Map<String, Value>) -> Result<Vec<u8>, String> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let logs = root.join(LOG_DIR);
    for name in [file::FILE_NAME, file::BACKUP_NAME] {
        let raw = read_tail(&logs.join(name), file::MAX_BYTES).map_err(|error| error.to_string())?;
        if raw.is_some() || name == file::FILE_NAME {
            let sanitized = redact_disk(raw.as_deref().unwrap_or_default());
            entry(&mut zip, name, sanitized.as_bytes())?;
        }
    }
    entry(&mut zip, "recent-events.log", snapshot.recent.as_bytes())?;
    entry(&mut zip, "startup.log", snapshot.startup.as_bytes())?;
    let settings = serde_json::to_vec_pretty(&frontend::safe_settings(settings)).map_err(|error| error.to_string())?;
    entry(&mut zip, "island-settings.json", &settings)?;
    for (name, path) in plugin_files(&root.join("plugin-logs")) {
        let Some(raw) = read_tail(&path, PLUGIN_LOG_LIMIT).ok().flatten() else { continue };
        entry(&mut zip, &format!("plugin-logs/{name}"), redact_plugin(&raw).as_bytes())?;
    }
    zip.finish().map(Cursor::into_inner).map_err(|error| error.to_string())
}

fn entry(zip: &mut ZipWriter<Cursor<Vec<u8>>>, name: &str, data: &[u8]) -> Result<(), String> {
    zip.start_file(name, SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)).map_err(|error| error.to_string())?;
    zip.write_all(data).map_err(|error| error.to_string())
}

fn read_tail(path: &Path, limit: u64) -> io::Result<Option<Vec<u8>>> {
    use std::os::windows::fs::MetadataExt;
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && metadata.file_attributes() & 0x400 == 0 => metadata,
        Ok(_) => return Ok(None),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let mut file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let offset = metadata.len().saturating_sub(limit);
    file.seek(SeekFrom::Start(offset))?;
    let mut raw = Vec::new();
    file.take(limit).read_to_end(&mut raw)?;
    if offset != 0 {
        let start = raw.iter().position(|byte| *byte == b'\n').map_or(raw.len(), |at| at + 1);
        raw.drain(..start);
    }
    if raw.last() != Some(&b'\n') {
        raw.truncate(raw.iter().rposition(|byte| *byte == b'\n').map_or(0, |at| at + 1));
    }
    Ok(Some(raw))
}

fn timestamp(raw: &str) -> Option<&str> {
    let stamp = raw.get(..23)?;
    stamp.bytes().enumerate().all(|(index, byte)| match index {
        4 | 7 => byte == b'-', 10 => byte == b' ', 13 | 16 => byte == b':', 19 => byte == b'.', _ => byte.is_ascii_digit(),
    }).then_some(stamp)
}

fn redact_disk(raw: &[u8]) -> String {
    let mut safe = String::new();
    for line in String::from_utf8_lossy(raw).lines() {
        let Some(stamp) = timestamp(line) else { continue };
        let Some((source, details)) = line.get(23..).and_then(|tail| tail.strip_prefix(" [")).and_then(|tail| tail.split_once("] ")) else { continue };
        match source {
            "startup" | "island" | "window" | "fullscreen" | "media" | "weather" | "plugin" | "update" | "legacy" => {
                safe.push_str(format::truncate(line, format::MAX_LINE - 1));
                safe.push('\n');
            }
            _ => safe.push_str(&format::line(stamp, &format::legacy(source, details), 0)),
        }
    }
    safe
}

fn plugin_files(dir: &Path) -> Vec<(String, PathBuf)> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut logs: Vec<_> = entries.filter_map(Result::ok).filter_map(|entry| {
        let name = entry.file_name().into_string().ok()?;
        let id = name.strip_suffix(".log")?;
        if id.is_empty() || id.len() > 96 || !id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_') { return None; }
        entry.file_type().ok().filter(|kind| kind.is_file())?;
        Some((name, entry.path()))
    }).take(PLUGIN_FILE_LIMIT).collect();
    logs.sort_unstable_by(|left, right| left.0.cmp(&right.0));
    logs
}

fn redact_plugin(raw: &[u8]) -> String {
    use std::fmt::Write;
    let mut counts = std::collections::BTreeMap::new();
    for line in String::from_utf8_lossy(raw).lines() {
        *counts.entry(format::legacy("plugin", line)).or_insert(0u32) += 1;
    }
    let mut safe = String::new();
    for (details, count) in counts { let _ = writeln!(safe, "{details} count={count}"); }
    safe
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_preserves_structured_events_but_not_unclassified_legacy_text() {
        let safe = redact_disk(b"2026-11-25 00:30:00.000 [island] tuck reason=idle_timer\n2026-11-25 00:30:00.000 [rust] token=SECRET timeout\nprivate message\n");
        assert!(safe.contains("tuck reason=idle_timer"));
        assert!(safe.contains("source=rust reason=timeout"));
        assert!(!safe.contains("SECRET") && !safe.contains("private message"));
        assert_eq!(redact_plugin(b"cookie=SECRET timeout\nclipboard secret timeout\n"), "[legacy] report source=plugin reason=timeout count=2\n");
    }

    #[test]
    fn writes_an_openable_bundle_even_when_logging_is_off() {
        let root = std::env::temp_dir().join(format!("fly-island-diagnostic-absent-{}", std::process::id()));
        let snapshot = worker::Snapshot { recent: "mode reason=click".into(), startup: "version reason=launch".into() };
        let settings = serde_json::json!({ "autoTuck": false, "token": "SECRET" });
        let bytes = build_zip(&root, snapshot, settings.as_object().unwrap()).unwrap();
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        assert_eq!(zip.len(), 4);
        assert_eq!(zip.by_name("fly-island.log").unwrap().size(), 0);
        let mut saved = String::new();
        zip.by_name("island-settings.json").unwrap().read_to_string(&mut saved).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&saved).unwrap(), serde_json::json!({ "autoTuck": false }));
        assert!(zip.by_name("recent-events.log").is_ok());
        assert!(zip.by_name("startup.log").is_ok());
    }
}
