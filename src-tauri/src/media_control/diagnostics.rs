use std::path::Path;
use serde::Serialize;
use super::session;
use crate::win32;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaDiagnostics { players: Vec<PlayerDiagnostic> }

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerDiagnostic {
    source_app_id: String,
    label: String,
    has_session: bool,
    has_timeline: bool,
    has_plugin_track_id: bool,
    exe_path: Option<String>,
    directory: Option<String>,
    version: Option<String>,
    status: &'static str,
    netease_plugin_state: Option<&'static str>,
}

fn player_kind(id: &str) -> Option<&'static str> {
    let id = id.to_ascii_lowercase();
    if id.contains("cloudmusic") || id.contains("netease") { Some("cloudmusic.exe") }
    else if id.contains("qqmusic") { Some("QQMusic.exe") }
    else if id.contains("kugou") { Some("KuGou.exe") }
    else { None }
}

fn version_parts(version: &str) -> Option<[u32; 4]> {
    let parts: Vec<_> = version.split('.').map(str::parse::<u32>).collect::<Result<_, _>>().ok()?;
    if !(3..=4).contains(&parts.len()) { return None; }
    let mut result = [0; 4];
    result[..parts.len()].copy_from_slice(&parts);
    Some(result)
}

fn needs_update(version: Option<&str>) -> bool {
    version.and_then(version_parts).is_some_and(|version| version < [21, 10, 2962, 0])
}

fn status(kind: Option<&str>, has_session: bool, timeline: bool, version: Option<&str>) -> &'static str {
    if !has_session { "smtcOff" }
    else if timeline { "ok" }
    else if kind == Some("QQMusic.exe") && needs_update(version) { "needsUpdate" }
    else if kind == Some("cloudmusic.exe") { "neteaseNeedsPlugin" }
    else { "noTimeline" }
}

fn plugin_state(directory: Option<&Path>) -> &'static str {
    let Some(directory) = directory else { return "unknown"; };
    let loader = match directory.join("msimg32.dll").try_exists() { Ok(value) => value, Err(_) => return "unknown" };
    let plugins = std::fs::read_dir(r"C:\betterncm\plugins");
    let installed = match plugins {
        Ok(entries) => {
            let mut found = false;
            for entry in entries {
                let Ok(entry) = entry else { return "unknown"; };
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if name.contains("inflink") && name.ends_with(".plugin") && entry.path().is_file() { found = true; }
            }
            found
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(_) => return "unknown",
    };
    match (loader, installed) { (true, true) => "installed", (true, false) => "loaderOnly", (false, false) => "none", _ => "unknown" }
}

fn diagnostic(id: String, has_session: bool, has_timeline: bool, has_plugin_track_id: bool, path: Option<String>) -> PlayerDiagnostic {
    let kind = player_kind(&id);
    let directory = path.as_deref().and_then(|path| Path::new(path).parent());
    let version = path.as_deref().and_then(|path| win32::file_version::read(Path::new(path)));
    PlayerDiagnostic {
        label: session::friendly_app_label(&id),
        status: status(kind, has_session, has_timeline, version.as_deref()),
        netease_plugin_state: (kind == Some("cloudmusic.exe")).then(|| plugin_state(directory)),
        directory: directory.map(|path| path.to_string_lossy().into_owned()),
        source_app_id: id, has_session, has_timeline, has_plugin_track_id, exe_path: path, version,
    }
}

pub(super) fn get() -> Result<MediaDiagnostics, String> {
    session::on_media_thread(|| {
        let known = ["cloudmusic.exe", "QQMusic.exe", "KuGou.exe"];
        // 即使进程路径不可读，也保留进程存在这一事实。
        let running: Vec<_> = known.iter().filter_map(|name| {
            let ids = win32::process_tree::process_ids_named(name);
            (!ids.is_empty()).then(|| (*name, ids.into_iter().find_map(win32::process::image_path)))
        }).collect();
        let manager = session::request_manager()?;
        let sessions = manager.GetSessions().map_err(|error| error.to_string())?;
        let mut players = Vec::new();
        for index in 0..sessions.Size().map_err(|error| error.to_string())? {
            let item = sessions.GetAt(index).map_err(|error| error.to_string())?;
            let Some(id) = session::session_id(&item) else { continue; };
            let path = running.iter().find(|(name, _)| Some(*name) == player_kind(&id)).and_then(|(_, path)| path.clone());
            let timeline = session::timeline_sample(&item).is_some_and(|sample| sample.has_timeline(session::current_unix_millis()));
            let track_id = item.TryGetMediaPropertiesAsync().ok().and_then(|op| pollster::block_on(op).ok())
                .and_then(|properties| properties.Genres().ok())
                .and_then(|genres| session::player_track_id(genres.into_iter().map(|genre| genre.to_string()))).is_some();
            players.push(diagnostic(id, true, timeline, track_id, path));
        }
        for (name, path) in running {
            if !players.iter().any(|player| player_kind(&player.source_app_id) == Some(name)) {
                players.push(diagnostic(name.to_string(), false, false, false, path));
            }
        }
        Ok(MediaDiagnostics { players })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compares_numeric_versions_and_ignores_unknown_versions() {
        for old in ["21.9.9999", "21.10.2961.9", "20.99.9999"] { assert!(needs_update(Some(old))); }
        for current in ["21.10.2962", "21.10.2962.0", "21.11.1", "22.0.0", "invalid", "21.10"] { assert!(!needs_update(Some(current))); }
        assert!(!needs_update(None));
    }
    #[test]
    fn classifies_players_by_observed_capabilities_first() {
        assert_eq!(status(Some("QQMusic.exe"), true, false, Some("21.9.1")), "needsUpdate");
        assert_eq!(status(Some("QQMusic.exe"), true, true, Some("21.9.1")), "ok");
        assert_eq!(status(Some("QQMusic.exe"), true, false, None), "noTimeline");
        assert_eq!(status(Some("cloudmusic.exe"), true, false, None), "neteaseNeedsPlugin");
        assert_eq!(status(Some("cloudmusic.exe"), false, false, None), "smtcOff");
        assert_eq!(status(Some("KuGou.exe"), false, false, None), "smtcOff");
        assert_eq!(status(None, true, false, None), "noTimeline");
        assert_eq!(status(None, true, true, None), "ok");
    }
    #[test]
    fn rejects_untrusted_position_only_timelines() {
        use super::super::timeline::TimelineSample;
        let mut sample = TimelineSample { start_ms: 0, end_ms: 0, position_ms: 500, updated_ms: Some(100_000) };
        assert!(sample.has_timeline(101_000));
        sample.updated_ms = None;
        assert!(!sample.has_timeline(101_000));
        sample.updated_ms = Some(200_000);
        assert!(!sample.has_timeline(101_000));
        sample.end_ms = 1000;
        assert!(sample.has_timeline(101_000));
    }
}
