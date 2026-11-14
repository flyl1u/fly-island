use std::{fs, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
use serde::Serialize;
use super::{download, elevated, manifest, netease, progress, record::{self, InstalledFile, Record}, PluginError};
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationResult { pub kept_foreign_loader: bool, pub preserved_files: Vec<String> }
fn ensure_closed() -> Result<(), PluginError> {
    if netease::running() { Err(PluginError::new("NeedsClose", "cloudmusic.exe is running")) } else { Ok(()) }
}
/// The verified loader and plugin files, bundled with the installer or downloaded.
async fn sources(app: &tauri::AppHandle, data: &Path, loader: &'static manifest::Asset) -> Result<(PathBuf, PathBuf), PluginError> {
    let downloads = data.join("media-plugins/download");
    let bundled = tauri::Manager::path(app).resource_dir().ok().map(|dir| dir.join("media-plugins"));
    progress(app, "downloading");
    let source = download::fetch(&downloads, bundled.as_deref(), loader).await?;
    let plugin = download::fetch(&downloads, bundled.as_deref(), &manifest::PLUGIN).await?;
    progress(app, "verifying");
    if !download::verify(&source, loader) || !download::verify(&plugin, &manifest::PLUGIN) {
        return Err(PluginError::new("HashMismatch", "Cached download changed"));
    }
    Ok((source, plugin))
}
fn loader_of(status: &netease::NeteasePluginStatus) -> &'static manifest::Asset {
    if status.arch == Some("x86") { &manifest::X86 } else { &manifest::X64 }
}
fn checked(status: &netease::NeteasePluginStatus) -> Result<PathBuf, PluginError> {
    if !status.supported { return Err(PluginError::new("Unsupported", status.version.clone().unwrap_or_default())); }
    if status.legacy_inf_link { return Err(PluginError::new("LegacyConflict", status.plugin_dir.to_string_lossy())); }
    status.install_dir.clone().ok_or_else(|| PluginError::new("Unsupported", "Install directory unknown"))
}
fn open_record(data: &Path) -> Result<(PathBuf, Record), PluginError> {
    fs::create_dir_all(data)?;
    let path = data.join("media-plugins.json");
    let mut record = record::read(&path);
    record.version = 1;
    record.installed_at = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    Ok((path, record))
}
fn remember(record_path: &Path, record: &mut Record, path: PathBuf, sha256: &str) -> Result<(), PluginError> {
    record.files.retain(|f| f.path != path);
    record.files.push(InstalledFile { path, sha256: sha256.into() });
    // Journal each successful write so a later failure remains uninstallable.
    record::write(record_path, record)
}
/// The plugin goes into the BetterNCM data folder, which security software rarely guards,
/// so it is placed first: when the loader is then blocked, only that one file is left to copy.
fn place_plugin(status: &netease::NeteasePluginStatus, plugin: &Path, record_path: &Path, record: &mut Record) -> Result<(), PluginError> {
    fs::create_dir_all(&status.plugin_dir)?;
    let target = status.plugin_dir.join(manifest::PLUGIN.name);
    elevated::atomic_copy(plugin, &target, manifest::PLUGIN.sha256)?;
    remember(record_path, record, target, manifest::PLUGIN.sha256)
}
pub(super) async fn install(app: &tauri::AppHandle, data: &Path) -> Result<OperationResult, PluginError> {
    let status = netease::status();
    let dir = checked(&status)?;
    // 加载器只在网易云启动时载入：目录里还没有 msimg32.dll 时，运行中的网易云不占用任何要写的文件，
    // 直接装好、重启后生效。已有加载器时它可能正占着插件目录，才需要先退出。
    let loader_present = dir.join("msimg32.dll").exists();
    if loader_present { ensure_closed()?; }
    let loader = loader_of(&status);
    let (source, plugin) = sources(app, data, loader).await?;
    if loader_present { ensure_closed()?; }
    if netease::plugin_state(&dir).1 { return Err(PluginError::new("LegacyConflict", status.plugin_dir.to_string_lossy())); }
    progress(app, "copying");
    let (record_path, mut record) = open_record(data)?;
    place_plugin(&status, &plugin, &record_path, &mut record)?;
    let target = dir.join("msimg32.dll");
    let existing = match download::hash(&target) {
        Ok(hash) => Some(hash), Err(e) if e.kind() == std::io::ErrorKind::NotFound => None, Err(e) => return Err(e.into()),
    };
    let kept_foreign_loader = existing.as_deref().is_some_and(|hash| !manifest::loader_hash(hash));
    if existing.is_none() {
        elevated::copy(&source, &target, loader.sha256)?;
        remember(&record_path, &mut record, target, loader.sha256)?;
    }
    Ok(OperationResult { kept_foreign_loader, preserved_files: vec![] })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManualInstall { pub staged: PathBuf, pub target_dir: PathBuf }
/// When security software blocks our own write, copying in File Explorer usually goes through:
/// the plugin is placed, the loader is staged as `msimg32.dll` in our data folder, and both
/// folders are opened for the user to drag it across. The target is recorded up front, so a
/// later uninstall removes the copy once it is there and still matches.
pub(super) async fn prepare_manual(app: &tauri::AppHandle, data: &Path) -> Result<ManualInstall, PluginError> {
    let status = netease::status();
    let dir = checked(&status)?;
    let loader = loader_of(&status);
    let (source, plugin) = sources(app, data, loader).await?;
    progress(app, "copying");
    let (record_path, mut record) = open_record(data)?;
    if !download::hash(&status.plugin_dir.join(manifest::PLUGIN.name)).is_ok_and(|hash| hash == manifest::PLUGIN.sha256) {
        place_plugin(&status, &plugin, &record_path, &mut record)?;
    }
    let staging = data.join("media-plugins/manual");
    fs::create_dir_all(&staging)?;
    let staged = staging.join("msimg32.dll");
    if !download::hash(&staged).is_ok_and(|hash| hash == loader.sha256) {
        fs::copy(&source, &staged)?;
        if !download::verify(&staged, loader) { return Err(PluginError::new("HashMismatch", "Staged loader changed")); }
    }
    let target = dir.join("msimg32.dll");
    if !target.exists() { remember(&record_path, &mut record, target, loader.sha256)?; }
    Ok(ManualInstall { staged, target_dir: dir })
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
