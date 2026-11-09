//! Windows media sessions (SMTC) and the system audio endpoint behind the music page.

mod audio;
mod service;
mod session;


#[tauri::command]
pub async fn get_media_state(target: Option<String>) -> Result<service::MediaState, String> {
    tauri::async_runtime::spawn_blocking(move || service::get_state(target))
        .await
        .map_err(|error| format!("Failed to join the media state task: {error}"))?
}

#[tauri::command]
pub async fn get_audio_level() -> Result<service::AudioLevel, String> {
    tauri::async_runtime::spawn_blocking(service::get_audio_level)
        .await
        .map_err(|error| format!("Failed to join the audio level task: {error}"))?
}

#[tauri::command]
pub async fn media_play_pause(target: Option<String>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::PlayPause, target).await
}

#[tauri::command]
pub async fn media_next(target: Option<String>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::Next, target).await
}

#[tauri::command]
pub async fn media_previous(target: Option<String>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::Previous, target).await
}

#[tauri::command]
pub async fn media_toggle_shuffle(target: Option<String>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::ToggleShuffle, target).await
}

#[tauri::command]
pub async fn media_cycle_repeat(target: Option<String>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::CycleRepeat, target).await
}

#[tauri::command]
pub async fn media_seek(
    position_ms: i64,
    target: Option<String>,
) -> Result<service::MediaState, String> {
    tauri::async_runtime::spawn_blocking(move || service::seek(position_ms, target))
        .await
        .map_err(|error| format!("Failed to join the media seek task: {error}"))?
}

#[tauri::command]
pub async fn media_set_volume(level: f32) -> Result<service::MediaState, String> {
    tauri::async_runtime::spawn_blocking(move || service::set_volume(level))
        .await
        .map_err(|error| format!("Failed to join the media volume task: {error}"))?
}

async fn run_media_command(
    command: service::MediaCommand,
    target: Option<String>,
) -> Result<service::MediaState, String> {
    tauri::async_runtime::spawn_blocking(move || service::run_command(command, target))
        .await
        .map_err(|error| format!("Failed to join the media command task: {error}"))?
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::media_control::get_media_state,
            crate::media_control::get_audio_level,
            crate::media_control::media_play_pause,
            crate::media_control::media_next,
            crate::media_control::media_previous,
            crate::media_control::media_toggle_shuffle,
            crate::media_control::media_cycle_repeat,
            crate::media_control::media_seek,
            crate::media_control::media_set_volume,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
