use std::{fs, path::{Component, Path, PathBuf}};
use super::{download, manifest, PluginError};
use super::helper_exit::{report_path, split_report, take_report, unique_suffix, HelperError, HelperFailure, REPORT_ARG};
use crate::win32::media_plugin_elevation::HelperRun;

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
/// Temp files this module leaves next to `target_name`: the fixed name older versions
/// used (`msimg32.focusd-tmp`) and this version's per-run names
/// (`msimg32.dll.<pid>-<nanos>.focusd-tmp`). Nothing else in the folder matches.
pub(super) fn is_own_temp(name: &str, target_name: &str) -> bool {
    let (name, target) = (name.to_ascii_lowercase(), target_name.to_ascii_lowercase());
    let stem = target.rsplit_once('.').map_or(target.as_str(), |(stem, _)| stem);
    name == format!("{stem}.focusd-tmp")
        || (name.len() > target.len() + ".focusd-tmp".len()
            && name.starts_with(&format!("{target}."))
            && name.ends_with(".focusd-tmp"))
}
/// Removes temp files a failed or interrupted earlier run left, which made the next
/// `create_new` fail. Best effort: a folder we may not write is handled by the caller.
fn remove_stale_temps(target: &Path) {
    let (Some(dir), Some(target_name)) = (target.parent(), target.file_name().and_then(|n| n.to_str())) else { return };
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let is_file = entry.file_type().is_ok_and(|t| t.is_file());
        if is_file && entry.file_name().to_str().is_some_and(|name| is_own_temp(name, target_name)) {
            let _ = fs::remove_file(entry.path());
        }
    }
}
fn temp_path(target: &Path) -> PathBuf {
    let name = target.file_name().map_or_else(|| "file".into(), |n| n.to_string_lossy().into_owned());
    target.with_file_name(format!("{name}.{}.focusd-tmp", unique_suffix()))
}
fn atomic_copy_io(source: &Path, target: &Path, sha256: &str) -> std::io::Result<()> {
    use std::io::{Error, ErrorKind, Write};
    remove_stale_temps(target);
    let temp = temp_path(target);
    let bytes = fs::read(source)?;
    let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&temp)?;
    let result = (|| {
        output.write_all(&bytes)?;
        output.sync_all()?;
        drop(output);
        let written = download::hash(&temp).map_err(|e| if e.kind() == ErrorKind::NotFound {
            Error::new(ErrorKind::PermissionDenied, "The file vanished right after it was written, most likely removed by security software")
        } else { e })?;
        if written != sha256 { return Err(Error::new(ErrorKind::InvalidData, "SHA256 changed before copy")); }
        if target.file_name().is_some_and(|n| n.eq_ignore_ascii_case("msimg32.dll")) {
            // A loader that appeared after discovery must never be overwritten.
            crate::win32::media_plugin_elevation::move_new(&temp, target)
        } else { replace(&temp, target) }
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result
}
/// A file error outside the helper: security software gets its own message too.
fn plugin_io_error(error: std::io::Error) -> PluginError {
    match HelperFailure::of_io(&error) {
        failure @ (HelperFailure::VirusBlocked | HelperFailure::FileLocked) => failure.to_error(0, Some(error.to_string())),
        _ => PluginError::from(error),
    }
}
pub(super) fn atomic_copy(source: &Path, target: &Path, sha256: &str) -> Result<(), PluginError> {
    atomic_copy_io(source, target, sha256).map_err(plugin_io_error)
}
pub(super) fn copy(source: &Path, target: &Path, hash: &str) -> Result<(), PluginError> {
    match atomic_copy_io(source, target, hash) {
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => elevate(Some(source), target, hash),
        result => result.map_err(plugin_io_error),
    }
}
pub(super) fn remove(target: &Path, hash: &str) -> Result<(), PluginError> {
    if download::hash(target)? != hash { return Err(PluginError::new("HashMismatch", "File changed before removal")); }
    match fs::remove_file(target) {
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => elevate(None, target, hash),
        result => result.map_err(plugin_io_error),
    }
}
fn elevate(source: Option<&Path>, target: &Path, hash: &str) -> Result<(), PluginError> {
    if !valid_target(target) || !manifest::loader_hash(hash) { return Err(PluginError::new("Io", "Invalid elevated target")); }
    let mut args = vec![if source.is_some() { "--media-plugin-copy".to_string() } else { "--media-plugin-remove".to_string() }];
    if let Some(source) = source { args.push(source.to_string_lossy().into_owned()); }
    args.push(target.to_string_lossy().into_owned()); args.push(hash.to_string());
    let report = report_path();
    args.push(format!("{REPORT_ARG}{}", report.to_string_lossy()));
    let result = crate::win32::media_plugin_elevation::run(&args);
    let report = take_report(&report);
    result.map_err(|error| match error {
        HelperRun::Declined => PluginError::new("UserDeclined", "UserDeclined"),
        HelperRun::Exited(code) => HelperFailure::from_code(code).to_error(code, report),
        HelperRun::Failed(detail) => PluginError::new("Io", detail),
    })
}
pub(super) fn execute(args: &[String]) -> Result<(), HelperError> {
    let (source, target, hash) = match args {
        [mode, source, target, hash] if mode == "--media-plugin-copy" => (Some(Path::new(source)), Path::new(target), hash),
        [mode, target, hash] if mode == "--media-plugin-remove" => (None, Path::new(target), hash),
        _ => return Err(HelperError::new(HelperFailure::InvalidArgs, "Invalid helper arguments")),
    };
    if !manifest::loader_hash(hash) { return Err(HelperError::new(HelperFailure::InvalidArgs, "Unknown loader hash")); }
    if !valid_target(target) {
        // The parent checked the same path; failing here means the elevated process sees
        // a different file system, which is what a mapped or subst drive looks like.
        let parent = target.parent().unwrap_or(target);
        return Err(if parent.exists() {
            HelperError::new(HelperFailure::InvalidTarget, format!("Invalid helper target: {}", target.display()))
        } else {
            HelperError::new(HelperFailure::TargetUnavailable, format!("{} is not visible to the administrator process", parent.display()))
        });
    }
    // 复制新加载器不受运行中的网易云影响（它启动时才载入）；删除时它可能正被占用。
    if source.is_none() && super::netease::running() { return Err(HelperError::new(HelperFailure::NeedsClose, "cloudmusic.exe is running")); }
    if let Some(source) = source {
        let source_hash = download::hash(source)
            .map_err(|e| HelperError::new(HelperFailure::of_io(&e), format!("Cannot read {}: {e}", source.display())))?;
        if source_hash != *hash { return Err(HelperError::new(HelperFailure::HashMismatch, "Source hash mismatch")); }
        // Never overwrite a loader, even if one appears between discovery and elevation.
        if target.exists() { return Err(HelperError::new(HelperFailure::LoaderExists, "Loader already exists")); }
        atomic_copy_io(source, target, hash).map_err(|e| if e.kind() == std::io::ErrorKind::InvalidData {
            HelperError::new(HelperFailure::HashMismatch, e.to_string())
        } else { HelperError::from(e) })
    } else {
        if download::hash(target)? != *hash { return Err(HelperError::new(HelperFailure::HashMismatch, "Target hash mismatch")); }
        fs::remove_file(target)?; Ok(())
    }
}
/// Writes the helper's message where the parent asked, but only into a fresh file of
/// the expected name: the helper runs elevated and must not become a way to overwrite files.
fn write_report(path: &Path, detail: &str) {
    use std::io::Write;
    let expected = path.file_name().and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with("focusd-plugin-helper-") && n.ends_with(".txt"));
    if expected {
        if let Ok(mut file) = fs::OpenOptions::new().write(true).create_new(true).open(path) {
            let _ = file.write_all(detail.as_bytes());
        }
    }
}
pub(super) fn handle_startup() {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.iter().any(|arg| arg.starts_with("--media-plugin-")) {
        let (args, report) = split_report(&args);
        let code = match execute(args) {
            Ok(()) => 0,
            Err(error) => {
                if let Some(report) = report { write_report(&report, &error.detail); }
                error.failure.code()
            }
        };
        std::process::exit(code);
    }
}
