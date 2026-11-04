//! Media session lookup, playback commands, metadata and album art.

use base64::Engine;
use std::{
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use windows::{
    core::Interface,
    Foundation::TimeSpan,
    Media::{
        Control::{
            GlobalSystemMediaTransportControlsSession as MediaSession,
            GlobalSystemMediaTransportControlsSessionManager as MediaSessionManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
        },
        MediaPlaybackAutoRepeatMode as RepeatMode,
    },
    Storage::Streams::{DataReader, IInputStream, IRandomAccessStreamReference},
    Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY,
};

use super::audio::{read_master_volume, read_system_audio_peak, AUDIO_ACTIVE_THRESHOLD};
use super::service::*;
use crate::win32;

pub(super) const MAX_THUMBNAIL_BYTES: u64 = 4_000_000;
/// 100ns ticks between the Windows epoch (1601-01-01) and the Unix epoch.
pub(super) const WINDOWS_EPOCH_OFFSET_TICKS: i64 = 116_444_736_000_000_000;

/// Caches the last decoded album-art data URL so the 1.5s state poll does not
/// re-read and re-encode the same artwork on every tick. Keyed by the current
/// source app, title and artist, which is stable while a track is playing.
pub(super) static THUMBNAIL_CACHE: OnceLock<Mutex<Option<(String, Option<String>)>>> =
    OnceLock::new();

pub(super) fn on_media_thread<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    thread::spawn(move || {
        let _apartment = win32::com::ComApartment::multithreaded()
            .map_err(|error| media_error("Failed to initialize the media COM thread", error))?;

        operation()
    })
    .join()
    .map_err(|_| "The Windows media control thread panicked.".to_string())?
}

pub(super) fn request_manager() -> Result<MediaSessionManager, String> {
    let operation = MediaSessionManager::RequestAsync().map_err(|error| {
        media_error("Failed to request the Windows media session manager", error)
    })?;
    pollster::block_on(operation)
        .map_err(|error| media_error("Failed to open the Windows media session manager", error))
}

pub(super) fn resolve_session(
    manager: &MediaSessionManager,
    target: Option<&str>,
) -> Result<Option<MediaSession>, String> {
    if let Some(id) = target.filter(|id| !id.is_empty()) {
        if let Some(session) = session_by_id(manager, id)? {
            return Ok(Some(session));
        }
    }
    target_session(manager)
}

pub(super) fn session_by_id(
    manager: &MediaSessionManager,
    id: &str,
) -> Result<Option<MediaSession>, String> {
    let sessions = manager
        .GetSessions()
        .map_err(|error| media_error("Failed to enumerate Windows media sessions", error))?;

    for index in 0..sessions
        .Size()
        .map_err(|error| media_error("Failed to count Windows media sessions", error))?
    {
        let session = sessions
            .GetAt(index)
            .map_err(|error| media_error("Failed to read a Windows media session", error))?;
        if session_id(&session).as_deref() == Some(id) {
            return Ok(Some(session));
        }
    }

    Ok(None)
}

pub(super) fn target_session(
    manager: &MediaSessionManager,
) -> Result<Option<MediaSession>, String> {
    let current_session = manager.GetCurrentSession().ok();

    if current_session.as_ref().is_some_and(is_playing) {
        return Ok(current_session);
    }

    let sessions = manager
        .GetSessions()
        .map_err(|error| media_error("Failed to enumerate Windows media sessions", error))?;
    let mut first_session = None;

    for index in 0..sessions
        .Size()
        .map_err(|error| media_error("Failed to count Windows media sessions", error))?
    {
        let session = sessions
            .GetAt(index)
            .map_err(|error| media_error("Failed to read a Windows media session", error))?;

        if first_session.is_none() {
            first_session = Some(session.clone());
        }

        if is_playing(&session) {
            return Ok(Some(session));
        }
    }

    Ok(current_session.or(first_session))
}

pub(super) fn list_sessions(manager: &MediaSessionManager) -> Vec<MediaSessionInfo> {
    let mut entries = Vec::new();
    let Ok(sessions) = manager.GetSessions() else {
        return entries;
    };
    let Ok(size) = sessions.Size() else {
        return entries;
    };

    for index in 0..size {
        let Ok(session) = sessions.GetAt(index) else {
            continue;
        };
        let Some(id) = session_id(&session) else {
            continue;
        };
        if entries
            .iter()
            .any(|entry: &MediaSessionInfo| entry.id == id)
        {
            continue;
        }
        entries.push(MediaSessionInfo {
            label: friendly_app_label(&id),
            id,
            playing: is_playing(&session),
        });
    }

    entries
}

