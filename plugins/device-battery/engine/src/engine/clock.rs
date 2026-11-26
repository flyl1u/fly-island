//! UTC timestamps and the opaque public identifiers of the snapshot.
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// `2026-01-02T03:04:05.000006Z`. Fixed width, so the strings order like the times.
pub(crate) fn format_utc(time: SystemTime) -> String {
    let elapsed = time.duration_since(UNIX_EPOCH).unwrap_or(Duration::ZERO);
    let seconds = elapsed.as_secs();
    let (day, second_of_day) = (seconds / 86_400, seconds % 86_400);
    let (year, month, date) = civil_date(day);
    format!(
        "{year:04}-{month:02}-{date:02}T{:02}:{:02}:{:02}.{:06}Z",
        second_of_day / 3600,
        second_of_day / 60 % 60,
        second_of_day % 60,
        elapsed.subsec_micros()
    )
}

/// Howard Hinnant's days-to-civil conversion, for days since 1970-01-01.
fn civil_date(days: u64) -> (u64, u64, u64) {
    let shifted = days + 719_468;
    let era = shifted / 146_097;
    let day_of_era = shifted % 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let march_month = (5 * day_of_year + 2) / 153;
    let date = day_of_year - (153 * march_month + 2) / 5 + 1;
    let month = if march_month < 10 {
        march_month + 3
    } else {
        march_month - 9
    };
    let year = year_of_era + era * 400 + u64::from(month <= 2);
    (year, month, date)
}

pub(crate) fn utc_now() -> String {
    format_utc(SystemTime::now())
}

/// A stable identifier that reveals nothing about the key it came from.
pub(crate) fn public_id(key: &str) -> String {
    let digest = Sha256::digest(key.as_bytes());
    let hex: String = digest[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    format!("device-{hex}")
}

/// Whether a command argument has the shape of a public identifier.
pub(crate) fn is_public_id(text: &str) -> bool {
    text.strip_prefix("device-").is_some_and(|hex| {
        hex.len() == 24 && hex.bytes().all(|c| matches!(c, b'0'..=b'9' | b'a'..=b'f'))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamps_are_calendar_correct() {
        let at = |seconds| format_utc(UNIX_EPOCH + Duration::new(seconds, 6_000));
        assert_eq!(at(0), "1970-01-01T00:00:00.000006Z");
        assert_eq!(at(951_826_154), "2000-02-29T12:09:14.000006Z");
        assert_eq!(at(1_767_225_599), "2025-12-31T23:59:59.000006Z");
    }

    #[test]
    fn identifiers_are_hashed() {
        let id = public_id("xinput:0");
        assert!(is_public_id(&id), "{id}");
        assert!(!id.contains("xinput"));
        assert!(!is_public_id("device-XYZ"));
        // sha256("abc") starts ba7816bf 8f01cfea 414140de.
        assert_eq!(public_id("abc"), "device-ba7816bf8f01cfea414140de");
    }
}
