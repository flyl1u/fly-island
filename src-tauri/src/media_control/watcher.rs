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
/// often. Each one makes the island read the whole state, so they are not worth more than that;
/// the 1.5 s poll covers whatever is skipped.
const TIMELINE_INTERVAL: Duration = Duration::from_secs(1);
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
    let mut last_timeline_emit = Instant::now() - TIMELINE_INTERVAL;

    loop {
        match receiver.recv_timeout(IDLE_CHECK) {
            Ok(signal) => {
                let signal = drain(&receiver, signal);
                if signal == Signal::Sessions {
                    sessions.clear();
                    sessions = subscribe_sessions(&manager, &sender);
                }
                if signal == Signal::Timeline {
                    if last_timeline_emit.elapsed() < TIMELINE_INTERVAL {
                        continue;
                    }
                    last_timeline_emit = Instant::now();
                }
                let _ = app.emit(MEDIA_CHANGED_EVENT, ());
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return Ok(()),
        }
        if current_unix_millis() - LAST_READ_MS.load(Ordering::Relaxed) > IDLE_STOP_MS {
            return Ok(());
        }
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
