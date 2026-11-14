//! Desktop identities and independent stores; captions are never used for identification.
use std::{collections::HashMap, sync::{Mutex, PoisonError}, time::SystemTime, fs::File, io::{Read, Seek, SeekFrom}, path::{Path, PathBuf}};
use serde_json::Value;
use crate::win32;

pub(super) const APPS: &[&str] = &["deepseek harness", "dsh desktop", "dsh-desktop", "dsh desktop beta", "dsh next", "dsh-desktop-next"];

// Read only the package manifest from Electron's archive, without extracting or executing it.
fn package(exe: &Path) -> Option<Value> {
    let mut file = File::open(exe.parent()?.join("resources/app.asar")).ok()?;
    read_package(&mut file)
}

fn read_package(file: &mut (impl Read + Seek)) -> Option<Value> {
    let mut prefix = [0u8; 16];
    file.read_exact(&mut prefix).ok()?;
    let size = u32::from_le_bytes(prefix[4..8].try_into().ok()?) as u64;
    let length = u32::from_le_bytes(prefix[12..16].try_into().ok()?) as usize;
    if length > 8 * 1024 * 1024 || size < length as u64 + 8 { return None; }
    let mut bytes = vec![0; length];
    file.read_exact(&mut bytes).ok()?;
    let header: Value = serde_json::from_slice(&bytes).ok()?;
    let entry = &header["files"]["package.json"];
    let length = entry["size"].as_u64()?;
    if length > 256 * 1024 || entry["unpacked"] == true { return None; }
    let offset = entry["offset"].as_str()?.parse::<u64>().ok()?;
    file.seek(SeekFrom::Start(8u64.checked_add(size)?.checked_add(offset)?)).ok()?;
    let mut bytes = vec![0; length as usize];
    file.read_exact(&mut bytes).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub(super) fn identity(app: &str, metadata: Option<&Value>) -> &'static str {
    if app == "deepseek harness" { return "DeepSeek Harness"; }
    if matches!(app, "dsh next" | "dsh-desktop-next" | "dsh desktop beta") { return "DSH Desktop (anywhere)"; }
    let repo = metadata.and_then(|v| v["repository"]["url"].as_str().or_else(|| v["repository"].as_str())).unwrap_or_default();
    if repo.contains("github.com/dataelement/dsh-desktop") { "DSH Desktop (dataelement)" }
    else if repo.contains("github.com/anywhere-labs/") { "DSH Desktop (anywhere)" }
    else { "DSH Desktop" }
}

type IdentityStamp = (u64, Option<SystemTime>);
static IDENTITIES: Mutex<Option<HashMap<String, (IdentityStamp, &'static str)>>> = Mutex::new(None);

pub(super) fn name(exe: &str) -> &'static str {
    let stamp = Path::new(exe).parent().and_then(|p| p.join("resources/app.asar").metadata().ok())
        .map(|m| (m.len(), m.modified().ok())).unwrap_or_default();
    let mut cache = IDENTITIES.lock().unwrap_or_else(PoisonError::into_inner);
    let cache = cache.get_or_insert_with(HashMap::new);
    if let Some((_, name)) = cache.get(exe).filter(|(known, _)| *known == stamp) { return name; }
    let name = identity(&super::window_focus::app_name(exe), package(Path::new(exe)).as_ref());
    if cache.len() >= 32 { cache.clear(); }
    cache.insert(exe.to_string(), (stamp, name));
    name
}

pub(super) fn next_home(value: &Value) -> Option<PathBuf> {
    let home = value["home"].as_str()?;
    (!home.contains('\0')).then(|| PathBuf::from(home)).filter(|home| home.is_absolute())
}

fn selected_home(value: &Value) -> Option<PathBuf> {
    if value["version"] != 1 { return None; }
    next_home(&serde_json::json!({"home":value["activeHome"]}))
}

pub(super) fn roots(home: &Path, appdata: Option<PathBuf>) -> Vec<(PathBuf, &'static str)> {
    let mut roots = Vec::new();
    if let Some(appdata) = appdata {
        if let Some(root) = super::dsh_sessions::read_json(&appdata.join("DSH NEXT/home/desktop-next-location.json"), 16 * 1024)
            .and_then(|v| next_home(&v)) {
            roots.push((root, "DSH Desktop (anywhere)"));
        }
        for product in ["DSH Desktop", "DSH Desktop Beta"] {
            if let Some(root) = super::dsh_sessions::read_json(&appdata.join(product).join("data-directory/state.json"), 64 * 1024)
                .and_then(|v| selected_home(&v)) {
                roots.push((root, "DSH Desktop (anywhere)"));
            }
        }
        roots.push((appdata.join("dsh-desktop/harness"), "DSH Desktop (dataelement)"));
    }
    roots.push((home.join(".dsh"), "DSH"));
    roots.push((home.join(".dsh-beta"), "DSH Desktop (anywhere)"));
    roots
}

