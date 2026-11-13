use std::path::PathBuf;
use windows::{core::{HSTRING, PWSTR}, Win32::System::Registry::{RegOpenKeyExW, RegEnumKeyExW, RegCloseKey, HKEY, HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER, KEY_READ}};
use super::registry::read_string;
struct Key(HKEY);
impl Drop for Key {
    fn drop(&mut self) {
        // SAFETY: this key is owned and closed exactly once.
        let _ = unsafe { RegCloseKey(self.0) };
    }
}
pub(crate) fn app_path() -> Vec<PathBuf> {
    [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER].iter().filter_map(|root| {
        read_string(*root, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\cloudmusic.exe", "")
            .map(|s| PathBuf::from(s.trim().trim_matches('"')))
    }).collect()
}
pub(crate) fn uninstall_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        for base in [r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"] {
            let mut key = HKEY::default();
            // SAFETY: base and output key are valid for the call.
            if unsafe { RegOpenKeyExW(root, &HSTRING::from(base), None, KEY_READ, &mut key) }.is_err() { continue; }
            let key = Key(key);
            for index in 0..10000 {
                let mut name = [0u16; 512]; let mut length = name.len() as u32;
                // SAFETY: name has length writable units; optional outputs are unused.
                if unsafe { RegEnumKeyExW(key.0, index, Some(PWSTR(name.as_mut_ptr())), &mut length, None, None, None, None) }.is_err() { break; }
                let subkey = format!("{}\\{}", base, String::from_utf16_lossy(&name[..length as usize]));
                let Some(display) = read_string(root, &subkey, "DisplayName") else { continue; };
                if display != "网易云音乐" && !display.to_ascii_lowercase().contains("cloudmusic") { continue; }
                if let Some(command) = read_string(root, &subkey, "UninstallString") {
                    let command = command.trim();
                    let exe = if let Some(rest) = command.strip_prefix('"') { rest.split('"').next().unwrap_or("") }
                        else { command.split_once(".exe").map_or(command, |(prefix, _)| &command[..prefix.len()+4]) };
                    if let Some(dir) = std::path::Path::new(exe).parent() { paths.push(dir.join("cloudmusic.exe")); }
                }
            }
        }
    }
    paths
}
