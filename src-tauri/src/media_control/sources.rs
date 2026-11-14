//! Merge SMTC players with Core Audio streams, including non-default output devices.

use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as MediaSessionManager;

use super::{audio::AUDIO_ACTIVE_THRESHOLD, service::{MediaCommand, MediaSessionInfo, MediaState}, session};
use crate::win32::{audio::{AudioDevices, AudioSession}, process};

pub(super) struct Source {
    pub(super) info: MediaSessionInfo,
    streams: Vec<AudioSession>,
}

impl Source {
    fn matches(&self, id: &str) -> bool {
        self.info.id == id || self.info.aliases.iter().any(|alias| alias == id)
    }

    fn excluded(&self, excluded: &[String]) -> bool {
        excluded.iter().any(|id| self.matches(id))
    }

    pub(super) fn peak(&self) -> f32 {
        self.streams.iter().filter(|stream| !stream.muted().unwrap_or(true))
            .map(AudioSession::peak).fold(0.0, f32::max)
    }

    fn muted(&self) -> bool {
        !self.streams.is_empty() && self.streams.iter().all(|stream| stream.muted().unwrap_or(true))
    }
}

fn file_name(path: &str) -> &str {
    path.rsplit(['\\', '/']).next().unwrap_or(path)
}

/// Match executable names / known player aliases, never a transient process id.
fn same_app(media_id: &str, path: &str) -> bool {
    let name = file_name(path).to_ascii_lowercase();
    let stem = name.strip_suffix(".exe").unwrap_or(&name);
    let media = media_id.to_ascii_lowercase();
    media == path.to_ascii_lowercase()
        || media.split(['\\', '/', '!', '_', '.', '-']).any(|part| part == stem)
        || (session::friendly_app_label(media_id) == session::friendly_app_label(&name)
            && session::friendly_app_label(&name) != name)
}

pub(super) fn discover() -> (Option<MediaSessionManager>, Vec<Source>) {
    // One unavailable Windows service must not disable the other discovery path.
    let manager = session::request_manager().ok();
    let mut sources: Vec<_> = manager.as_ref().map(session::list_sessions).unwrap_or_default()
        .into_iter().map(|info| Source { info, streams: Vec::new() }).collect();
    let outputs = AudioDevices::open().and_then(|devices| devices.active_outputs()).unwrap_or_default();
    let mut paths = std::collections::HashMap::new();
    for stream in outputs.iter().flat_map(|output| output.sessions().unwrap_or_default()) {
        let Ok(pid) = stream.process_id() else { continue; };
        if pid == 0 || pid == std::process::id() { continue; }
        let Some(path) = paths.entry(pid).or_insert_with(|| process::image_path(pid)).as_ref() else { continue; };
        let id = format!("audio:{}", path.to_lowercase());
        let index = sources.iter().position(|source| source.matches(&id)
            || (source.info.kind == "media" && same_app(&source.info.id, path)));
        if let Some(index) = index {
            let source = &mut sources[index];
            if source.info.id != id && !source.info.aliases.contains(&id) { source.info.aliases.push(id); }
            source.streams.push(stream);
        } else {
            sources.push(Source {
                info: MediaSessionInfo {
                    id, label: session::friendly_app_label(file_name(path)), playing: false,
                    kind: "audio", aliases: Vec::new(),
                },
                streams: vec![stream],
            });
        }
    }
    for source in &mut sources {
        if source.info.kind == "audio" {
            source.info.playing = source.streams.iter().any(|stream| stream.active() && !stream.muted().unwrap_or(true));
        }
        source.info.aliases.sort();
    }
    // Device enumeration order can change after reconnecting headphones.
    sources.sort_by(|a, b| a.info.id.cmp(&b.info.id));
    (manager, sources)
}

pub(super) fn select<'a>(sources: &'a [Source], target: Option<&str>, excluded: &[String]) -> Option<&'a Source> {
    let eligible = |source: &&Source| !source.excluded(excluded);
    if let Some(id) = target { return sources.iter().filter(eligible).find(|source| source.matches(id)); }
    sources.iter().filter(eligible).min_by_key(|source| (!source.info.playing, source.info.kind != "media"))
}

pub(super) fn read_state(target: Option<&str>, excluded: &[String]) -> Result<MediaState, String> {
    let (manager, sources) = discover();
    state_from_sources(manager.as_ref(), &sources, target, excluded)
}

