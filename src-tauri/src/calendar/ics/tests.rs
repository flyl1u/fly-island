use chrono::{TimeZone, Utc};

use super::*;

fn utc(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(y, mo, d, h, mi, 0).unwrap()
}

fn ms(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> i64 {
    utc(y, mo, d, h, mi).timestamp_millis()
}

const CALENDAR: &str = "BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:weekly@example\r
SUMMARY:周会\r
DTSTART;TZID=Asia/Shanghai:20261102T100000\r
DTEND;TZID=Asia/Shanghai:20261102T110000\r
RRULE:FREQ=WEEKLY;BYDAY=MO,FR;UNTIL=20261231T000000Z\r
EXDATE;TZID=Asia/Shanghai:20261106T100000\r
LOCATION:3 楼\\, 大会议室\r
DESCRIPTION:腾讯会议：https://meeting.tencent.com/dm/jvAnx\r
 AmrDfHt\\n记得带电脑\r
BEGIN:VALARM\r
TRIGGER:-PT10M\r
DESCRIPTION:Reminder\r
END:VALARM\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:weekly@example\r
RECURRENCE-ID;TZID=Asia/Shanghai:20261109T100000\r
SUMMARY:周会（改到下午）\r
DTSTART;TZID=Asia/Shanghai:20261109T150000\r
DURATION:PT30M\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:outlook@example\r
SUMMARY:1:1\r
DTSTART;TZID=\"China Standard Time\":20261109T090000\r
DTEND;TZID=\"China Standard Time\":20261109T093000\r
URL:https://teams.microsoft.com/l/meetup-join/19%3ameeting\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:cancelled@example\r
SUMMARY:取消了\r
STATUS:CANCELLED\r
DTSTART:20261109T020000Z\r
DTEND:20261109T030000Z\r
END:VEVENT\r
END:VCALENDAR\r
";

#[test]
fn events_in_a_range_with_repeats_exceptions_and_moved_occurrences() {
    // Monday 9 Nov 2026, Shanghai time (UTC+8), and the week before.
    let events = events_between(CALENDAR, utc(2026, 11, 5, 16, 0), utc(2026, 11, 9, 16, 0));
    let summary: Vec<(&str, i64, i64)> = events.iter().map(|event| (event.title.as_str(), event.start_ms, event.end_ms)).collect();
    assert_eq!(
        summary,
        [
            // Friday 6 Nov is excluded; Monday 9 Nov at 10:00 moved to 15:00 for 30 minutes.
            ("1:1", ms(2026, 11, 9, 1, 0), ms(2026, 11, 9, 1, 30)),
            ("周会（改到下午）", ms(2026, 11, 9, 7, 0), ms(2026, 11, 9, 7, 30)),
        ]
    );
    assert_eq!(events[0].meeting_link.as_deref(), Some("https://teams.microsoft.com/l/meetup-join/19%3ameeting"));

    let friday = events_between(CALENDAR, utc(2026, 11, 12, 16, 0), utc(2026, 11, 13, 16, 0));
    assert_eq!(friday.len(), 1);
    let weekly = &friday[0];
    assert_eq!((weekly.title.as_str(), weekly.start_ms, weekly.end_ms), ("周会", ms(2026, 11, 13, 2, 0), ms(2026, 11, 13, 3, 0)));
    assert_eq!(weekly.location.as_deref(), Some("3 楼, 大会议室"));
    // The folded description still gives the whole link; the alarm's description is not taken.
    assert_eq!(weekly.meeting_link.as_deref(), Some("https://meeting.tencent.com/dm/jvAnxAmrDfHt"));
    // UNTIL ends the series.
    assert!(events_between(CALENDAR, utc(2027, 1, 3, 16, 0), utc(2027, 1, 8, 16, 0)).is_empty());
}

#[test]
fn an_event_already_running_at_the_range_start_is_included() {
    let running = events_between(CALENDAR, utc(2026, 11, 13, 2, 30), utc(2026, 11, 13, 16, 0));
    assert_eq!(running.iter().map(|event| event.title.as_str()).collect::<Vec<_>>(), ["周会"]);
}

#[test]
fn all_day_events_run_from_local_midnight_for_a_day() {
    let text = "BEGIN:VEVENT\nUID:a\nSUMMARY:国庆\nDTSTART;VALUE=DATE:20261001\nDTEND;VALUE=DATE:20261003\nEND:VEVENT\n";
    let events = events_between(text, utc(2026, 9, 30, 0, 0), utc(2026, 10, 5, 0, 0));
    let midnight = |d: u32| Tz::LOCAL.with_ymd_and_hms(2026, 10, d, 0, 0, 0).unwrap().timestamp_millis();
    assert_eq!((events[0].all_day, events[0].start_ms, events[0].end_ms), (true, midnight(1), midnight(3)));
    let one_day = "BEGIN:VEVENT\nUID:b\nSUMMARY:x\nDTSTART;VALUE=DATE:20261001\nEND:VEVENT\n";
    let events = events_between(one_day, utc(2026, 9, 30, 0, 0), utc(2026, 10, 5, 0, 0));
    assert_eq!(events[0].end_ms - events[0].start_ms, 86_400_000);
}

#[test]
fn zones_durations_and_escapes_are_read() {
    assert_eq!(zone(Some("China Standard Time")), Tz::Tz(chrono_tz::Asia::Shanghai));
    assert_eq!(zone(Some("/freeassociation.sourceforge.net/Tzfile/Europe/Berlin")), Tz::Tz(chrono_tz::Europe::Berlin));
    assert_eq!(zone(Some("Nowhere/Special")), Tz::LOCAL);
    assert_eq!(zone(None), Tz::LOCAL);
    assert_eq!(duration("PT1H30M"), Some(Duration::minutes(90)));
    assert_eq!(duration("P1DT2H"), Some(Duration::hours(26)));
    assert_eq!(duration("-PT15M"), Some(Duration::minutes(-15)));
    assert_eq!(duration("1H"), None);
    assert_eq!(unescape("a\\, b\\; c\\nd\\\\"), "a, b; c\nd\\");
    assert!(events_between("not a calendar", utc(2026, 1, 1, 0, 0), utc(2027, 1, 1, 0, 0)).is_empty());
}
