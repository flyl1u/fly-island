//! Media for plugins: `media.nowPlaying` (sensitive `media:read`) and
//! play / pause / next / previous (`media:control`). No cover image.

use serde_json::{json, Value};

use super::service::{self, MediaCommand, MediaState};

fn now_playing_value(state: &MediaState) -> Value {
    json!({
        "available": state.available,
        "status": state.playback_status,
        "title": state.title,
        "artist": state.artist,
        "album": state.album,
        "sourceApp": state.source_app,
        "positionMs": state.position_ms,
        "durationMs": state.duration_ms,
    })
}

/// What `media.changed` compares: a change of track, player or play state, not the position.
pub(crate) fn now_playing_key(value: &Value) -> Value {
    json!([value["status"], value["title"], value["artist"], value["album"], value["sourceApp"]])
}

/// `media.nowPlaying`. Errors carry an HTTP-style status.
pub(crate) fn plugin_now_playing() -> Result<Value, (u16, String)> {
    service::get_state(None).map(|state| now_playing_value(&state)).map_err(|error| (500, error))
}

/// `media.playPause`, `media.next`, `media.previous`; answers like `media.nowPlaying`.
pub(crate) fn plugin_media_command(method: &str) -> Result<Value, (u16, String)> {
    let command = match method {
        "media.playPause" => MediaCommand::PlayPause,
        "media.next" => MediaCommand::Next,
        "media.previous" => MediaCommand::Previous,
        _ => return Err((404, format!("Unknown method {method}."))),
    };
    service::run_command(command, None).map(|state| now_playing_value(&state)).map_err(|error| (500, error))
}
