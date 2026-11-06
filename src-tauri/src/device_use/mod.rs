//! Which apps are using the camera or the microphone right now, for the indicator on the collapsed
//! island. Windows records each app's last use under
//! `HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\<webcam|microphone>`:
//! Store apps as direct subkeys ("Microsoft.WindowsCamera_8wekyb3d8bbwe"), desktop programs under
//! `NonPackaged` with `#` in place of `\` ("C:#Program Files#Zoom#Zoom.exe"). An app whose
//! `LastUsedTimeStart` is set while `LastUsedTimeStop` is 0 is using the device now; the taskbar's
//! privacy icons read the same. Undocumented, so anything unexpected counts as not in use.

use serde::Serialize;
use windows::Win32::System::Registry::HKEY_CURRENT_USER;

use crate::win32::registry::{read_u64, subkey_names};

const CONSENT_STORE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore";
const NON_PACKAGED: &str = "NonPackaged";

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceUse {
    /// Names of the apps using the camera, sorted, without repeats.
    camera: Vec<String>,
    microphone: Vec<String>,
}

/// Whether a use recorded as `start` and `stop` (FILETIMEs; 0 or missing when never) is ongoing.
fn in_use(start: Option<u64>, stop: Option<u64>) -> bool {
    start.is_some_and(|start| start > 0) && stop == Some(0)
}

/// A readable name for a consent store key: the program of a desktop path
/// ("C:#Program Files#Zoom#Zoom.exe" → "Zoom"), the app of a Store package
/// ("Microsoft.WindowsCamera_8wekyb3d8bbwe" → "WindowsCamera").
fn app_label(key: &str, packaged: bool) -> String {
    if !packaged {
        let file = key.rsplit(['#', '\\', '/']).next().unwrap_or(key);
        return file.rsplit_once('.').map_or(file, |(stem, _)| stem).to_string();
    }
    let name = key.rsplit_once('_').map_or(key, |(name, _)| name);
    name.split_once('.').map_or(name, |(_, app)| app).to_string()
}

fn apps_using(device: &str) -> Vec<String> {
    let base = format!(r"{CONSENT_STORE}\{device}");
    let mut apps = Vec::new();
    let mut visit = |parent: &str, packaged: bool| {
        for key in subkey_names(HKEY_CURRENT_USER, parent) {
            if packaged && key == NON_PACKAGED {
                continue;
            }
            let path = format!(r"{parent}\{key}");
            let start = read_u64(HKEY_CURRENT_USER, &path, "LastUsedTimeStart");
            let stop = read_u64(HKEY_CURRENT_USER, &path, "LastUsedTimeStop");
            if in_use(start, stop) {
                apps.push(app_label(&key, packaged));
            }
        }
    };
    visit(&base, true);
    visit(&format!(r"{base}\{NON_PACKAGED}"), false);
    apps.sort_by_key(|app| app.to_lowercase());
    apps.dedup();
    apps
}

/// The apps using the camera and the microphone now. Reads a few dozen registry values, well
/// under a millisecond, so the island asks every couple of seconds while the indicator is on.
#[tauri::command]
pub fn get_device_use() -> DeviceUse {
    DeviceUse { camera: apps_using("webcam"), microphone: apps_using("microphone") }
}

/// Opens Windows' privacy page listing the apps allowed to use `device` ("camera" or "microphone").
#[tauri::command]
pub fn open_device_privacy_settings(device: String) -> Result<(), String> {
    let page = match device.as_str() {
        "camera" => "ms-settings:privacy-webcam",
        "microphone" => "ms-settings:privacy-microphone",
        _ => return Err(format!("Unknown device: {device}")),
    };
    tauri_plugin_opener::open_url(page, None::<&str>).map_err(|error| error.to_string())
}

/// This module's Tauri commands, chained into `lib.rs`'s `generate_handler!`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::device_use::get_device_use,
            crate::device_use::open_device_privacy_settings,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_use_is_ongoing_while_it_has_started_and_not_stopped() {
        assert!(in_use(Some(133_000_000_000_000_000), Some(0)));
        assert!(!in_use(Some(133_000_000_000_000_000), Some(133_000_000_000_000_001)));
        assert!(!in_use(Some(0), Some(0)));
        assert!(!in_use(None, Some(0)));
        assert!(!in_use(Some(1), None));
    }

    #[test]
    fn keys_are_named_after_the_program_or_the_store_app() {
        assert_eq!(app_label(r"C:#Program Files#Zoom#bin#Zoom.exe", false), "Zoom");
        assert_eq!(app_label(r"C:#Users#a#AppData#Local#Discord#app-1.0#Discord.exe", false), "Discord");
        assert_eq!(app_label("Microsoft.WindowsCamera_8wekyb3d8bbwe", true), "WindowsCamera");
        assert_eq!(app_label("OpenAI.Codex_2p2nqsd0c76g0", true), "Codex");
        assert_eq!(app_label("SomeApp", true), "SomeApp");
    }

    #[test]
    fn reading_the_consent_store_gives_sorted_lists_without_repeats() {
        let now = get_device_use();
        for list in [&now.camera, &now.microphone] {
            let mut sorted = list.clone();
            sorted.sort_by_key(|app| app.to_lowercase());
            sorted.dedup();
            assert_eq!(&sorted, list);
        }
    }
}
