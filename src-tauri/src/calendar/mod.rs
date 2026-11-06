//! Calendars for the island: today's and tomorrow's events and the next meeting, from the
//! calendars the user added (sources.rs): ICS subscription links and CalDAV accounts. Nothing is
//! fetched until a calendar is added. Events are read again every 15 minutes, or at once when the
//! island asks (it opened the calendar page), and kept in memory only.

mod caldav;
mod ics;
mod meeting_link;
mod sources;

use std::{
    sync::{Mutex, PoisonError},
    time::{Duration, Instant},
};

use chrono::{DateTime, Days, Local, TimeZone, Utc};
use serde::Serialize;
use tauri::{AppHandle, Manager};

use ics::{events_between, CalendarEvent};
use sources::{CalendarSource, SourceKind, MAX_SOURCES};

/// Events are read again after this long.
const REFRESH_AFTER: Duration = Duration::from_secs(15 * 60);
/// An ICS file far past this is not one person's calendar.
const MAX_ICS_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceProblem {
    source_id: String,
    message: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSnapshot {
    /// Today's and tomorrow's events of every calendar, by start.
    events: Vec<CalendarEvent>,
    /// Calendars that could not be read this time, and why.
    problems: Vec<SourceProblem>,
    /// When the events were read (Unix ms); 0 before the first read.
    fetched_at: i64,
    /// How many calendars are added; the island shows its calendar page only with one.
    source_count: usize,
}

struct Cached {
    snapshot: CalendarSnapshot,
    at: Instant,
    /// The sources it was read from, so adding or removing one reads again.
    sources: Vec<CalendarSource>,
}

static CACHE: Mutex<Option<Cached>> = Mutex::new(None);

/// From this computer's midnight today to midnight two days on.
fn window(now: DateTime<Local>) -> (DateTime<Utc>, DateTime<Utc>) {
    let midnight = now.date_naive().and_hms_opt(0, 0, 0).and_then(|naive| Local.from_local_datetime(&naive).earliest()).unwrap_or(now);
    let end = midnight.checked_add_days(Days::new(2)).unwrap_or(midnight);
    (midnight.with_timezone(&Utc), end.with_timezone(&Utc))
}

fn app_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

async fn fetch_ics(link: &str) -> Result<String, String> {
    let url = sources::ics_url(link)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client.get(url).send().await.map_err(|error| format!("连不上日历：{error}"))?;
    match response.status().as_u16() {
        401 | 403 | 404 => return Err("订阅链接已失效，或没有权限。".into()),
        status if !(200..300).contains(&status) => return Err(format!("日历返回 {status}。")),
        _ => {}
    }
    let bytes = response.bytes().await.map_err(|error| format!("读取日历失败：{error}"))?;
    if bytes.len() > MAX_ICS_BYTES {
        return Err("日历文件太大。".into());
    }
    let text = String::from_utf8_lossy(&ungzip(&bytes)?).to_string();
    if !text.contains("BEGIN:VCALENDAR") {
        return Err("这个链接不是日历（iCalendar）。".into());
    }
    Ok(text)
}

/// The body as sent, unpacked when it is gzip: Apple's calendar servers send gzip even to clients
/// that did not ask for it.
fn ungzip(bytes: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;
    if !bytes.starts_with(&[0x1f, 0x8b]) {
        return Ok(bytes.to_vec());
    }
    let mut unpacked = Vec::new();
    flate2::read::GzDecoder::new(bytes)
        .take(MAX_ICS_BYTES as u64 + 1)
        .read_to_end(&mut unpacked)
        .map_err(|_| "日历内容损坏。".to_string())?;
    if unpacked.len() > MAX_ICS_BYTES {
        return Err("日历文件太大。".into());
    }
    Ok(unpacked)
}

/// The events of one calendar in the window.
async fn read_source(source: &CalendarSource, secret: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<CalendarEvent>, String> {
    let texts = match source.kind {
        SourceKind::Ics => vec![fetch_ics(secret).await?],
        SourceKind::Caldav => {
            let account = caldav::Account { url: &source.url, username: &source.username, password: secret };
            caldav::fetch(&account, from, to).await?
        }
    };
    let mut events: Vec<CalendarEvent> = texts.iter().flat_map(|text| events_between(text, from, to)).collect();
    for event in &mut events {
        event.calendar = source.name.clone();
    }
    Ok(events)
}

async fn read_all(sources: &[CalendarSource]) -> CalendarSnapshot {
    let (from, to) = window(Local::now());
    let mut snapshot = CalendarSnapshot { fetched_at: Utc::now().timestamp_millis(), source_count: sources.len(), ..CalendarSnapshot::default() };
    for source in sources {
        let result = match sources::read_secret(&source.id) {
            Ok(Some(secret)) => read_source(source, &secret, from, to).await,
            Ok(None) => Err("找不到保存的密码或订阅链接，请删掉这个日历再加一次。".into()),
            Err(error) => Err(error),
        };
        match result {
            Ok(events) => snapshot.events.extend(events),
            Err(message) => snapshot.problems.push(SourceProblem { source_id: source.id.clone(), message }),
        }
    }
    // The same event in two calendars (shared, or added twice) shows once.
    snapshot.events.sort_by(|a, b| (a.start_ms, &a.uid).cmp(&(b.start_ms, &b.uid)));
    snapshot.events.dedup_by(|a, b| a.uid == b.uid && a.start_ms == b.start_ms);
    snapshot
}

/// Today's and tomorrow's events. Read again when 15 minutes old, when the calendars changed, or
/// with `refresh`; with no calendar added, nothing is read and the list is empty.
#[tauri::command]
pub async fn get_calendar_events(app: AppHandle, refresh: bool) -> Result<CalendarSnapshot, String> {
    let sources = sources::read(&app_dir(&app)?);
    if sources.is_empty() {
        return Ok(CalendarSnapshot::default());
    }
    {
        let cache = CACHE.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(cached) = cache.as_ref().filter(|cached| !refresh && cached.sources == sources && cached.at.elapsed() < REFRESH_AFTER) {
            return Ok(cached.snapshot.clone());
        }
    }
    let snapshot = read_all(&sources).await;
    *CACHE.lock().unwrap_or_else(PoisonError::into_inner) = Some(Cached { snapshot: snapshot.clone(), at: Instant::now(), sources });
    Ok(snapshot)
}

#[tauri::command]
pub fn list_calendar_sources(app: AppHandle) -> Result<Vec<CalendarSource>, String> {
    Ok(sources::read(&app_dir(&app)?))
}

/// Adds a calendar after reading it once, so a wrong link or password is said at once.
/// `secret` is the ICS link, or the CalDAV password.
#[tauri::command]
pub async fn add_calendar_source(
    app: AppHandle,
    kind: SourceKind,
    name: String,
    url: String,
    username: String,
    secret: String,
) -> Result<CalendarSource, String> {
    let dir = app_dir(&app)?;
    let mut saved = sources::read(&dir);
    if saved.len() >= MAX_SOURCES {
        return Err(format!("最多添加 {MAX_SOURCES} 个日历。"));
    }
    let secret = secret.trim().to_string();
    if secret.is_empty() {
        return Err(if kind == SourceKind::Ics { "请填写订阅链接。" } else { "请填写密码。" }.into());
    }
    let (url, host) = match kind {
        SourceKind::Ics => (String::new(), sources::ics_url(&secret)?.host_str().unwrap_or_default().to_string()),
        SourceKind::Caldav => {
            if username.trim().is_empty() {
                return Err("请填写账号。".into());
            }
            (url.trim().to_string(), sources::host_of(&url))
        }
    };
    let name = Some(name.trim().chars().take(40).collect::<String>()).filter(|name| !name.is_empty()).unwrap_or_else(|| host.clone());
    let source = CalendarSource {
        id: format!("cal-{}", Utc::now().timestamp_millis()),
        kind,
        name,
        url,
        host,
        username: username.trim().to_string(),
    };
    let (from, to) = window(Local::now());
    read_source(&source, &secret, from, to).await?;
    sources::save_secret(&source.id, &secret)?;
    saved.push(source.clone());
    sources::write(&dir, &saved)?;
    Ok(source)
}

#[tauri::command]
pub fn remove_calendar_source(app: AppHandle, id: String) -> Result<(), String> {
    let dir = app_dir(&app)?;
    let mut saved = sources::read(&dir);
    saved.retain(|source| source.id != id);
    sources::write(&dir, &saved)?;
    sources::delete_secret(&id)
}

/// This module's Tauri commands, chained into `lib.rs`'s `generate_handler!`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::calendar::get_calendar_events,
            crate::calendar::list_calendar_sources,
            crate::calendar::add_calendar_source,
            crate::calendar::remove_calendar_source,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gzip_bodies_are_unpacked_and_others_kept() {
        use std::io::Write;
        let mut packed = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        packed.write_all(b"BEGIN:VCALENDAR").unwrap();
        assert_eq!(ungzip(&packed.finish().unwrap()).unwrap(), b"BEGIN:VCALENDAR");
        assert_eq!(ungzip(b"BEGIN:VCALENDAR").unwrap(), b"BEGIN:VCALENDAR");
        assert!(ungzip(&[0x1f, 0x8b, 0, 0]).is_err());
    }

    #[test]
    fn the_window_runs_from_local_midnight_for_two_days() {
        let now = Local.with_ymd_and_hms(2026, 11, 7, 15, 30, 0).unwrap();
        let (from, to) = window(now);
        assert_eq!(from, Local.with_ymd_and_hms(2026, 11, 7, 0, 0, 0).unwrap().with_timezone(&Utc));
        assert_eq!(to, Local.with_ymd_and_hms(2026, 11, 9, 0, 0, 0).unwrap().with_timezone(&Utc));
    }
}
