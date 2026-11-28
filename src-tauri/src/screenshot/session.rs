use std::sync::atomic::{AtomicU8, Ordering};
const IDLE: u8 = 0;
const ACTIVE: u8 = 1;
const CLOSING: u8 = 2;
const REOPEN: u8 = 3;

pub(super) struct CaptureSession(AtomicU8);
impl CaptureSession {
    pub(super) const fn new() -> Self { Self(AtomicU8::new(IDLE)) }
    /// A hotkey during close is queued once, rather than lost between two sessions.
    pub(super) fn open(&self) -> bool {
        loop {
            let state = self.0.load(Ordering::Acquire);
            let next = match state { IDLE => ACTIVE, CLOSING => REOPEN, _ => return false };
            if self.0.compare_exchange(state, next, Ordering::AcqRel, Ordering::Acquire).is_ok() { return state == IDLE; }
        }
    }
    pub(super) fn active(&self) -> bool { self.0.load(Ordering::Acquire) == ACTIVE }
    pub(super) fn begin_close(&self) -> bool {
        self.0.compare_exchange(ACTIVE, CLOSING, Ordering::AcqRel, Ordering::Acquire).is_ok()
    }
    pub(super) fn finish_close(&self) -> bool {
        loop {
            let state = self.0.load(Ordering::Acquire);
            let next = match state { REOPEN => ACTIVE, CLOSING => IDLE, _ => return false };
            if self.0.compare_exchange(state, next, Ordering::AcqRel, Ordering::Acquire).is_ok() { return next == ACTIVE; }
        }
    }
    pub(super) fn cancel(&self) { self.0.store(IDLE, Ordering::Release); }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rapid_reopen_waits_for_close_and_runs_once() {
        let session = CaptureSession::new();
        assert!(session.open()); assert!(!session.open());
        assert!(session.begin_close()); assert!(!session.begin_close());
        assert!(!session.open()); assert!(!session.open());
        assert!(session.finish_close()); assert!(session.active());
        assert!(!session.open()); assert!(session.begin_close());
        assert!(!session.finish_close()); assert!(!session.active());
        assert!(session.open());
    }
    #[test]
    fn failed_capture_can_rearm() {
        let session = CaptureSession::new();
        assert!(session.open()); session.cancel(); assert!(session.open());
    }
}
