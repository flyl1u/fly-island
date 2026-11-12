//! Opt-in activation of WeChat's Qt accessibility provider and restoration of its original flag.

use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use crate::win32::{process_memory::RemoteModule, process_times::start_time};

use super::{
    qt_accessibility_pattern::{self, FlagLocation, CATEGORY},
    PreviewStatus,
};

const MAX_DLL_BYTES: u64 = 384 * 1024 * 1024;

/// This record never contains an address. Crash recovery revalidates the same process and DLL.
#[derive(Deserialize, Serialize)]
struct Recovery {
    pid: u32,
    started_at: u64,
}

pub(super) struct AccessibilityFlag {
    module: RemoteModule,
    location: FlagLocation,
    marker: PathBuf,
}

impl AccessibilityFlag {
    /// A restarted accessibility provider can clear the byte while the same WeChat stays open.
    pub(super) fn reenable_if_cleared(&self) -> bool {
        self.module.read(self.location.check) == Some(self.location.code)
            && self.module.set_data_byte(self.location.flag, 0, 1)
    }

    pub(super) fn activate(
        executable: &Path,
        pid: u32,
        marker: &Path,
        still_enabled: impl Fn() -> bool,
    ) -> Result<Option<Self>, PreviewStatus> {
        if !executable
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("Weixin.exe"))
        {
            return Err(PreviewStatus::Unsupported);
        }
        let module =
            RemoteModule::open(pid, executable, "Weixin.dll").ok_or(PreviewStatus::Unavailable)?;
        let location = checked_location(&module)?;
        match module.read::<1>(location.flag) {
            Some([1]) => return Ok(None), // An accessibility client already owns the flag.
            Some([0]) if still_enabled() => {}
            _ => return Err(PreviewStatus::Unavailable),
        }
        let record = Recovery {
            pid,
            started_at: module.started_at,
        };
        write_marker(marker, &record).map_err(|_| PreviewStatus::Unavailable)?;
        if !still_enabled() || !module.set_data_byte(location.flag, 0, 1) {
            let _ = fs::remove_file(marker);
            return Err(PreviewStatus::Unavailable);
        }
        Ok(Some(Self {
            module,
            location,
            marker: marker.to_owned(),
        }))
    }
}

impl Drop for AccessibilityFlag {
    fn drop(&mut self) {
        if restore(&self.module, &self.location) {
            let _ = fs::remove_file(&self.marker);
        }
    }
}

fn restore(module: &RemoteModule, location: &FlagLocation) -> bool {
    if module.exited() {
        return true;
    }
    if module.read(location.check) != Some(location.code) {
        return false;
    }
    match module.read::<1>(location.flag) {
        Some([1]) => module.set_data_byte(location.flag, 1, 0),
        Some(_) => true,
        None => false,
    }
}

pub(super) fn recover(executable: &Path, marker: &Path) {
    let Ok(bytes) = fs::read(marker) else { return };
    let recovered = serde_json::from_slice::<Recovery>(&bytes)
        .ok()
        .is_none_or(|record| {
            if start_time(record.pid) != Some(record.started_at) {
                return true; // The original process has exited.
            }
            let Some(module) = RemoteModule::open(record.pid, executable, "Weixin.dll") else {
                return false;
            };
            module.started_at == record.started_at
                && checked_location(&module).is_ok_and(|location| restore(&module, &location))
        });
    if recovered {
        let _ = fs::remove_file(marker);
    }
}

fn checked_location(module: &RemoteModule) -> Result<FlagLocation, PreviewStatus> {
    let file = File::open(&module.path).map_err(|_| PreviewStatus::Unavailable)?;
    let length = file
        .metadata()
        .map_err(|_| PreviewStatus::Unavailable)?
        .len();
    if length > MAX_DLL_BYTES {
        return Err(PreviewStatus::Unsupported);
    }
    let mut image = Vec::with_capacity(length as usize);
    file.take(MAX_DLL_BYTES + 1)
        .read_to_end(&mut image)
        .map_err(|_| PreviewStatus::Unavailable)?;
    if image.len() as u64 != length {
        return Err(PreviewStatus::Unsupported);
    }
    let location = qt_accessibility_pattern::locate(&image).ok_or(PreviewStatus::Unsupported)?;
    if module.read(location.check) != Some(location.code)
        || module.read(location.category).as_ref() != Some(CATEGORY)
    {
        return Err(PreviewStatus::Unsupported);
    }
    Ok(location)
}

fn write_marker(path: &Path, record: &Recovery) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec(record)?;
    let mut file = File::create_new(path)?;
    if let Err(error) = file.write_all(&bytes).and_then(|()| file.sync_all()) {
        drop(file);
        let _ = fs::remove_file(path);
        return Err(error);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wechat_reminders::{
        existing_wechat_windows, installed_executable, preferred_window,
    };
    use crate::win32::process::window_process_id;

    #[test]
    #[ignore = "Requires a running Weixin 4.x process; only verifies the DLL mapping and flag"]
    fn installed_module_matches_the_read_only_signature() {
        let executable = installed_executable().unwrap();
        let search = existing_wechat_windows(&executable).unwrap();
        let window = preferred_window(&search.found).expect("WeChat main window");
        let pid = window_process_id(window.handle);
        let module = RemoteModule::open(pid, &executable, "Weixin.dll").expect("mapped Weixin.dll");
        let location = checked_location(&module).unwrap();
        assert!(matches!(module.read::<1>(location.flag), Some([0] | [1])));
    }
}
