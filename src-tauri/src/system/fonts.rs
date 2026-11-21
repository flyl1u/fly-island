//! Lists installed Windows fonts on request from the appearance settings.

use serde::Serialize;

#[derive(Serialize)]
pub(crate) struct InstalledFont {
    family: String,
    label: String,
}

#[tauri::command]
pub async fn list_installed_fonts(locale: String) -> Result<Vec<InstalledFont>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let fonts = crate::win32::fonts::installed_families(locale == "zh-CN")
            .map_err(|error| format!("Failed to read installed Windows fonts: {error}"))?;
        Ok(fonts
            .into_iter()
            .map(|(family, label)| InstalledFont { family, label })
            .collect())
    })
    .await
    .map_err(|error| format!("Failed to join the font enumeration task: {error}"))?
}