pub(super) fn session_id(session: &MediaSession) -> Option<String> {
    session
        .SourceAppUserModelId()
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn is_playing(session: &MediaSession) -> bool {
    session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .is_ok_and(|status| status == PlaybackStatus::Playing)
}

pub(super) fn run_play_pause(session: &MediaSession) -> Result<bool, String> {
    let status = session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .map_err(|error| media_error("Failed to read the active media playback state", error))?;

    if status == PlaybackStatus::Playing {
        let operation = session
            .TryPauseAsync()
            .map_err(|error| media_error("Failed to request media pause", error))?;
        pollster::block_on(operation).map_err(|error| media_error("Failed to pause media", error))
    } else {
        let operation = session
            .TryPlayAsync()
            .map_err(|error| media_error("Failed to request media playback", error))?;
        pollster::block_on(operation).map_err(|error| media_error("Failed to play media", error))
    }
}

pub(super) fn run_toggle_shuffle(session: &MediaSession) -> Result<bool, String> {
    let current = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|info| info.IsShuffleActive().ok())
        .and_then(|value| value.Value().ok())
        .unwrap_or(false);
    let operation = session
        .TryChangeShuffleActiveAsync(!current)
        .map_err(|error| media_error("Failed to request shuffle", error))?;
    pollster::block_on(operation).map_err(|error| media_error("Failed to change shuffle", error))
}

pub(super) fn run_cycle_repeat(session: &MediaSession) -> Result<bool, String> {
    let current = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|info| info.AutoRepeatMode().ok())
        .and_then(|value| value.Value().ok())
        .unwrap_or(RepeatMode::None);
    let next = match current {
        RepeatMode::None => RepeatMode::List,
        RepeatMode::List => RepeatMode::Track,
        _ => RepeatMode::None,
    };
    let operation = session
        .TryChangeAutoRepeatModeAsync(next)
        .map_err(|error| media_error("Failed to request repeat mode", error))?;
    pollster::block_on(operation)
        .map_err(|error| media_error("Failed to change repeat mode", error))
}

pub(super) fn run_session_command(
    session: &MediaSession,
    command: MediaCommand,
) -> Result<bool, String> {
    match command {
        MediaCommand::PlayPause => run_play_pause(session),
        MediaCommand::Next => pollster::block_on(
            session
                .TrySkipNextAsync()
                .map_err(|error| media_error("Failed to request the next track", error))?,
        )
        .map_err(|error| media_error("Failed to change to the next track", error)),
        MediaCommand::Previous => pollster::block_on(
            session
                .TrySkipPreviousAsync()
                .map_err(|error| media_error("Failed to request the previous track", error))?,
        )
        .map_err(|error| media_error("Failed to change to the previous track", error)),
        MediaCommand::ToggleShuffle => run_toggle_shuffle(session),
        MediaCommand::CycleRepeat => run_cycle_repeat(session),
    }
}

pub(super) fn send_media_key(key: VIRTUAL_KEY) {
    win32::input::send_key_down(key);
    thread::sleep(Duration::from_millis(80));
    win32::input::send_key_up(key);
}

pub(super) fn read_media_state(target: Option<&str>) -> Result<MediaState, String> {
    match request_manager() {
        Ok(manager) => read_media_state_from_manager(&manager, target),
        Err(_) => read_media_state_without_session(),
    }
}

