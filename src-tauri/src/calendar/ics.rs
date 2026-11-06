//! iCalendar (RFC 5545) events, as ICS subscription links and CalDAV servers send them: the
//! VEVENTs of a calendar, with repeating ones expanded (the `rrule` crate) into the occurrences
//! within a time range. Only what the island shows is read: title, times, location, description
//! and URL. Anything malformed is skipped rather than failing the whole calendar.

use std::{collections::HashMap, str::FromStr};

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc};
use rrule::{RRule, Tz, Unvalidated};

use super::meeting_link::meeting_link;

/// Occurrences of one repeating event looked at, at most, per range.
const MAX_OCCURRENCES: u16 = 500;

/// One occurrence of an event, as the island shows it.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub(super) uid: String,
    pub(super) title: String,
    /// Unix ms; an all-day event runs from local midnight to local midnight.
    pub(super) start_ms: i64,
    pub(super) end_ms: i64,
    pub(super) all_day: bool,
    pub(super) location: Option<String>,
    /// A join link of a known meeting service (meeting_link.rs).
    pub(super) meeting_link: Option<String>,
    /// The name of the calendar it came from; set by the caller.
    pub(super) calendar: String,
}

/// One content line: its name (upper case), parameters and value, unfolded.
#[derive(Debug)]
struct Property {
    name: String,
    params: HashMap<String, String>,
    value: String,
}

/// Content lines with folded continuations (a line starting with a space or tab) joined.
fn unfold(text: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for line in text.split('\n').map(|line| line.trim_end_matches('\r')) {
        match (line.strip_prefix([' ', '\t']), lines.last_mut()) {
            (Some(rest), Some(last)) => last.push_str(rest),
            _ if !line.is_empty() => lines.push(line.to_string()),
            _ => {}
        }
    }
    lines
}

fn property(line: &str) -> Option<Property> {
    // The value starts after the first colon outside a quoted parameter value.
    let mut quoted = false;
    let split = line.char_indices().find(|&(_, c)| {
        if c == '"' {
            quoted = !quoted;
        }
        c == ':' && !quoted
    })?;
    let (head, value) = (&line[..split.0], &line[split.0 + 1..]);
    let mut parts = head.split(';');
    let name = parts.next()?.trim().to_ascii_uppercase();
    let params = parts
        .filter_map(|part| part.split_once('='))
        .map(|(key, value)| (key.trim().to_ascii_uppercase(), value.trim().trim_matches('"').to_string()))
        .collect();
    Some(Property { name, params, value: value.to_string() })
}

/// TEXT values: `\n`, `\,`, `\;` and `\\`.
fn unescape(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            result.push(c);
            continue;
        }
        match chars.next() {
            Some('n' | 'N') => result.push('\n'),
            Some(other) => result.push(other),
            None => {}
        }
    }
    result.trim().to_string()
}

/// Windows time zone names that Outlook and Exchange write as TZID, mapped to IANA names.
const WINDOWS_ZONES: &[(&str, &str)] = &[
    ("China Standard Time", "Asia/Shanghai"),
    ("Taipei Standard Time", "Asia/Taipei"),
    ("Singapore Standard Time", "Asia/Singapore"),
    ("Tokyo Standard Time", "Asia/Tokyo"),
    ("Korea Standard Time", "Asia/Seoul"),
    ("India Standard Time", "Asia/Kolkata"),
    ("GMT Standard Time", "Europe/London"),
    ("W. Europe Standard Time", "Europe/Berlin"),
    ("Romance Standard Time", "Europe/Paris"),
    ("Eastern Standard Time", "America/New_York"),
    ("Central Standard Time", "America/Chicago"),
    ("Mountain Standard Time", "America/Denver"),
    ("Pacific Standard Time", "America/Los_Angeles"),
    ("AUS Eastern Standard Time", "Australia/Sydney"),
    ("UTC", "UTC"),
];

/// The zone a TZID names: an IANA name (also at the end of a path, as some servers write), a
/// Windows name, else this computer's zone.
pub(super) fn zone(tzid: Option<&str>) -> Tz {
    let Some(tzid) = tzid.map(str::trim).filter(|tzid| !tzid.is_empty()) else {
        return Tz::LOCAL;
    };
    let iana = WINDOWS_ZONES.iter().find(|(windows, _)| windows.eq_ignore_ascii_case(tzid)).map_or(tzid, |(_, iana)| iana);
    let parse = |name: &str| chrono_tz::Tz::from_str(name).ok().map(Tz::Tz);
    parse(iana)
        .or_else(|| {
            let mut parts = iana.rsplit('/');
            let (last, area) = (parts.next()?, parts.next()?);
            parse(&format!("{area}/{last}"))
        })
        .unwrap_or(Tz::LOCAL)
}

