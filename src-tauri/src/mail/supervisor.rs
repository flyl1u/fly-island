//! Keeps a mailbox's worker thread running. A worker that panics (imap 2.x
//! panics on some server replies) or finds its state lock poisoned used to end
//! silently and leave the mailbox at "connecting" until the island restarted.
//! Now the mailbox shows the error and the worker starts again, with a limit.

use std::{
    panic::{self, AssertUnwindSafe},
    sync::{mpsc, Arc},
    time::{Duration, Instant},
};

use super::service::{worker, MailService, Work, WorkerExit};

/// More crashes than this within `CRASH_WINDOW` stop the restarts.
const MAX_CRASHES: usize = 3;
const CRASH_WINDOW: Duration = Duration::from_secs(10 * 60);

/// Decides whether a crashed worker is started again.
#[derive(Debug, Default)]
pub(super) struct RestartPolicy {
    crashes: Vec<Instant>,
}

impl RestartPolicy {
    /// Records a crash at `now`; true while it is worth starting the worker again.
    pub(super) fn allow_restart(&mut self, now: Instant) -> bool {
        self.crashes
            .retain(|crash| now.saturating_duration_since(*crash) < CRASH_WINDOW);
        self.crashes.push(now);
        self.crashes.len() <= MAX_CRASHES
    }
}

/// Runs the worker until it is told to stop, restarting it after a crash.
/// `is_current` is false once the mailbox was disconnected or replaced, so a
/// crash then neither restarts the worker nor publishes the mailbox again.
pub(super) fn supervise(
    service: Arc<MailService>,
    receiver: mpsc::Receiver<Work>,
    is_current: impl Fn(&Arc<MailService>) -> bool,
) {
    let mut policy = RestartPolicy::default();
    loop {
        let exit = panic::catch_unwind(AssertUnwindSafe(|| worker(service.clone(), &receiver)));
        if matches!(exit, Ok(WorkerExit::Stopped)) || !is_current(&service) {
            return;
        }
        let restart = policy.allow_restart(Instant::now());
        service.recover_after_crash(restart);
        if !restart {
            return;
        }
    }
}
