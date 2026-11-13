use std::{fs, path::{Path, PathBuf}};
use serde::Serialize;
use crate::win32;
use super::{download, manifest, PluginError};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NeteasePluginStatus {
    pub state: &'static str,
    pub supported: bool,
    pub tested: bool,
    pub version: Option<String>,
    pub arch: Option<&'static str>,
    pub install_dir: Option<PathBuf>,
    pub running: bool,
    pub legacy_inf_link: bool,
    pub plugin_dir: PathBuf,
}
pub(super) fn profile() -> PathBuf {
    std::env::var_os("BETTERNCM_PROFILE").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\betterncm"))
}
pub(super) fn arch(bytes: &[u8]) -> Option<&'static str> {
    if bytes.get(..2)? != b"MZ" { return None; }
    let offset = u32::from_le_bytes(bytes.get(60..64)?.try_into().ok()?) as usize;
    let end = offset.checked_add(6)?;
    let header = bytes.get(offset..end)?;
    if &header[..4] != b"PE\0\0" { return None; }
    match u16::from_le_bytes([header[4], header[5]]) { 0x8664 => Some("x64"), 0x14c => Some("x86"), _ => None }
}
pub(super) fn support(version: Option<&str>, arch: Option<&str>) -> (bool, bool) {
    let Some(parts) = version.and_then(|v| v.split('.').map(str::parse::<u32>).collect::<Result<Vec<_>, _>>().ok()) else { return (false, false); };
    if !(3..=4).contains(&parts.len()) { return (false, false); }
    let v = [parts[0], parts[1], parts[2]];
    let supported = (v[0] == 3 && arch == Some("x64")) || (v == [2,10,13] && arch == Some("x86"));
    (supported, supported && (v == [2,10,13] || ([3,1,20]..=[3,1,41]).contains(&v)))
}
pub(super) fn plugin_state(directory: &Path) -> (&'static str, bool) {
    state_at(directory, &profile().join("plugins"))
}
pub(super) fn state_at(directory: &Path, plugins: &Path) -> (&'static str, bool) {
    let mut legacy = false;
    if let Ok(entries) = fs::read_dir(plugins) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if name.contains("inflink") && name != "inflink-rs.plugin" { legacy = true; }
        }
    }
    let loader = directory.join("msimg32.dll");
    match download::hash(&loader) {
        Ok(hash) if !manifest::loader_hash(&hash) => ("foreignLoader", legacy),
        Ok(_) if plugins.join("InfLink-rs.plugin").is_file() => ("installed", legacy),
        Ok(_) => ("loaderOnly", legacy),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => ("none", legacy),
        Err(_) => ("unknown", legacy),
    }
}
fn executable() -> Option<PathBuf> {
    win32::media_plugin_registry::app_path().into_iter()
        .chain(win32::process_tree::process_ids_named("cloudmusic.exe").into_iter()
            .filter_map(win32::process::image_path).map(PathBuf::from))
        .chain(win32::media_plugin_registry::uninstall_paths())
        .find(|p| p.is_file())
}
pub(super) fn running() -> bool { !win32::process_tree::process_ids_named("cloudmusic.exe").is_empty() }

/// 用户点了“重启网易云”或“关闭网易云并继续”：结束网易云的全部进程，等它退干净，需要时再打开。
pub(super) fn close(relaunch: bool) -> Result<(), PluginError> {
    use std::{os::windows::process::CommandExt, process::Command, time::{Duration, Instant}};
    let exe = executable();
    if running() {
        Command::new("taskkill").args(["/F", "/T", "/IM", "cloudmusic.exe"])
            .creation_flags(crate::system::CREATE_NO_WINDOW).output()?;
        let deadline = Instant::now() + Duration::from_secs(5);
        while running() {
            if Instant::now() > deadline { return Err(PluginError::new("NeedsClose", "cloudmusic.exe did not exit")); }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    if relaunch {
        let exe = exe.ok_or_else(|| PluginError::new("Unsupported", "cloudmusic.exe not found"))?;
        let mut command = Command::new(&exe);
        if let Some(dir) = exe.parent() { command.current_dir(dir); }
        command.spawn()?;
    }
    Ok(())
}
pub(super) fn status() -> NeteasePluginStatus {
    let exe = executable();
    let version = exe.as_deref().and_then(win32::file_version::read);
    let arch = exe.as_deref().and_then(|p| fs::read(p).ok()).as_deref().and_then(arch);
    let (supported, tested) = support(version.as_deref(), arch);
    let install_dir = exe.and_then(|p| p.parent().map(Path::to_path_buf));
    let (state, legacy_inf_link) = install_dir.as_deref().map(plugin_state).unwrap_or(("unknown", false));
    NeteasePluginStatus { state, supported, tested, version, arch, install_dir, running: running(), legacy_inf_link, plugin_dir: profile().join("plugins") }
}