/// A DATE-TIME or DATE value with its TZID; a date is all-day, at local midnight.
fn moment(property: &Property) -> Option<(DateTime<Tz>, bool)> {
    let value = property.value.trim();
    if property.params.get("VALUE").is_some_and(|kind| kind == "DATE") || value.len() == 8 {
        let date = NaiveDate::parse_from_str(value, "%Y%m%d").ok()?;
        return Tz::LOCAL.from_local_datetime(&date.and_hms_opt(0, 0, 0)?).earliest().map(|at| (at, true));
    }
    if let Some(utc) = value.strip_suffix('Z') {
        let naive = NaiveDateTime::parse_from_str(utc, "%Y%m%dT%H%M%S").ok()?;
        return Some((Tz::UTC.from_utc_datetime(&naive), false));
    }
    let naive = NaiveDateTime::parse_from_str(value, "%Y%m%dT%H%M%S").ok()?;
    zone(property.params.get("TZID").map(String::as_str)).from_local_datetime(&naive).earliest().map(|at| (at, false))
}

/// `PT1H30M`, `P1D`, `-PT15M` and the like.
fn duration(value: &str) -> Option<Duration> {
    let (sign, rest) = match value.trim().strip_prefix('-') {
        Some(rest) => (-1, rest),
        None => (1, value.trim().trim_start_matches('+')),
    };
    let rest = rest.strip_prefix('P')?;
    let (mut total, mut number, mut in_time) = (0i64, 0i64, false);
    for c in rest.chars() {
        match c {
            'T' => in_time = true,
            '0'..='9' => number = number * 10 + i64::from(c as u8 - b'0'),
            'W' => total += number * 7 * 86_400,
            'D' => total += number * 86_400,
            'H' if in_time => total += number * 3600,
            'M' if in_time => total += number * 60,
            'S' if in_time => total += number,
            _ => return None,
        }
        if !c.is_ascii_digit() {
            number = 0;
        }
    }
    Some(Duration::seconds(sign * total))
}

/// One VEVENT as written.
#[derive(Debug, Default)]
struct RawEvent {
    uid: String,
    summary: String,
    location: Option<String>,
    description: Option<String>,
    url: Option<String>,
    start: Option<(DateTime<Tz>, bool)>,
    end: Option<DateTime<Tz>>,
    duration: Option<Duration>,
    rrule: Option<String>,
    exdates: Vec<i64>,
    recurrence_id: Option<i64>,
    cancelled: bool,
}

impl RawEvent {
    fn length(&self, start: &DateTime<Tz>, all_day: bool) -> Duration {
        self.end
            .map(|end| end.signed_duration_since(start))
            .or(self.duration)
            .filter(|length| *length >= Duration::zero())
            .unwrap_or_else(|| if all_day { Duration::days(1) } else { Duration::zero() })
    }

    fn occurrence(&self, start: DateTime<Tz>, all_day: bool, length: Duration) -> CalendarEvent {
        let start_ms = start.timestamp_millis();
        CalendarEvent {
            uid: self.uid.clone(),
            title: self.summary.clone(),
            start_ms,
            end_ms: start_ms + length.num_milliseconds(),
            all_day,
            location: self.location.clone(),
            meeting_link: meeting_link(&[self.url.as_deref(), self.location.as_deref(), self.description.as_deref()]),
            calendar: String::new(),
        }
    }
}

