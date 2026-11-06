//! Media for plugins: `media.nowPlaying` and `media.cover` (sensitive
//! `media:read`), and play / pause / next / previous, seek, shuffle, repeat
//! and the system volume (`media:control`).

use serde_json::{json, Value};

use super::service::{self, MediaCommand, MediaState};

/// A larger cover is not handed to plugins (one JSON-RPC line each).
const MAX_COVER_BYTES: usize = 1024 * 1024;

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
        "canSeek": state.can_seek,
        "canNext": state.can_next,
        "canPrevious": state.can_previous,
        // null when the player does not say (or cannot shuffle).
        "shuffle": if state.can_shuffle { json!(state.shuffle_active) } else { Value::Null },
        // "none", "track", "list" or "unknown".
        "repeat": state.repeat_mode,
        // The system volume, 0-1; null when Windows cannot say.
        "volume": (state.volume >= 0.0).then_some(state.volume),
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

/// `media.cover`: the cover of what plays, as a data: URL, or null.
pub(crate) fn plugin_cover() -> Result<Value, (u16, String)> {
    let state = service::get_state(None).map_err(|error| (500, error))?;
    Ok(json!({ "cover": cover_for_plugins(state.thumbnail) }))
}

pub(crate) fn cover_for_plugins(cover: Option<String>) -> Option<String> {
    cover.filter(|cover| cover.len() <= MAX_COVER_BYTES)
}

/// The media:control methods; answers like `media.nowPlaying`.
pub(crate) fn plugin_media_command(method: &str, params: &Value) -> Result<Value, (u16, String)> {
    let state = match method {
        "media.seek" => {
            let position = params
                .get("positionMs")
                .and_then(Value::as_i64)
                .filter(|position| *position >= 0)
                .ok_or((400, "Expected { positionMs }, a whole number of milliseconds from 0.".to_string()))?;
            service::seek(position, None)
        }
        "media.setVolume" => {
            let level = params
                .get("level")
                .and_then(Value::as_f64)
                .filter(|level| (0.0..=1.0).contains(level))
                .ok_or((400, "Expected { level } from 0 to 1.".to_string()))?;
            service::set_volume(level as f32)
        }
        _ => {
            let command = match method {
                "media.playPause" => MediaCommand::PlayPause,
                "media.next" => MediaCommand::Next,
                "media.previous" => MediaCommand::Previous,
                "media.toggleShuffle" => MediaCommand::ToggleShuffle,
                "media.cycleRepeat" => MediaCommand::CycleRepeat,
                _ => return Err((404, format!("Unknown method {method}."))),
            };
            service::run_command(command, None)
        }
    };
    state.map(|state| now_playing_value(&state)).map_err(|error| (500, error))
}

#[cfg(test)]
mod tests {
    use super::{cover_for_plugins, plugin_media_command, MAX_COVER_BYTES};
    use serde_json::json;

    #[test]
    fn large_covers_are_left_out() {
        assert_eq!(cover_for_plugins(Some("data:image/png;base64,AA".into())).as_deref(), Some("data:image/png;base64,AA"));
        assert_eq!(cover_for_plugins(Some("x".repeat(MAX_COVER_BYTES + 1))), None);
        assert_eq!(cover_for_plugins(None), None);
    }

    #[test]
    fn bad_seek_and_volume_values_are_refused_before_touching_the_player() {
        for params in [json!({}), json!({ "positionMs": -1 }), json!({ "positionMs": "10" })] {
            assert_eq!(plugin_media_command("media.seek", &params).expect_err("seek").0, 400);
        }
        for params in [json!({}), json!({ "level": 1.5 }), json!({ "level": -0.1 })] {
            assert_eq!(plugin_media_command("media.setVolume", &params).expect_err("volume").0, 400);
        }
        assert_eq!(plugin_media_command("media.stop", &json!({})).expect_err("unknown").0, 404);
    }
}
