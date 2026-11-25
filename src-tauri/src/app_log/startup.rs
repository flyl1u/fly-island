use tauri::AppHandle;
use windows::Win32::System::Registry::HKEY_LOCAL_MACHINE;

use super::{event, Category};

pub(super) fn record(app: &AppHandle) {
    let read = |value| crate::win32::registry::read_string(HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion", value).unwrap_or_default();
    event(Category::Startup, "version", &[
        ("reason", "launch"), ("app", &app.package_info().version.to_string()),
        ("windows", &read("DisplayVersion")), ("build", &read("CurrentBuild")),
        ("webview", &tauri::webview_version().unwrap_or_default()),
    ]);
    match app.available_monitors() {
        Ok(monitors) => {
            let primary = app.primary_monitor().ok().flatten();
            event(Category::Startup, "monitors", &[("reason", "launch"), ("count", &monitors.len().to_string())]);
            for monitor in monitors.iter().take(32) {
                let pos = monitor.position();
                let size = monitor.size();
                event(Category::Startup, "monitor", &[
                    ("reason", "launch"), ("primary", if primary.as_ref().is_some_and(|item| item.position() == pos) { "true" } else { "false" }),
                    ("position", &format!("{},{}", pos.x, pos.y)), ("resolution", &format!("{}x{}", size.width, size.height)),
                    ("scale", &format!("{:.3}", monitor.scale_factor())),
                ]);
            }
        }
        Err(_) => event(Category::Startup, "monitors", &[("reason", "unavailable")]),
    }
    let _ = std::thread::Builder::new().name("app-log-taskbar".into()).spawn(|| {
        let (edge, auto_hide) = crate::win32::taskbar_edge::diagnostic_state();
        event(Category::Startup, "taskbar", &[("reason", "launch"), ("edge", edge), ("auto_hide", &auto_hide.to_string())]);
    });
}

pub(crate) fn record_plugins(app: &AppHandle) {
    use tauri::Manager;
    let Some(host) = app.try_state::<crate::plugin_host::PluginHost>() else {
        event(Category::Startup, "plugins", &[("reason", "host_unavailable")]);
        return;
    };
    let installed = host.public_snapshot().registry.installed;
    event(Category::Startup, "plugins", &[("reason", "launch"), ("count", &installed.len().to_string())]);
    for (id, plugin) in installed.iter().take(96) {
        event(Category::Startup, "plugin", &[
            ("reason", "launch"), ("id", id), ("version", &plugin.manifest.version), ("enabled", &plugin.enabled.to_string()),
        ]);
    }
}
