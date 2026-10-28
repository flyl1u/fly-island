use base64::Engine;
use serde::Serialize;
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
    Win32::{
        Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation},
        Media::Audio::{
            eCommunications, eConsole, eMultimedia, eRender, IMMDeviceEnumerator,
            MMDeviceEnumerator,
        },
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_MULTITHREADED,
        },
        UI::Input::KeyboardAndMouse::{
            keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_MEDIA_NEXT_TRACK,
            VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK,
        },
    },
};

const AUDIO_ACTIVE_THRESHOLD: f32 = 0.000015;
const MAX_THUMBNAIL_BYTES: u64 = 4_000_000;

/// Caches the last decoded album-art data URL so the 1.5s state poll does not
/// re-read and re-encode the same artwork on every tick. Keyed by the current
/// source app, title and artist, which is stable while a track is playing.
static THUMBNAIL_CACHE: OnceLock<Mutex<Option<(String, Option<String>)>>> = OnceLock::new();

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaSessionInfo {
    id: String,
    label: String,
    playing: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaState {
    available: bool,
    audio_active: bool,
    audio_peak: f32,
    playback_status: &'static str,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    thumbnail: Option<String>,
    position_ms: i64,
    duration_ms: i64,
    can_seek: bool,
    can_next: bool,
    can_previous: bool,
    shuffle_active: Option<bool>,
    can_shuffle: bool,
    repeat_mode: &'static str,
    can_repeat: bool,
    volume: f32,
    source_app: Option<String>,
    active_session_id: Option<String>,
    sessions: Vec<MediaSessionInfo>,
    updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioLevel {
    active: bool,
    peak: f32,
    updated_at: i64,
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
        if let Ok(manager) = request_manager() {
            if let Ok(Some(session)) = resolve_session(&manager, target.as_deref()) {
                if run_session_command(&session, command).unwrap_or(false) {
                    thread::sleep(Duration::from_millis(40));
                    return read_media_state_from_manager(&manager, target.as_deref());
                }
            }
        }

        if let Some(key_command) = command.as_media_key() {
            send_media_key(key_command);
            thread::sleep(Duration::from_millis(80));
        }
        read_media_state(target.as_deref())
    })
}

pub(crate) fn seek(position_ms: i64, target: Option<String>) -> Result<MediaState, String> {
    on_media_thread(move || {
        if let Ok(manager) = request_manager() {
            if let Ok(Some(session)) = resolve_session(&manager, target.as_deref()) {
                let start_ms = session
                    .GetTimelineProperties()
                    .ok()
                    .and_then(|timeline| timeline.StartTime().ok())
                    .map(ticks_to_ms)
                    .unwrap_or(0);
                let ticks = (start_ms + position_ms.max(0)).saturating_mul(10_000);
                if let Ok(operation) = session.TryChangePlaybackPositionAsync(ticks) {
                    let _ = pollster::block_on(operation);
                    thread::sleep(Duration::from_millis(40));
                    return read_media_state_from_manager(&manager, target.as_deref());
                }
            }
        }
        read_media_state(target.as_deref())
    })
}

pub(crate) fn set_volume(level: f32) -> Result<MediaState, String> {
    on_media_thread(move || {
        set_master_volume(level)?;
        read_media_state(None)
    })
}

impl MediaCommand {
    fn as_media_key(self) -> Option<VIRTUAL_KEY> {
        match self {
            MediaCommand::PlayPause => Some(VK_MEDIA_PLAY_PAUSE),
            MediaCommand::Next => Some(VK_MEDIA_NEXT_TRACK),
            MediaCommand::Previous => Some(VK_MEDIA_PREV_TRACK),
            MediaCommand::ToggleShuffle | MediaCommand::CycleRepeat => None,
        }
    }
}

fn on_media_thread<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    thread::spawn(move || {
        let initialize_result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        initialize_result
            .ok()
            .map_err(|error| media_error("Failed to initialize the media COM thread", error))?;

        let result = operation();
        unsafe { CoUninitialize() };
        result
    })
    .join()
    .map_err(|_| "The Windows media control thread panicked.".to_string())?
}

fn request_manager() -> Result<MediaSessionManager, String> {
    let operation = MediaSessionManager::RequestAsync().map_err(|error| {
        media_error("Failed to request the Windows media session manager", error)
    })?;
    pollster::block_on(operation)
        .map_err(|error| media_error("Failed to open the Windows media session manager", error))
}

