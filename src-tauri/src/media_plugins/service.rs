use std::{fs, path::Path, time::{SystemTime, UNIX_EPOCH}};
use serde::Serialize;
use super::{download, elevated, manifest, netease, progress, record::{self, InstalledFile, Record}, PluginError};
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationResult { pub kept_foreign_loader: bool, pub preserved_files: Vec<String> }
fn ensure_closed() -> Result<(), PluginError> {
    if netease::running() { Err(PluginError::new("NeedsClose", "cloudmusic.exe is running")) } else { Ok(()) }
}
pub(super) async fn install(app: &tauri::AppHandle, data: &Path) -> Result<OperationResult, PluginError> {
    let status = netease::status();
    if !status.supported { return Err(PluginError::new("Unsupported", status.version.unwrap_or_default())); }
    if status.legacy_inf_link { return Err(PluginError::new("LegacyConflict", status.plugin_dir.to_string_lossy())); }
    let dir = status.install_dir.ok_or_else(|| PluginError::new("Unsupported", "Install directory unknown"))?;
    // 加载器只在网易云启动时载入：目录里还没有 msimg32.dll 时，运行中的网易云不占用任何要写的文件，
    // 直接装好、重启后生效。已有加载器时它可能正占着插件目录，才需要先退出。
    let loader_present = dir.join("msimg32.dll").exists();
    if loader_present { ensure_closed()?; }
    let loader = if status.arch == Some("x86") { &manifest::X86 } else { &manifest::X64 };
    let downloads = data.join("media-plugins/download");
    progress(app, "downloading");
    let source = download::fetch(&downloads, loader).await?;
    let plugin = download::fetch(&downloads, &manifest::PLUGIN).await?;
    progress(app, "verifying");
    if !download::verify(&source, loader) || !download::verify(&plugin, &manifest::PLUGIN) {
        return Err(PluginError::new("HashMismatch", "Cached download changed"));
    }
    if loader_present { ensure_closed()?; }
    if netease::plugin_state(&dir).1 { return Err(PluginError::new("LegacyConflict", status.plugin_dir.to_string_lossy())); }
    progress(app, "copying");
    fs::create_dir_all(data)?;
    let record_path = data.join("media-plugins.json");
    let mut record = record::read(&record_path);
    record.version = 1;
    record.installed_at = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let target = dir.join("msimg32.dll");
    let existing = match download::hash(&target) {
        Ok(hash) => Some(hash), Err(e) if e.kind() == std::io::ErrorKind::NotFound => None, Err(e) => return Err(e.into()),
    };
    let kept_foreign_loader = existing.as_deref().is_some_and(|hash| !manifest::loader_hash(hash));
    if existing.is_none() {
        elevated::copy(&source, &target, loader.sha256)?;
        record.files.retain(|f| f.path != target);
        record.files.push(InstalledFile { path: target, sha256: loader.sha256.into() });
        // Journal each successful write so a later failure remains uninstallable.
        record::write(&record_path, &record)?;
    }
    fs::create_dir_all(&status.plugin_dir)?;
    let target = status.plugin_dir.join(manifest::PLUGIN.name);
    elevated::atomic_copy(&plugin, &target, manifest::PLUGIN.sha256)?;
    record.files.retain(|f| f.path != target);
    record.files.push(InstalledFile { path: target, sha256: manifest::PLUGIN.sha256.into() });
    record::write(&record_path, &record)?;
    Ok(OperationResult { kept_foreign_loader, preserved_files: vec![] })
}
pub(super) fn allowed_file(file: &InstalledFile) -> bool {
    (file.path == netease::profile().join("plugins").join(manifest::PLUGIN.name) && file.sha256 == manifest::PLUGIN.sha256)
        || (elevated::valid_target(&file.path) && manifest::loader_hash(&file.sha256))
}
pub(super) fn remove_recorded(record: &Record, allowed: impl Fn(&InstalledFile) -> bool) -> Result<Vec<String>, PluginError> {
    let mut preserved = Vec::new();
    for file in &record.files {
        if !file.path.exists() { continue; }
        if !allowed(file) || !record::matches(file) {
            preserved.push(file.path.to_string_lossy().into_owned()); continue;
        }
        elevated::remove(&file.path, &file.sha256)?;
    }
    Ok(preserved)
}
pub(super) fn uninstall(app: &tauri::AppHandle, data: &Path) -> Result<OperationResult, PluginError> {
    ensure_closed()?;
    progress(app, "verifying");
    let path = data.join("media-plugins.json");
    let record = record::read(&path);
    progress(app, "copying");
    let preserved_files = remove_recorded(&record, allowed_file)?;
    match fs::remove_file(path) { Ok(()) => (), Err(e) if e.kind() == std::io::ErrorKind::NotFound => (), Err(e) => return Err(e.into()) }
    Ok(OperationResult { kept_foreign_loader: false, preserved_files })
}