pub(super) fn read_media_state_from_manager(
    manager: &MediaSessionManager,
    target: Option<&str>,
) -> Result<MediaState, String> {
    let audio_peak = read_system_audio_peak().unwrap_or(0.0);
    let audio_active = audio_peak > AUDIO_ACTIVE_THRESHOLD;
    let volume = read_master_volume().unwrap_or(-1.0);
    let sessions = list_sessions(manager);

    let Some(session) = resolve_session(manager, target)? else {
        return Ok(MediaState {
            available: false,
            audio_active,
            audio_peak,
            playback_status: if audio_active {
                "playing"
            } else {
                "unavailable"
            },
            volume,
            sessions,
            ..MediaState::empty()
        });
    };

    let source_app = session_id(&session);
    let playback_info = session
        .GetPlaybackInfo()
        .map_err(|error| media_error("Failed to read Windows media playback information", error))?;
    let playback_status = playback_info
        .PlaybackStatus()
        .map_err(|error| media_error("Failed to read Windows media playback status", error))?;
    let is_playing = playback_status == PlaybackStatus::Playing;

    let controls = playback_info.Controls().ok();
    let can_next = controls
        .as_ref()
        .and_then(|controls| controls.IsNextEnabled().ok())
        .unwrap_or(false);
    let can_previous = controls
        .as_ref()
        .and_then(|controls| controls.IsPreviousEnabled().ok())
        .unwrap_or(false);
    let can_seek = controls
        .as_ref()
        .and_then(|controls| controls.IsPlaybackPositionEnabled().ok())
        .unwrap_or(false);
    let can_shuffle = controls
        .as_ref()
        .and_then(|controls| controls.IsShuffleEnabled().ok())
        .unwrap_or(false);
    let can_repeat = controls
        .as_ref()
        .and_then(|controls| controls.IsRepeatEnabled().ok())
        .unwrap_or(false);

    let shuffle_active = playback_info
        .IsShuffleActive()
        .ok()
        .and_then(|value| value.Value().ok());
    let repeat_mode = playback_info
        .AutoRepeatMode()
        .ok()
        .and_then(|value| value.Value().ok())
        .map(repeat_mode_label)
        .unwrap_or("unknown");

    let playback_rate = playback_info
        .PlaybackRate()
        .ok()
        .and_then(|value| value.Value().ok())
        .unwrap_or(1.0);

    let (position_ms, duration_ms) = read_timeline(&session, is_playing, playback_rate);
    let (title, artist, album, thumbnail) = read_metadata(&session, source_app.as_deref());

    Ok(MediaState {
        available: true,
        audio_active,
        audio_peak,
        playback_status: if is_playing { "playing" } else { "paused" },
        title,
        artist,
        album,
        thumbnail,
        position_ms,
        duration_ms,
        can_seek,
        can_next,
        can_previous,
        shuffle_active,
        can_shuffle,
        repeat_mode,
        can_repeat,
        volume,
        source_app,
        active_session_id: session_id(&session),
        sessions,
        updated_at: current_unix_millis(),
    })
}

pub(super) fn read_media_state_without_session() -> Result<MediaState, String> {
    let audio_peak = read_system_audio_peak().unwrap_or(0.0);
    let audio_active = audio_peak > AUDIO_ACTIVE_THRESHOLD;

    Ok(MediaState {
        available: false,
        audio_active,
        audio_peak,
        playback_status: if audio_active {
            "playing"
        } else {
            "unavailable"
        },
        volume: read_master_volume().unwrap_or(-1.0),
        ..MediaState::empty()
    })
}

impl MediaState {
    pub(super) fn empty() -> Self {
        MediaState {
            available: false,
            audio_active: false,
            audio_peak: 0.0,
            playback_status: "unavailable",
            title: None,
            artist: None,
            album: None,
            thumbnail: None,
            position_ms: 0,
            duration_ms: 0,
            can_seek: false,
            can_next: false,
            can_previous: false,
            shuffle_active: None,
            can_shuffle: false,
            repeat_mode: "unknown",
            can_repeat: false,
            volume: -1.0,
            source_app: None,
            active_session_id: None,
            sessions: Vec::new(),
            updated_at: current_unix_millis(),
        }
    }
}

pub(super) fn read_timeline(
    session: &MediaSession,
    is_playing: bool,
    playback_rate: f64,
) -> (i64, i64) {
    let Ok(timeline) = session.GetTimelineProperties() else {
        return (0, 0);
    };

    let start = timeline.StartTime().map(ticks_to_ms).unwrap_or(0);
    let end = timeline.EndTime().map(ticks_to_ms).unwrap_or(0);
    let position = timeline.Position().map(ticks_to_ms).unwrap_or(0);

    let duration = (end - start).max(0);
    let mut elapsed = (position - start).clamp(0, duration);

    // `Position` is the position sampled at `LastUpdatedTime`. While playing,
    // extrapolate forward so the progress bar keeps advancing for players that
    // only report the timeline once per track; never extrapolate while paused.
    if is_playing && duration > 0 {
        if let Ok(last_updated) = timeline.LastUpdatedTime() {
            let now_ticks =
                current_unix_millis().saturating_mul(10_000) + WINDOWS_EPOCH_OFFSET_TICKS;
            let since_update_ms = (now_ticks - last_updated.UniversalTime) / 10_000;
            if since_update_ms > 0 {
                let rate = if playback_rate > 0.0 {
                    playback_rate
                } else {
                    1.0
                };
                let projected = elapsed + (since_update_ms as f64 * rate).round() as i64;
                elapsed = projected.clamp(0, duration);
            }
        }
    }

    (elapsed, duration)
}

pub(super) fn read_metadata(
    session: &MediaSession,
    source_app: Option<&str>,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let Ok(operation) = session.TryGetMediaPropertiesAsync() else {
        return (None, None, None, None);
    };
    let Ok(properties) = pollster::block_on(operation) else {
        return (None, None, None, None);
    };

    let title = non_empty(properties.Title().ok().map(|value| value.to_string()));
    let artist = non_empty(properties.Artist().ok().map(|value| value.to_string()));
    let album = non_empty(properties.AlbumTitle().ok().map(|value| value.to_string()));
    let thumbnail = cached_thumbnail(source_app, title.as_deref(), artist.as_deref(), || {
        properties.Thumbnail().ok()
    });

    (title, artist, album, thumbnail)
}

