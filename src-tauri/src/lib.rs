mod agent_status;
mod clipboard_history;
mod island;
mod media_control;
mod messenger_activation;
mod notification_diagnostics;
mod qq_notifications;
mod qq_mail;
mod settings_window;
mod system;
mod wechat_reminder_source;
mod wechat_reminders;
mod translation;
mod tray;

use tauri::WindowEvent;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    if let Some(identifier) = notification_diagnostics::verification_identifier() {
        context.config_mut().identifier = identifier;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = island::show_island(app);
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
                return;
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
            if let Err(error) = qq_mail::init(app.handle()) {
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
                if let Err(error) = island::apply_stage_geometry(&window, island::IslandWindowState::default(), false) {
                    eprintln!("failed to size and position island window: {error}");
                }
                island::start_cursor_passthrough_loop(window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            qq_mail::get_qq_mail_state,
            qq_mail::connect_qq_mail,
            qq_mail::set_qq_mail_enabled,
            qq_mail::refresh_qq_mail,
            qq_mail::read_qq_mail,
            qq_mail::disconnect_qq_mail,
            wechat_reminders::get_wechat_reminder_state,
            wechat_reminders::set_wechat_reminders_enabled,
            wechat_reminders::open_wechat,
            qq_notifications::get_qq_notification_state,
            qq_notifications::set_qq_notifications_enabled,
            qq_notifications::request_qq_notification_access,
            qq_notifications::open_qq_notification_settings,
            qq_notifications::clear_qq_notifications,
            qq_notifications::open_qq,
            island::set_island_layout,
            island::set_island_interaction,
            island::start_island_drag,
            island::reset_island_position,
            island::get_island_top_attachment,
            system::todo_export::save_todo_markdown,
            system::todo_export::get_default_todo_save_directory,
            island::show_ready_island,
            island::minimize_island,
            system::startup::get_launch_at_startup,
            system::startup::set_launch_at_startup,
            system::updater::get_updater_proxy,
            system::updater::updater_configured,
            agent_status::get_agent_status,
            agent_status::clear_agent_status,
            agent_status::install_agent_status_hooks,
            media_control::get_media_state,
            media_control::get_audio_level,
            media_control::media_play_pause,
            media_control::media_next,
            media_control::media_previous,
            media_control::media_toggle_shuffle,
            media_control::media_cycle_repeat,
            media_control::media_seek,
            media_control::media_set_volume,
            clipboard_history::get_clipboard_history,
            clipboard_history::set_clipboard_history_settings,
            clipboard_history::copy_clipboard_history_item,
            clipboard_history::toggle_clipboard_history_favorite,
            clipboard_history::set_clipboard_history_item_note,
            clipboard_history::delete_clipboard_history_item,
            clipboard_history::clear_clipboard_history,
            translation::toggle_translation_window,
            translation::hide_translation_window,
            translation::read_translation_clipboard,
            translation::copy_translation_result,
            translation::has_translation_secret,
            translation::save_translation_secret,
            translation::delete_translation_secret,
            translation::translate_text,
            translation::set_translation_shortcut,
            settings_window::open_settings_window,
        ])
        .run(context)
        .expect("error while running FocuSD Island");
}
