use std::{fs, path::{Component, Path}};
use super::{download, manifest, PluginError};

pub(super) fn valid_target(path: &Path) -> bool {
    let raw = path.to_string_lossy();
    let safe_ancestors = path.parent().is_some_and(|parent| parent.ancestors().all(|p| {
        use std::os::windows::fs::MetadataExt;
        p.symlink_metadata().is_ok_and(|m| m.file_attributes() & 0x400 == 0)
    }));
    safe_ancestors && !raw.starts_with(r"\\") && path.is_absolute() && !path.components().any(|c| matches!(c, Component::ParentDir | Component::CurDir))
        && !path.to_string_lossy().split(['\\', '/']).any(|p| p == ".." || p == ".")
        && path.file_name().is_some_and(|n| n.eq_ignore_ascii_case("msimg32.dll"))
        && path.parent().is_some_and(|p| p.join("cloudmusic.exe").symlink_metadata().is_ok_and(|m| m.is_file() && !m.file_type().is_symlink()))
        && !path.symlink_metadata().is_ok_and(|m| m.file_type().is_symlink())
}
pub(super) fn replace(source: &Path, target: &Path) -> std::io::Result<()> {
    // MoveFileEx provides atomic replacement on Windows, including existing files.
    crate::win32::media_plugin_elevation::replace(source, target)
}
fn atomic_copy_io(source: &Path, target: &Path, sha256: &str) -> std::io::Result<()> {
    use std::io::Write;
    let temp = target.with_extension("focusd-tmp");
    let bytes = fs::read(source)?;
    let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&temp)?;
    let result = (|| {
        output.write_all(&bytes)?;
        output.sync_all()?;
        drop(output);
        if download::hash(&temp)? != sha256 { return Err(std::io::Error::other("SHA256 changed before copy")); }
        if target.file_name().is_some_and(|n| n.eq_ignore_ascii_case("msimg32.dll")) {
            // A loader that appeared after discovery must never be overwritten.
            crate::win32::media_plugin_elevation::move_new(&temp, target)
        } else { replace(&temp, target) }
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result
}
pub(super) fn atomic_copy(source: &Path, target: &Path, sha256: &str) -> Result<(), PluginError> {
    atomic_copy_io(source, target, sha256).map_err(PluginError::from)
}
pub(super) fn copy(source: &Path, target: &Path, hash: &str) -> Result<(), PluginError> {
    match atomic_copy_io(source, target, hash) {
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => elevate(Some(source), target, hash),
        result => result.map_err(PluginError::from),
    }
}
pub(super) fn remove(target: &Path, hash: &str) -> Result<(), PluginError> {
    if download::hash(target)? != hash { return Err(PluginError::new("HashMismatch", "File changed before removal")); }
    match fs::remove_file(target) {
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => elevate(None, target, hash),
        result => result.map_err(PluginError::from),
    }
}
fn elevate(source: Option<&Path>, target: &Path, hash: &str) -> Result<(), PluginError> {
    if !valid_target(target) || !manifest::loader_hash(hash) { return Err(PluginError::new("Io", "Invalid elevated target")); }
    let mut args = vec![if source.is_some() { "--media-plugin-copy".to_string() } else { "--media-plugin-remove".to_string() }];
    if let Some(source) = source { args.push(source.to_string_lossy().into_owned()); }
    args.push(target.to_string_lossy().into_owned()); args.push(hash.to_string());
    crate::win32::media_plugin_elevation::run(&args).map_err(|e| PluginError::new(if e == "UserDeclined" { "UserDeclined" } else { "Io" }, e))
}
pub(super) fn execute(args: &[String]) -> Result<(), PluginError> {
    let (source, target, hash) = match args {
        [mode, source, target, hash] if mode == "--media-plugin-copy" => (Some(Path::new(source)), Path::new(target), hash),
        [mode, target, hash] if mode == "--media-plugin-remove" => (None, Path::new(target), hash),
        _ => return Err(PluginError::new("Io", "Invalid helper arguments")),
    };
    if !valid_target(target) || !manifest::loader_hash(hash) { return Err(PluginError::new("Io", "Invalid helper target or hash")); }
    // 复制新加载器不受运行中的网易云影响（它启动时才载入）；删除时它可能正被占用。
    if source.is_none() && super::netease::running() { return Err(PluginError::new("NeedsClose", "cloudmusic.exe is running")); }
    if let Some(source) = source {
        if download::hash(source)? != *hash { return Err(PluginError::new("HashMismatch", "Source hash mismatch")); }
        // Never overwrite a loader, even if one appears between discovery and elevation.
        if target.exists() { return Err(PluginError::new("Io", "Loader already exists")); }
        atomic_copy(source, target, hash)
    } else {
        if download::hash(target)? != *hash { return Err(PluginError::new("HashMismatch", "Target hash mismatch")); }
        fs::remove_file(target)?; Ok(())
    }
}
pub(super) fn handle_startup() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.iter().any(|arg| arg.starts_with("--media-plugin-")) {
        std::process::exit(if execute(&args).is_ok() { 0 } else { 1 });
    }
}
