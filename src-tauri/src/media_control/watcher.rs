//! Tells the island when a media session changes, so a seek, pause or new track in the player
//! shows at once instead of at the next 1.5 s poll.
//!
//! A thread holds the session manager and listens to every session's timeline, playback and media
//! property events (and to the manager's, to follow sessions coming and going). It starts with the
//! first state read and stops on its own once the island has stopped reading (music switched off),
//! so the next read starts it again. The poll stays: some players raise no events at all.

use std::{
    sync::{
        atomic::{AtomicBool, AtomicI64, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, SyncSender},
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use windows::{
    Foundation::TypedEventHandler,
    Media::Control::{
        GlobalSystemMediaTransportControlsSession as MediaSession,
        GlobalSystemMediaTransportControlsSessionManager as MediaSessionManager,
    },
};

use super::session::{current_unix_millis, request_manager};
use crate::win32;

/// No payload: the island reads the state again.
const MEDIA_CHANGED_EVENT: &str = "media-session-changed";
/// Events this close together are told once (a track change raises several).
const COALESCE: Duration = Duration::from_millis(80);
/// Timeline-only changes (a player pushes its position every second or so) are told at most this
/// often. Each one makes the island read the whole state, and the island runs the clock between
/// readings itself, so they are only worth it for a seek in the player.
const TIMELINE_INTERVAL: Duration = Duration::from_secs(2);
/// Other changes are told at once, then at most this often while they keep coming, with one more
/// at the end so the last of them is not lost. A player that re-publishes its playback state or
/// metadata many times a second kept the island reading back to back (issue #93).
const CHANGED_INTERVAL: Duration = Duration::from_millis(800);
/// The watcher stops once no state has been read for this long.
const IDLE_STOP_MS: i64 = 10_000;
const IDLE_CHECK: Duration = Duration::from_secs(2);

static RUNNING: AtomicBool = AtomicBool::new(false);
static LAST_READ_MS: AtomicI64 = AtomicI64::new(0);

/// Ordered: a burst is told as the strongest signal in it.
#[derive(Clone, Copy, PartialEq, PartialOrd)]
enum Signal {
    /// The position moved on (timeline only).
    Timeline,
    /// Something about a session changed.
    Changed,
    /// Sessions came or went: listen to the new set.
    Sessions,
}

/// Notes a state read and starts the watcher if it is not running.
pub(super) fn keep_alive(app: &AppHandle) {
    LAST_READ_MS.store(current_unix_millis(), Ordering::Relaxed);
    if RUNNING.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    let started = thread::Builder::new().name("media-watcher".into()).spawn(move || {
        if let Err(error) = watch(&app) {
            eprintln!("media session watcher stopped: {error}");
        }
        RUNNING.store(false, Ordering::Release);
    });
    if started.is_err() {
        RUNNING.store(false, Ordering::Release);
    }
}

fn watch(app: &AppHandle) -> Result<(), String> {
    let _apartment = win32::com::ComApartment::multithreaded()
        .map_err(|error| format!("Failed to initialize COM: {error}"))?;
    let manager = request_manager()?;
    let (sender, receiver) = mpsc::sync_channel::<Signal>(64);
    let _manager_events = ManagerEvents::subscribe(&manager, &sender);
    let mut sessions = subscribe_sessions(&manager, &sender);
    let mut throttle = Throttle::new(Instant::now());

    loop {
        let wait = throttle.wait(Instant::now()).unwrap_or(IDLE_CHECK).min(IDLE_CHECK);
        match receiver.recv_timeout(wait) {
            Ok(signal) => {
                let signal = drain(&receiver, signal);
                if signal == Signal::Sessions {
                    sessions.clear();
                    sessions = subscribe_sessions(&manager, &sender);
                }
                throttle.note(signal);
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return Ok(()),
        }
        if throttle.take_due(Instant::now()) {
            let _ = app.emit(MEDIA_CHANGED_EVENT, ());
        }
        if current_unix_millis() - LAST_READ_MS.load(Ordering::Relaxed) > IDLE_STOP_MS {
            return Ok(());
        }
    }
}

/// Holds signals back so the island is told at most once per interval, and never loses the last.
struct Throttle {
    last_emit: Instant,
    pending: Option<Signal>,
}

impl Throttle {
    fn new(now: Instant) -> Self {
        Self { last_emit: now.checked_sub(TIMELINE_INTERVAL).unwrap_or(now), pending: None }
    }

    fn interval(signal: Signal) -> Duration {
        match signal {
            Signal::Timeline => TIMELINE_INTERVAL,
            Signal::Changed => CHANGED_INTERVAL,
            // A new session set is listened to at once and read at once.
            Signal::Sessions => Duration::ZERO,
        }
    }

    fn note(&mut self, signal: Signal) {
        self.pending = Some(self.pending.map_or(signal, |pending| if signal > pending { signal } else { pending }));
    }

    /// How long until the pending signal is due, if one is waiting.
    fn wait(&self, now: Instant) -> Option<Duration> {
        let due = self.last_emit + Self::interval(self.pending?);
        Some(due.saturating_duration_since(now))
    }

    /// Whether to tell the island now; clears the pending signal when it does.
    fn take_due(&mut self, now: Instant) -> bool {
        if self.wait(now).is_none_or(|left| !left.is_zero()) {
            return false;
        }
        self.pending = None;
        self.last_emit = now;
        true
    }
}

/// Waits out a burst of signals; the strongest of them.
fn drain(receiver: &Receiver<Signal>, first: Signal) -> Signal {
    let deadline = Instant::now() + COALESCE;
    let mut signal = first;
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        match receiver.recv_timeout(left) {
            Ok(next) if next > signal => signal = next,
            Ok(_) => {}
            Err(_) => break,
        }
    }
    signal
}

fn subscribe_sessions(manager: &MediaSessionManager, sender: &SyncSender<Signal>) -> Vec<SessionEvents> {
    let Ok(sessions) = manager.GetSessions() else {
        return Vec::new();
    };
    sessions.into_iter().filter_map(|session| SessionEvents::subscribe(session, sender)).collect()
}

fn notify<S, A>(sender: &SyncSender<Signal>, signal: Signal) -> TypedEventHandler<S, A>
where
    S: windows::core::RuntimeType + 'static,
    A: windows::core::RuntimeType + 'static,
{
    let sender = sender.clone();
    TypedEventHandler::new(move |_, _| {
        // Full means a burst is already on its way.
        let _ = sender.try_send(signal);
        Ok(())
    })
}

/// One session's event handlers, removed when dropped.
struct SessionEvents {
    session: MediaSession,
    timeline: i64,
    playback: i64,
    media: i64,
}

impl SessionEvents {
    fn subscribe(session: MediaSession, sender: &SyncSender<Signal>) -> Option<Self> {
        let timeline = session.TimelinePropertiesChanged(&notify(sender, Signal::Timeline)).ok()?;
        let playback = session.PlaybackInfoChanged(&notify(sender, Signal::Changed)).unwrap_or(0);
        let media = session.MediaPropertiesChanged(&notify(sender, Signal::Changed)).unwrap_or(0);
        Some(Self { session, timeline, playback, media })
    }
}

impl Drop for SessionEvents {
    fn drop(&mut self) {
        let _ = self.session.RemoveTimelinePropertiesChanged(self.timeline);
        let _ = self.session.RemovePlaybackInfoChanged(self.playback);
        let _ = self.session.RemoveMediaPropertiesChanged(self.media);
    }
}

/// The manager's session-list handlers, removed when dropped.
struct ManagerEvents<'a> {
    manager: &'a MediaSessionManager,
    sessions: Option<i64>,
    current: Option<i64>,
}

impl<'a> ManagerEvents<'a> {
    fn subscribe(manager: &'a MediaSessionManager, sender: &SyncSender<Signal>) -> Self {
        Self {
            manager,
            sessions: manager.SessionsChanged(&notify(sender, Signal::Sessions)).ok(),
            current: manager.CurrentSessionChanged(&notify(sender, Signal::Sessions)).ok(),
        }
    }
}

impl Drop for ManagerEvents<'_> {
    fn drop(&mut self) {
        if let Some(token) = self.sessions {
            let _ = self.manager.RemoveSessionsChanged(token);
        }
        if let Some(token) = self.current {
            let _ = self.manager.RemoveCurrentSessionChanged(token);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Signal, Throttle, CHANGED_INTERVAL, TIMELINE_INTERVAL};
    use std::time::{Duration, Instant};

    #[test]
    fn a_stream_of_changes_is_told_once_per_interval_and_the_last_is_kept() {
        let start = Instant::now();
        let mut throttle = Throttle::new(start);
        throttle.note(Signal::Changed);
        assert!(throttle.take_due(start), "the first change is told at once");
        let mut told = 0;
        for step in 1..=40 {
            let now = start + Duration::from_millis(step * 50);
            throttle.note(Signal::Changed);
            if throttle.take_due(now) { told += 1; }
        }
        assert!(told <= 3, "two seconds of changes every 50 ms are told only a few times, not {told}");
        let end = start + Duration::from_millis(2_000) + CHANGED_INTERVAL;
        assert!(throttle.take_due(end), "the last change is told once the interval is over");
        assert!(!throttle.take_due(end + CHANGED_INTERVAL), "and nothing after it");
    }

    #[test]
    fn timeline_ticks_wait_longer_and_sessions_never_wait() {
        let start = Instant::now();
        let mut throttle = Throttle::new(start);
        throttle.note(Signal::Timeline);
        assert!(throttle.take_due(start));
        throttle.note(Signal::Timeline);
        assert!(!throttle.take_due(start + TIMELINE_INTERVAL / 2));
        throttle.note(Signal::Sessions);
        assert!(throttle.take_due(start + TIMELINE_INTERVAL / 2), "a new session is told at once");
    }
}
