mod agent_approval;
mod agent_status;
mod calendar;
mod claude_usage;
mod clipboard_history;
mod dev_lane;
mod device_events;
mod device_use;
mod file_shelf;
mod island;
mod local_api;
mod lyrics;
mod media_control;
mod messenger_activation;
mod notification_diagnostics;
mod pets;
mod plugin_host;
mod mail;
mod qq_notifications;
mod settings_window;
mod system;
mod system_levels;
mod todos;
mod translation;
mod tray;
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
    let mut context = tauri::generate_context!();
    if let Some(identifier) = notification_diagnostics::verification_identifier() {
        context.config_mut().identifier = identifier;
    }
    // `pnpm dev:lane`: a preview next to the user's island, with its own data.
    if let Some(lane) = dev_lane::lane() {
        context.config_mut().identifier = dev_lane::identifier(lane);
    }
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let _ = island::show_island(app);
            // A focusd:// link opened while the island runs (plugin_host/uri.rs).
            if let Some(link) = plugin_host::find_link(&args) {
                plugin_host::open_link(app, link, false);
            }
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
        .setup(|app| {
            tray::build_tray(app)?;
            if let Err(error) = clipboard_history::init(app.handle()) {
                eprintln!("failed to initialize clipboard history: {error}");
            }
            translation::init(app.handle());
            if let Err(error) = file_shelf::init(app.handle()) {
                eprintln!("failed to initialize the file shelf: {error}");
            }
            if let Err(error) = todos::init(app.handle()) {
                eprintln!("failed to initialize the todo store: {error}");
            }
            if let Err(error) = agent_approval::init(app.handle()) {
                eprintln!("failed to start the agent approval endpoint: {error}");
            }
            if let Err(error) = local_api::init(app.handle()) {
                eprintln!("failed to initialize the local API: {error}");
            }
            if let Err(error) = plugin_host::init(app.handle()) {
                eprintln!("failed to initialize plugins: {error}");
            }
            let args: Vec<String> = std::env::args().collect();
            if let Some(link) = plugin_host::find_link(&args) {
                plugin_host::open_link(app.handle(), link, true);
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
            if let Err(error) = notification_diagnostics::start(app.handle()) {
                eprintln!("failed to initialize notification diagnostics: {error}");
            }
            if let Ok(window) = island::main_window(app.handle()) {
                if let Err(error) = island::apply_stage_geometry(
                    &window,
                    island::IslandWindowState::default(),
                    false,
                ) {
                    eprintln!("failed to size and position island window: {error}");
                }
                island::start_monitor_follow_loop(window.clone());
                island::start_cursor_passthrough_loop(window);
            }
            system::fullscreen::start(app.handle());
            system_levels::init(app.handle());
            device_events::init(app.handle());
            Ok(())
        })
        .invoke_handler(collect_commands!([]
            file_shelf;
            local_api;
            plugin_host;
            mail;
            wechat_reminders;
            qq_notifications;
            island;
            todos;
            system;
            system_levels;
            device_events;
            agent_status;
            calendar;
            agent_approval;
            claude_usage;
            device_use;
            media_control;
            lyrics;
            clipboard_history;
            translation;
            settings_window;
            pets
        ))
        .build(context)
        .map(|app| {
            app.run(|_, event| {
                // Hooks still waiting go back to the terminal rather than hit their timeout.
                if let tauri::RunEvent::Exit = event {
                    agent_approval::shutdown();
                }
            })
        });
    if let Err(error) = result {
        eprintln!("error while running FocuSD Island: {error}");
        std::process::exit(1);
    }
}
