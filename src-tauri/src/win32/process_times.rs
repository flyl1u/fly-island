//! Process start times, used to tell an older instance from a newer one.
//!
//! Kept out of `process.rs` because the WeChat probe example compiles that file
//! and has no use for this.

use windows::Win32::{Foundation::FILETIME, System::Threading::GetProcessTimes};

use super::process::open_for_limited_query;

/// Start time of `process_id` in 100 ns ticks since 1601-01-01 (UTC); `None`
/// when the process cannot be opened or its times cannot be read.
pub(crate) fn start_time(process_id: u32) -> Option<u64> {
    let process = open_for_limited_query(process_id)?;
    let mut started = FILETIME::default();
    let mut exited = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    // SAFETY: `process.0` is a live handle opened with
    // PROCESS_QUERY_LIMITED_INFORMATION, which GetProcessTimes accepts, and the
    // four FILETIME outputs are valid locals.
    unsafe { GetProcessTimes(process.0, &mut started, &mut exited, &mut kernel, &mut user) }
        .ok()?;
    Some(((started.dwHighDateTime as u64) << 32) | started.dwLowDateTime as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_current_process_has_a_start_time_and_missing_ones_do_not() {
        assert!(start_time(std::process::id()).is_some_and(|ticks| ticks > 0));
        assert_eq!(start_time(u32::MAX), None);
    }
}
