//! Media state and commands, each run on a COM-initialized media thread.

use serde::Serialize;
use std::{thread, time::Duration};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    VIRTUAL_KEY, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK,
};

use super::audio::{read_system_audio_peak, set_master_volume, AUDIO_ACTIVE_THRESHOLD};
use super::session::*;
use super::timeline;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaSessionInfo {
    pub(super) id: String,
    pub(super) label: String,
    pub(super) playing: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaState {
    pub(super) available: bool,
    pub(super) audio_active: bool,
    pub(super) audio_peak: f32,
    pub(super) playback_status: &'static str,
    pub(super) title: Option<String>,
    pub(super) artist: Option<String>,
    pub(super) album: Option<String>,
    pub(super) thumbnail: Option<String>,
    /// A song id a player plugin gives (`NCM-<id>`, `QQ-<id>`); the lyrics use it to skip a search.
    pub(super) track_id: Option<String>,
    pub(super) position_ms: i64,
    pub(super) duration_ms: i64,
    pub(super) can_seek: bool,
    pub(super) can_next: bool,
    pub(super) can_previous: bool,
    pub(super) shuffle_active: Option<bool>,
    pub(super) can_shuffle: bool,
    pub(super) repeat_mode: &'static str,
    pub(super) can_repeat: bool,
    pub(super) volume: f32,
    pub(super) source_app: Option<String>,
    pub(super) active_session_id: Option<String>,
    pub(super) sessions: Vec<MediaSessionInfo>,
    pub(super) updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioLevel {
    pub(super) active: bool,
    pub(super) peak: f32,
    pub(super) updated_at: i64,
}

#[derive(Clone, Copy)]
pub(crate) enum MediaCommand {
    PlayPause,
    Next,
    Previous,
    ToggleShuffle,
    CycleRepeat,
}

pub(crate) fn get_state(target: Option<String>) -> Result<MediaState, String> {
    on_media_thread(move || read_media_state(target.as_deref()))
}

pub(crate) fn get_audio_level() -> Result<AudioLevel, String> {
    on_media_thread(|| {
        let peak = read_system_audio_peak()?;
        Ok(AudioLevel {
            active: peak > AUDIO_ACTIVE_THRESHOLD,
            peak,
            updated_at: current_unix_millis(),
        })
    })
}

pub(crate) fn run_command(
    command: MediaCommand,
    target: Option<String>,
) -> Result<MediaState, String> {
    on_media_thread(move || {
        // When a source is explicitly selected, operate only on it: never fall
        // back to another session or to global media keys, which could control
        // an unexpected player.
        if let Some(id) = target.as_deref() {
            let manager = request_manager()?;
            let session = session_by_id(&manager, id)?
                .ok_or_else(|| "The selected media source is no longer available.".to_string())?;
            if run_session_command(&session, command)? {
                thread::sleep(Duration::from_millis(40));
                return read_media_state_from_manager(&manager, Some(id));
            }
            return Err("The selected media source did not accept the command.".to_string());
        }

        // No source specified: control the active session, then fall back to
        // global media keys.
        if let Ok(manager) = request_manager() {
            if let Ok(Some(session)) = target_session(&manager) {
                if run_session_command(&session, command).unwrap_or(false) {
                    thread::sleep(Duration::from_millis(40));
                    return read_media_state_from_manager(&manager, None);
                }
            }
        }

        if let Some(key_command) = command.as_media_key() {
            send_media_key(key_command);
            thread::sleep(Duration::from_millis(80));
        }
        read_media_state(None)
    })
}

pub(crate) fn seek(position_ms: i64, target: Option<String>) -> Result<MediaState, String> {
    on_media_thread(move || {
        let manager = request_manager()?;
        let session = match target.as_deref() {
            Some(id) => session_by_id(&manager, id)?
                .ok_or_else(|| "The selected media source is no longer available.".to_string())?,
            None => target_session(&manager)?
                .ok_or_else(|| "No media is currently playing.".to_string())?,
        };

        let can_seek = session
            .GetPlaybackInfo()
            .and_then(|info| info.Controls())
            .and_then(|controls| controls.IsPlaybackPositionEnabled())
            .unwrap_or(false);
        if !can_seek {
            return Err("This player does not allow seeking from outside.".to_string());
        }

        let timeline = session.GetTimelineProperties().ok();
        let start_ms = timeline
            .as_ref()
            .and_then(|timeline| timeline.StartTime().ok())
            .map(ticks_to_ms)
            .unwrap_or(0);
        let end_ms = timeline
            .as_ref()
            .and_then(|timeline| timeline.EndTime().ok())
            .map(ticks_to_ms)
            .unwrap_or(0);
        let elapsed_ms = if end_ms > start_ms {
            position_ms.clamp(0, end_ms - start_ms)
        } else {
            position_ms.max(0)
        };
        let ticks = (start_ms + elapsed_ms).saturating_mul(10_000);
        let operation = session
            .TryChangePlaybackPositionAsync(ticks)
            .map_err(|error| media_error("Failed to request the seek", error))?;
        if !pollster::block_on(operation).unwrap_or(false) {
            return Err("The media source did not accept the seek.".to_string());
        }
        // Players that push no new timeline after a seek would otherwise snap back to the old one.
        if let Some(id) = session_id(&session) {
            timeline::seeked(&id, elapsed_ms, current_unix_millis());
        }
        thread::sleep(Duration::from_millis(40));
        read_media_state_from_manager(&manager, target.as_deref())
    })
}

pub(crate) fn set_volume(level: f32) -> Result<MediaState, String> {
    on_media_thread(move || {
        set_master_volume(level)?;
        read_media_state(None)
    })
}

impl MediaCommand {
    pub(super) fn as_media_key(self) -> Option<VIRTUAL_KEY> {
        match self {
            MediaCommand::PlayPause => Some(VK_MEDIA_PLAY_PAUSE),
            MediaCommand::Next => Some(VK_MEDIA_NEXT_TRACK),
            MediaCommand::Previous => Some(VK_MEDIA_PREV_TRACK),
            MediaCommand::ToggleShuffle | MediaCommand::CycleRepeat => None,
        }
    }
}