fn raw_events(text: &str) -> Vec<RawEvent> {
    let mut events = Vec::new();
    let mut current: Option<RawEvent> = None;
    // Nested components (VALARM) inside an event are skipped.
    let mut nested = 0usize;
    for property in unfold(text).iter().filter_map(|line| property(line)) {
        match (property.name.as_str(), property.value.trim().to_ascii_uppercase().as_str()) {
            ("BEGIN", "VEVENT") => current = Some(RawEvent::default()),
            ("END", "VEVENT") => events.extend(current.take()),
            ("BEGIN", _) if current.is_some() => nested += 1,
            ("END", _) if current.is_some() && nested > 0 => nested -= 1,
            _ => {}
        }
        let Some(event) = current.as_mut().filter(|_| nested == 0) else {
            continue;
        };
        match property.name.as_str() {
            "UID" => event.uid = property.value.trim().to_string(),
            "SUMMARY" => event.summary = unescape(&property.value),
            "LOCATION" => event.location = Some(unescape(&property.value)).filter(|text| !text.is_empty()),
            "DESCRIPTION" => event.description = Some(unescape(&property.value)),
            "URL" => event.url = Some(property.value.trim().to_string()),
            "DTSTART" => event.start = moment(&property),
            "DTEND" => event.end = moment(&property).map(|(at, _)| at),
            "DURATION" => event.duration = duration(&property.value),
            "RRULE" => event.rrule = Some(property.value.trim().to_string()),
            "EXDATE" => {
                for value in property.value.split(',') {
                    let single = Property { name: String::new(), params: property.params.clone(), value: value.to_string() };
                    event.exdates.extend(moment(&single).map(|(at, _)| at.timestamp_millis()));
                }
            }
            "RECURRENCE-ID" => event.recurrence_id = moment(&property).map(|(at, _)| at.timestamp_millis()),
            "STATUS" => event.cancelled = property.value.trim().eq_ignore_ascii_case("CANCELLED"),
            _ => {}
        }
    }
    events
}

/// The rule without UNTIL, and UNTIL as Unix ms. `rrule` insists UNTIL share DTSTART's zone,
/// which calendars do not always do, so the end is applied here.
fn split_until(rule: &str) -> (String, Option<i64>) {
    let mut until = None;
    let parts: Vec<&str> = rule
        .split(';')
        .filter(|part| match part.split_once('=') {
            Some((key, value)) if key.eq_ignore_ascii_case("UNTIL") => {
                let property = Property { name: String::new(), params: HashMap::new(), value: value.to_string() };
                until = moment(&property).map(|(at, all_day)| at.timestamp_millis() + if all_day { 86_399_999 } else { 0 });
                false
            }
            _ => true,
        })
        .collect();
    (parts.join(";"), until)
}

/// The starts of a repeating event within `[from - length, to)`; only the first start when the
/// rule cannot be read.
fn repeats(rule: &str, start: DateTime<Tz>, length: Duration, from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<DateTime<Tz>> {
    let (rule, until) = split_until(rule);
    let Ok(set) = rule.parse::<RRule<Unvalidated>>().and_then(|rule| rule.build(start)) else {
        return vec![start];
    };
    let tz = start.timezone();
    // A second before, as `after` is exclusive.
    let after = (from - length - Duration::seconds(1)).with_timezone(&tz);
    let before = to.with_timezone(&tz);
    set.after(after)
        .before(before)
        .all(MAX_OCCURRENCES)
        .dates
        .into_iter()
        .filter(|at| until.is_none_or(|until| at.timestamp_millis() <= until))
        .collect()
}

/// The occurrences of the calendar's events that overlap `[from, to)`, sorted by start.
pub(super) fn events_between(text: &str, from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<CalendarEvent> {
    let raw = raw_events(text);
    let overlaps = |event: &CalendarEvent| {
        event.end_ms.max(event.start_ms + 1) > from.timestamp_millis() && event.start_ms < to.timestamp_millis()
    };
    // Changed occurrences of a repeating event: uid -> the starts they replace.
    let mut moved: HashMap<&str, Vec<i64>> = HashMap::new();
    for event in raw.iter().filter(|event| event.recurrence_id.is_some()) {
        moved.entry(event.uid.as_str()).or_default().extend(event.recurrence_id);
    }
    let mut events = Vec::new();
    for event in &raw {
        let Some((start, all_day)) = event.start else {
            continue;
        };
        let length = event.length(&start, all_day);
        if event.cancelled {
            continue;
        }
        let starts = match (&event.rrule, event.recurrence_id) {
            (Some(rule), None) => repeats(rule, start, length, from, to),
            _ => vec![start],
        };
        let replaced = moved.get(event.uid.as_str()).filter(|_| event.recurrence_id.is_none());
        for at in starts {
            let ms = at.timestamp_millis();
            if event.exdates.contains(&ms) || replaced.is_some_and(|starts| starts.contains(&ms)) {
                continue;
            }
            let occurrence = event.occurrence(at, all_day, length);
            if overlaps(&occurrence) {
                events.push(occurrence);
            }
        }
    }
    events.sort_by(|a, b| (a.start_ms, &a.title).cmp(&(b.start_ms, &b.title)));
    events
}

#[cfg(test)]
mod tests;