pub(super) fn cached_thumbnail(
    source_app: Option<&str>,
    title: Option<&str>,
    artist: Option<&str>,
    read_reference: impl FnOnce() -> Option<IRandomAccessStreamReference>,
) -> Option<String> {
    let key = format!(
        "{}|{}|{}",
        source_app.unwrap_or_default(),
        title.unwrap_or_default(),
        artist.unwrap_or_default()
    );
    let cache = THUMBNAIL_CACHE.get_or_init(|| Mutex::new(None));

    if let Ok(guard) = cache.lock() {
        if let Some((cached_key, cached_value)) = guard.as_ref() {
            if *cached_key == key {
                return cached_value.clone();
            }
        }
    }

    let value = read_reference().and_then(|reference| read_thumbnail(&reference));

    if let Ok(mut guard) = cache.lock() {
        *guard = Some((key, value.clone()));
    }

    value
}

pub(super) fn read_thumbnail(reference: &IRandomAccessStreamReference) -> Option<String> {
    let stream = pollster::block_on(reference.OpenReadAsync().ok()?).ok()?;
    let size = stream.Size().ok()?;
    if size == 0 || size > MAX_THUMBNAIL_BYTES {
        return None;
    }

    let input: IInputStream = stream.cast().ok()?;
    let reader = DataReader::CreateDataReader(&input).ok()?;
    let loaded = pollster::block_on(reader.LoadAsync(size as u32).ok()?).ok()?;
    let mut buffer = vec![0u8; loaded as usize];
    reader.ReadBytes(&mut buffer).ok()?;
    if buffer.is_empty() {
        return None;
    }

    // Detect the image type from the bytes rather than the stream's reported
    // content type: some apps (e.g. NetEase Cloud Music) report a comma-joined
    // list like "image/jpeg,image/jpe,image/jpg", which breaks the data URL.
    let mime = detect_image_mime(&buffer);
    let encoded = base64::engine::general_purpose::STANDARD.encode(&buffer);
    Some(format!("data:{mime};base64,{encoded}"))
}

pub(super) fn detect_image_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else if bytes.starts_with(&[0x42, 0x4D]) {
        "image/bmp"
    } else {
        "image/jpeg"
    }
}

pub(super) fn repeat_mode_label(mode: RepeatMode) -> &'static str {
    match mode {
        RepeatMode::None => "none",
        RepeatMode::Track => "track",
        RepeatMode::List => "list",
        _ => "unknown",
    }
}

/// Turns a raw AppUserModelId (e.g. `Spotify.exe`, `chrome.exe`, a packaged app
/// family name) into a short, human-friendly source label for the island.
pub(super) fn friendly_app_label(id: &str) -> String {
    let lowered = id.to_ascii_lowercase();
    let known = [
        ("spotify", "Spotify"),
        ("chrome", "Chrome"),
        ("msedge", "Edge"),
        ("edge", "Edge"),
        ("firefox", "Firefox"),
        ("brave", "Brave"),
        ("opera", "Opera"),
        ("vlc", "VLC"),
        ("itunes", "iTunes"),
        ("apple.music", "Apple Music"),
        ("applemusic", "Apple Music"),
        ("music.ui", "Apple Music"),
        ("tidal", "TIDAL"),
        ("deezer", "Deezer"),
        ("foobar", "foobar2000"),
        ("aimp", "AIMP"),
        ("netease", "NetEase Music"),
        ("cloudmusic", "NetEase Music"),
        ("qqmusic", "QQ Music"),
        ("kugou", "KuGou"),
        ("kuwo", "Kuwo"),
        ("potplayer", "PotPlayer"),
        ("winamp", "Winamp"),
        ("zune", "Groove"),
        ("groove", "Groove"),
    ];

    for (needle, label) in known {
        if lowered.contains(needle) {
            return label.to_string();
        }
    }

    if let Some(stripped) = lowered.strip_suffix(".exe") {
        if let Some(name) = stripped.rsplit(['\\', '/']).next() {
            if !name.is_empty() {
                let mut chars = name.chars();
                if let Some(first) = chars.next() {
                    return first.to_uppercase().collect::<String>() + chars.as_str();
                }
            }
        }
    }

    id.to_string()
}

pub(super) fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn ticks_to_ms(span: TimeSpan) -> i64 {
    span.Duration / 10_000
}

pub(super) fn media_error(context: &str, error: windows::core::Error) -> String {
    format!("{context}: {error}")
}

pub(super) fn current_unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
