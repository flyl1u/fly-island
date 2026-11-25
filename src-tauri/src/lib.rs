mod agent_approval;
mod app_log;
mod agent_status;
mod clipboard_history;
mod clipboard_window;
mod config_transfer;
mod file_shelf;
mod island;
mod lyrics;
mod media_control;
mod media_plugins;
mod legacy_migration;
mod plugin_host;
mod eye_care;
mod device_battery;
mod release_flags;
mod messenger_activation;
mod notification_diagnostics;
mod mail;
mod qq_notifications;
mod settings_window;
mod system;
mod translation;
mod tray;
mod office_im;
mod weather;
mod wechat_reminders;
mod win32;

use tauri::WindowEvent;

/// Chains each module's `tauri_commands!` list into a single `generate_handler!`.
macro_rules! collect_commands {
    ([$($done:tt)*]) => {
        tauri::generate_handler![$($done)*]
    };
    ([$($done:tt)*] $module:ident $(; $rest:ident)*) => {
        $module::tauri_commands!(collect_commands [$($done)*] $($rest);*)
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let verification_identifier = notification_diagnostics::verification_identifier();
    let isolated = verification_identifier.is_some();
    // Migrate the old app-data roots before Tauri creates its first WebView; if that fails, stop
    // here rather than let Tauri create empty new ones (the next launch retries).
    // A verification instance already has its own roots and must leave real startup entries alone.
    if !isolated && !legacy_migration::run() {
        return;
    }
    system::startup::note_launch();
    media_plugins::handle_startup();
    agent_status::uninstall::handle_startup();
    let mut context = tauri::generate_context!();
    if let Some(identifier) = verification_identifier {
        context.config_mut().identifier = identifier;
    }
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::on_relaunch(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|window, event| {
            if window.label() == "translation" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
                return;
            }
            if window.label() != island::WINDOW_LABEL {
                return;
            }

            if let WindowEvent::Moved(position) = event {
                island::record_dragged_position(*position);
            }

            // Native Acrylic/Region is intentionally not reapplied on DPI
            // changes. Liquid glass is rendered inside the island element.
        })
        .setup(move |app| {
            config_transfer::prepare(app.handle());
            // First, so whatever goes wrong while the rest starts is in the log.
            app_log::init(app.handle());
            tray::build_tray(app)?;
            if let Err(error) = clipboard_history::init(app.handle()) {
                eprintln!("failed to initialize clipboard history: {error}");
            }
            translation::init(app.handle());
            if let Err(error) = file_shelf::init(app.handle()) {
                eprintln!("failed to initialize the file shelf: {error}");
            }
            if let Err(error) = agent_approval::init(app.handle()) {
                eprintln!("failed to start the agent approval endpoint: {error}");
            }
            if let Err(error) = mail::init(app.handle()) {
                eprintln!("failed to initialize QQ mail: {error}");
            }
            if let Err(error) = qq_notifications::init(app.handle()) {
                eprintln!("failed to initialize QQ notifications: {error}");
            }
            if let Err(error) = wechat_reminders::init(app.handle()) {
                eprintln!("failed to initialize WeChat reminders: {error}");
            }
            if let Err(error) = office_im::init(app.handle()) {
                eprintln!("failed to initialize office reminders: {error}");
            }
            if let Err(error) = notification_diagnostics::start(app.handle()) {
                eprintln!("failed to initialize notification diagnostics: {error}");
            }
            if let Ok(window) = island::main_window(app.handle()) {
                island::start_taskbar_tracking(window.clone());
                if let Err(error) = island::apply_stage_geometry(
                    &window,
                    island::IslandWindowState::default(),
                    false,
                ) {
                    eprintln!("failed to size and position island window: {error}");
                }
                // A transparent topmost window in Alt+Tab took the user's quick Alt+Tab after
                // hover focus made it the last active window (docs/investigations).
                if !window.hwnd().is_ok_and(win32::task_switcher::hide_from_task_switcher) {
                    eprintln!("failed to keep the island window out of Alt+Tab");
                }
                island::start_monitor_follow_loop(window.clone());
                island::start_cursor_passthrough_loop(window);
            }
            system::fullscreen::start(app.handle());
            media_plugins::init(app.handle());
            if let Err(error) = plugin_host::init(app.handle()) {
                eprintln!("failed to initialize plugins: {error}");
            }
            app_log::record_plugins(app.handle());
            agent_status::reply_marker::init();
            agent_status::workbuddy_connection::init(app.handle());
            if !isolated {
                agent_status::hook_migration::repair_legacy_hooks(app.handle());
                system::startup::upgrade_legacy_value();
            }
            Ok(())
        })
        .invoke_handler(collect_commands!([]
            file_shelf;
            mail;
            wechat_reminders;
            office_im;
            qq_notifications;
            island;
            system;
            agent_status;
            agent_approval;
            media_control;
            media_plugins;
            plugin_host;
            eye_care;
            device_battery;
            lyrics;
            clipboard_history;
            translation;
            settings_window
            ; tray
            ; clipboard_window
            ; app_log
            ; config_transfer
            ; weather
        ))
        .build(context)
        .map(|app| {
            app.run(|handle, event| {
                // Hooks still waiting go back to the terminal rather than hit their timeout.
                if let tauri::RunEvent::Exit = event {
                    clipboard_window::remember_bounds(handle);
                    agent_approval::shutdown();
                    wechat_reminders::shutdown();
                    plugin_host::shutdown(handle);
                }
            })
        });
    if let Err(error) = result {
        eprintln!("error while running Fly Island: {error}");
        std::process::exit(1);
    }
}
