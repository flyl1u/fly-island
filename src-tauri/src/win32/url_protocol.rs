//! Registers a URL scheme (`focusd://...`) for the current user, so that
//! Windows starts the island with the link as its argument. HKCU needs no
//! administrator rights and is what an installer would write for one user.

use windows::{
    core::HSTRING,
    Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ},
};

use super::registry::read_string;

/// Points `scheme:` links at `command` (e.g. `"C:\...\app.exe" "%1"`).
/// Leaves the registry alone when it already says so.
pub(crate) fn register(scheme: &str, description: &str, command: &str) -> Result<(), String> {
    let key = format!(r"Software\Classes\{scheme}");
    let command_key = format!(r"{key}\shell\open\command");
    if read_string(HKEY_CURRENT_USER, &command_key, "").as_deref() == Some(command) {
        return Ok(());
    }
    write(&key, "", &format!("URL:{description}"))?;
    write(&key, "URL Protocol", "")?;
    write(&command_key, "", command)
}

/// Writes a `REG_SZ` value, creating the key if needed; `name` "" is the default value.
fn write(subkey: &str, name: &str, data: &str) -> Result<(), String> {
    let wide: Vec<u16> = data.encode_utf16().chain(Some(0)).collect();
    let (subkey_text, name_text) = (HSTRING::from(subkey), HSTRING::from(name));
    // SAFETY: the key and value names are NUL-terminated wide strings, and
    // `wide` is a NUL-terminated UTF-16 buffer of exactly the size passed; all
    // outlive the call, which only reads them.
    let result = unsafe {
        RegSetKeyValueW(
            HKEY_CURRENT_USER,
            &subkey_text,
            &name_text,
            REG_SZ.0,
            Some(wide.as_ptr().cast()),
            (wide.len() * 2) as u32,
        )
    };
    result.ok().map_err(|error| format!(r"Could not write HKCU\{subkey}: {error}"))
}