pub(super) fn state_from_sources(
    manager: Option<&MediaSessionManager>, sources: &[Source], target: Option<&str>, excluded: &[String],
) -> Result<MediaState, String> {
    let selected = select(sources, target, excluded);
    let mut state = match selected {
        Some(source) if source.info.kind == "media" => {
            let manager = manager.ok_or("The Windows media session service is unavailable.")?;
            session::read_media_state_from_manager(manager, Some(&source.info.id))?
        }
        Some(source) => MediaState {
            available: true,
            control_mode: "audio",
            audio_muted: Some(source.muted()),
            playback_status: if source.info.playing { "playing" } else { "paused" },
            source_app: Some(source.info.label.clone()),
            active_session_id: Some(source.info.id.clone()),
            ..MediaState::empty()
        },
        None => MediaState::empty(),
    };
    if let Some(source) = selected {
        state.audio_peak = source.peak();
        state.audio_active = state.audio_peak > AUDIO_ACTIVE_THRESHOLD;
    }
    state.sessions = sources.iter().map(|source| source.info.clone()).collect();
    state.resume_blocked = selected.is_none() && !excluded.is_empty();
    state.volume = super::audio::read_master_volume().unwrap_or(-1.0);
    Ok(state)
}

pub(super) fn toggle_sound(source: &Source) -> Result<(), String> {
    // Read every previous value before changing anything (a device may disappear).
    let previous = source.streams.iter().map(|stream| stream.muted().map(|muted| (stream, muted)))
        .collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    let muted = !previous.iter().all(|(_, muted)| *muted);
    let mut changed: Vec<(&AudioSession, bool)> = Vec::new();
    for (stream, previous) in previous {
        if let Err(error) = stream.set_muted(muted) {
            for (stream, previous) in changed { let _ = stream.set_muted(previous); }
            return Err(format!("Could not change this application's sound: {error}"));
        }
        changed.push((stream, previous));
    }
    Ok(())
}

pub(super) fn run_command(command: MediaCommand, target: Option<&str>, excluded: &[String]) -> Result<MediaState, String> {
    let (manager, sources) = discover();
    let Some(source) = select(&sources, target, excluded) else {
        if target.is_some() || !excluded.is_empty() {
            return Err("No adopted media source is available.".into());
        }
        if let Some(key) = command.as_media_key() { session::send_media_key(key); }
        return read_state(None, excluded);
    };
    if source.info.kind == "audio" {
        if !matches!(command, MediaCommand::PlayPause) {
            return Err("This application only supports muting and restoring its sound.".into());
        }
        toggle_sound(source)?;
    } else {
        let manager = manager.as_ref().ok_or("The Windows media session service is unavailable.")?;
        let session = session::session_by_id(manager, &source.info.id)?
            .ok_or("The selected media source is no longer available.")?;
        if !session::run_session_command(&session, command)? {
            return Err("The selected media source did not accept the command.".into());
        }
    }
    std::thread::sleep(std::time::Duration::from_millis(40));
    read_state(Some(&source.info.id), excluded)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(id: &str, kind: &'static str, playing: bool) -> Source {
        Source { info: MediaSessionInfo { id: id.into(), label: id.into(), kind, playing, aliases: vec![] }, streams: vec![] }
    }

    #[test]
    fn matches_executables_and_known_aliases_without_substring_collisions() {
        assert!(same_app("Chrome", r"C:\Apps\chrome.exe"));
        assert!(same_app("QQMusic", r"D:\QQMusic\QQMusic.exe"));
        assert!(same_app("Netease.CloudMusic", r"D:\CloudMusic\cloudmusic.exe"));
        assert!(!same_app("foo", r"C:\Apps\foobar.exe"));
        assert!(!same_app("Music", r"C:\Apps\qqmusic.exe"));
    }

    #[test]
    fn explicit_or_excluded_sources_never_fall_back_to_another_player() {
        let mut audio = source("audio:player", "audio", true);
        audio.info.aliases.push("old-player".into());
        let sources = [source("media", "media", true), audio];
        assert_eq!(select(&sources, None, &[]).map(|source| source.info.id.as_str()), Some("media"));
        assert!(select(&sources, Some("missing"), &[]).is_none());
        assert!(select(&sources, Some("audio:player"), &["old-player".into()]).is_none());
        assert!(select(&sources, None, &["media".into(), "old-player".into()]).is_none());
        assert_eq!(select(&sources, Some("old-player"), &[]).map(|source| source.info.kind), Some("audio"));
    }
}