/// EnumWindows supplies z-order for the fallback when a shared store has no unique owner.
pub(super) fn windows() -> Vec<(String, u32)> {
    let mut found = Vec::new();
    let _ = win32::window::for_each_top_level_window(|window| {
        if !win32::window::is_visible(window) || win32::window::has_owner(window) { return; }
        let pid = win32::process::window_process_id(window);
        if let Some(exe) = win32::process::image_path(pid).filter(|exe| APPS.contains(&super::window_focus::app_name(exe).as_str())) {
            found.push((exe, pid));
        }
    });
    found
}

pub(super) fn owns(owner: &str, exe: &str) -> bool {
    let name = name(exe);
    if owner == "DSH" { matches!(name, "DeepSeek Harness" | "DSH Desktop (anywhere)") }
    else { name == owner }
}

pub(super) fn preferred_window(windows: &[(String, u32)], owner: Option<&str>) -> Option<usize> {
    owner.and_then(|owner| windows.iter().position(|(exe, _)| exe.eq_ignore_ascii_case(owner)))
        .or_else(|| (!windows.is_empty()).then_some(0))
}

pub(super) fn exe_for(owner: &str, windows: &[(String, u32)]) -> Option<String> {
    windows.iter().find(|(exe, _)| owns(owner, exe))
        .map(|(exe, _)| exe.clone()).or_else(|| {
            APPS.iter().flat_map(|app| win32::process_tree::process_ids_named(&format!("{app}.exe")))
                .filter_map(win32::process::image_path).find(|exe| owns(owner, exe))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn distinguishes_identical_product_names() {
        assert_eq!(identity("dsh desktop", Some(&json!({"repository":{"url":"https://github.com/dataelement/dsh-desktop"}}))), "DSH Desktop (dataelement)");
        assert_eq!(identity("dsh desktop", Some(&json!({"repository":"https://github.com/anywhere-labs/dsh-desktop"}))), "DSH Desktop (anywhere)");
        assert_eq!(identity("dsh desktop", None), "DSH Desktop");
        assert_eq!(identity("deepseek harness", None), "DeepSeek Harness");
        assert_eq!(identity("dsh-desktop-next", None), "DSH Desktop (anywhere)");
    }
    #[test]
    fn prefers_full_owner_path_else_frontmost_window() {
        let windows = vec![("D:/one/DSH Desktop.exe".into(), 1), ("D:/two/DSH Desktop.exe".into(), 2)];
        assert_eq!(preferred_window(&windows, Some("d:/TWO/DSH Desktop.exe")), Some(1));
        assert_eq!(preferred_window(&windows, Some("D:/missing.exe")), Some(0));
        assert_eq!(preferred_window(&[], None), None);
    }
    #[test]
    fn reads_only_bounded_asar_package_metadata() {
        let manifest = br#"{"repository":"https://github.com/dataelement/dsh-desktop"}"#;
        let header = serde_json::to_vec(&json!({"files":{"package.json":{"size":manifest.len(),"offset":"0"}}})).unwrap();
        let mut archive = Vec::new();
        for value in [4u32, header.len() as u32 + 8, header.len() as u32 + 4, header.len() as u32] {
            archive.extend(value.to_le_bytes());
        }
        archive.extend(header);
        archive.extend(manifest);
        assert_eq!(identity("dsh desktop", read_package(&mut std::io::Cursor::new(&archive)).as_ref()), "DSH Desktop (dataelement)");
        archive.truncate(18);
        assert!(read_package(&mut std::io::Cursor::new(archive)).is_none());
        assert!(read_package(&mut std::io::Cursor::new([255u8;16])).is_none());
    }
    #[test]
    fn validates_next_directory_record() {
        assert_eq!(next_home(&json!({"home":"D:/fictional-next"})), Some(PathBuf::from("D:/fictional-next")));
        assert!(next_home(&json!({"home":"../relative"})).is_none());
        assert!(next_home(&json!({"home":42})).is_none());
        assert_eq!(selected_home(&json!({"version":1,"activeHome":"D:/fictional-custom"})), Some(PathBuf::from("D:/fictional-custom")));
        assert!(selected_home(&json!({"version":2,"activeHome":"D:/fictional-custom"})).is_none());
        assert!(selected_home(&json!({"version":1,"activeHome":"relative"})).is_none());
    }
    #[test]
    fn enumerates_isolated_and_shared_stores() {
        let roots = roots(Path::new("D:/fictional"), Some(PathBuf::from("D:/roaming")));
        assert_eq!(roots.len(), 3);
        assert_eq!(roots[0].0, PathBuf::from("D:/roaming/dsh-desktop/harness"));
        assert_eq!(roots[1].0, PathBuf::from("D:/fictional/.dsh"));
        assert_eq!(roots[2].0, PathBuf::from("D:/fictional/.dsh-beta"));
    }
}