fn resolve_session(
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

fn session_by_id(
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

fn target_session(manager: &MediaSessionManager) -> Result<Option<MediaSession>, String> {
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

fn list_sessions(manager: &MediaSessionManager) -> Vec<MediaSessionInfo> {
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
        if entries.iter().any(|entry: &MediaSessionInfo| entry.id == id) {
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

fn session_id(session: &MediaSession) -> Option<String> {
    session
        .SourceAppUserModelId()
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty())
}

fn is_playing(session: &MediaSession) -> bool {
    session
        .GetPlaybackInfo()
        .and_then(|info| info.PlaybackStatus())
        .is_ok_and(|status| status == PlaybackStatus::Playing)
}

fn run_play_pause(session: &MediaSession) -> Result<bool, String> {
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

fn run_toggle_shuffle(session: &MediaSession) -> Result<bool, String> {
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

fn run_cycle_repeat(session: &MediaSession) -> Result<bool, String> {
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

fn run_session_command(session: &MediaSession, command: MediaCommand) -> Result<bool, String> {
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

fn send_media_key(key: VIRTUAL_KEY) {
    let key_code = key.0 as u8;

    unsafe { keybd_event(key_code, 0, KEYBD_EVENT_FLAGS(0), 0) };
    thread::sleep(Duration::from_millis(80));
    unsafe { keybd_event(key_code, 0, KEYEVENTF_KEYUP, 0) };
}

fn read_media_state(target: Option<&str>) -> Result<MediaState, String> {
    match request_manager() {
        Ok(manager) => read_media_state_from_manager(&manager, target),
        Err(_) => read_media_state_without_session(),
    }
}

fn read_media_state_from_manager(
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
            playback_status: if audio_active { "playing" } else { "unavailable" },
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

    let (position_ms, duration_ms) = read_timeline(&session);
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

fn read_media_state_without_session() -> Result<MediaState, String> {
    let audio_peak = read_system_audio_peak().unwrap_or(0.0);
    let audio_active = audio_peak > AUDIO_ACTIVE_THRESHOLD;

    Ok(MediaState {
        available: false,
        audio_active,
        audio_peak,
        playback_status: if audio_active { "playing" } else { "unavailable" },
        volume: read_master_volume().unwrap_or(-1.0),
        ..MediaState::empty()
    })
}

impl MediaState {
    fn empty() -> Self {
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

fn read_timeline(session: &MediaSession) -> (i64, i64) {
    let Ok(timeline) = session.GetTimelineProperties() else {
        return (0, 0);
    };

    let start = timeline.StartTime().map(ticks_to_ms).unwrap_or(0);
    let end = timeline.EndTime().map(ticks_to_ms).unwrap_or(0);
    let position = timeline.Position().map(ticks_to_ms).unwrap_or(0);

    let duration = (end - start).max(0);
    let elapsed = (position - start).clamp(0, duration.max(0));
    (elapsed, duration)
}

fn read_metadata(
    session: &MediaSession,
    source_app: Option<&str>,
) -> (Option<String>, Option<String>, Option<String>, Option<String>) {
    let Ok(operation) = session.TryGetMediaPropertiesAsync() else {
        return (None, None, None, None);
    };
    let Ok(properties) = pollster::block_on(operation) else {
        return (None, None, None, None);
    };

    let title = non_empty(properties.Title().ok().map(|value| value.to_string()));
    let artist = non_empty(properties.Artist().ok().map(|value| value.to_string()));
    let album = non_empty(
        properties
            .AlbumTitle()
            .ok()
            .map(|value| value.to_string()),
    );
    let thumbnail = cached_thumbnail(source_app, title.as_deref(), artist.as_deref(), || {
        properties.Thumbnail().ok()
    });

    (title, artist, album, thumbnail)
}

fn cached_thumbnail(
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

fn read_thumbnail(reference: &IRandomAccessStreamReference) -> Option<String> {
    let stream = pollster::block_on(reference.OpenReadAsync().ok()?).ok()?;
    let size = stream.Size().ok()?;
    if size == 0 || size > MAX_THUMBNAIL_BYTES {
        return None;
    }

    let content_type = stream
        .ContentType()
        .ok()
        .map(|value| value.to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "image/png".to_string());

    let input: IInputStream = stream.cast().ok()?;
    let reader = DataReader::CreateDataReader(&input).ok()?;
    let loaded = pollster::block_on(reader.LoadAsync(size as u32).ok()?).ok()?;
    let mut buffer = vec![0u8; loaded as usize];
    reader.ReadBytes(&mut buffer).ok()?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(&buffer);
    Some(format!("data:{content_type};base64,{encoded}"))
}

fn read_master_volume() -> Option<f32> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok()?;
        let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None).ok()?;
        let level = endpoint.GetMasterVolumeLevelScalar().ok()?;
        Some(level.clamp(0.0, 1.0))
    }
}

fn set_master_volume(level: f32) -> Result<(), String> {
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|error| media_error("Failed to open the Windows audio device manager", error))?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|error| media_error("Failed to open the default audio output", error))?;
        let endpoint: IAudioEndpointVolume = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|error| media_error("Failed to open the audio volume control", error))?;
        endpoint
            .SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null())
            .map_err(|error| media_error("Failed to change the system volume", error))?;
        Ok(())
    }
}

fn read_system_audio_peak() -> Result<f32, String> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|error| {
                media_error("Failed to open the Windows audio device manager", error)
            })?;
        let mut peak = 0.0_f32;
        let mut found_meter = false;

        for role in [eMultimedia, eConsole, eCommunications] {
            if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, role) {
                if let Ok(meter) = device.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None) {
                    found_meter = true;
                    if let Ok(value) = meter.GetPeakValue() {
                        peak = peak.max(value);
                    }
                }
            }
        }

        if found_meter {
            Ok(peak.clamp(0.0, 1.0))
        } else {
            Err("No default Windows audio output was available.".to_string())
        }
    }
}

fn repeat_mode_label(mode: RepeatMode) -> &'static str {
    match mode {
        RepeatMode::None => "none",
        RepeatMode::Track => "track",
        RepeatMode::List => "list",
        _ => "unknown",
    }
}

/// Turns a raw AppUserModelId (e.g. `Spotify.exe`, `chrome.exe`, a packaged app
/// family name) into a short, human-friendly source label for the island.
fn friendly_app_label(id: &str) -> String {
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

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn ticks_to_ms(span: TimeSpan) -> i64 {
    span.Duration / 10_000
}

fn media_error(context: &str, error: windows::core::Error) -> String {
    format!("{context}: {error}")
}

fn current_unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}
