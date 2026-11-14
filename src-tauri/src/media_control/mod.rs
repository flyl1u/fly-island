//! Windows media sessions (SMTC) and the system audio endpoint behind the music page.

mod audio;
mod diagnostics;
mod service;
mod session;
mod sources;
mod timeline;
mod watcher;

#[tauri::command]
pub async fn get_media_diagnostics() -> Result<diagnostics::MediaDiagnostics, String> {
    tauri::async_runtime::spawn_blocking(diagnostics::get)
        .await.map_err(|error| format!("播放器诊断任务失败: {error}"))?
}

#[tauri::command]
pub async fn get_media_state(
    app: tauri::AppHandle,
    target: Option<String>,
    excluded_sources: Option<Vec<String>>,
) -> Result<service::MediaState, String> {
    // Reading the state is what keeps the session event watcher alive.
    watcher::keep_alive(&app);
    tauri::async_runtime::spawn_blocking(move || service::get_state(target, excluded_sources.unwrap_or_default()))
        .await
        .map_err(|error| format!("Failed to join the media state task: {error}"))?
}

#[tauri::command]
pub async fn get_audio_level(target: Option<String>, excluded_sources: Option<Vec<String>>) -> Result<service::AudioLevel, String> {
    tauri::async_runtime::spawn_blocking(move || service::get_audio_level(target, excluded_sources.unwrap_or_default()))
        .await
        .map_err(|error| format!("Failed to join the audio level task: {error}"))?
}

#[tauri::command]
pub async fn media_play_pause(target: Option<String>, excluded_sources: Option<Vec<String>>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::PlayPause, target, excluded_sources).await
}

#[tauri::command]
pub async fn media_next(target: Option<String>, excluded_sources: Option<Vec<String>>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::Next, target, excluded_sources).await
}

#[tauri::command]
pub async fn media_previous(target: Option<String>, excluded_sources: Option<Vec<String>>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::Previous, target, excluded_sources).await
}

#[tauri::command]
pub async fn media_toggle_shuffle(target: Option<String>, excluded_sources: Option<Vec<String>>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::ToggleShuffle, target, excluded_sources).await
}

#[tauri::command]
pub async fn media_cycle_repeat(target: Option<String>, excluded_sources: Option<Vec<String>>) -> Result<service::MediaState, String> {
    run_media_command(service::MediaCommand::CycleRepeat, target, excluded_sources).await
}

#[tauri::command]
pub async fn media_seek(
    position_ms: i64,
    target: Option<String>,
    excluded_sources: Option<Vec<String>>,
) -> Result<service::MediaState, String> {
    tauri::async_runtime::spawn_blocking(move || service::seek(position_ms, target, excluded_sources.unwrap_or_default()))
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
    excluded_sources: Option<Vec<String>>,
) -> Result<service::MediaState, String> {
    tauri::async_runtime::spawn_blocking(move || service::run_command(command, target, excluded_sources.unwrap_or_default()))
        .await
        .map_err(|error| format!("Failed to join the media command task: {error}"))?
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::media_control::get_media_state,
            crate::media_control::get_media_diagnostics,
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
