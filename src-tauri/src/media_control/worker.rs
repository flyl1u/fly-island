//! One resident COM thread that runs every media and audio read in turn.
//!
//! Each read used to spawn a thread and enter a new COM apartment. While music played the
//! island read the level twice a second and the state every 1.5 s, and on some machines the
//! threads piled up into the hundreds with 25–39% CPU (#75). The worker starts with the first
//! read, keeps its apartment and the cached audio endpoint (see [`super::audio`]) and exits
//! after a while without work, so nothing stays behind once music is switched off.
//!
//! A read that hangs (an SMTC request that never completes) must not stall every later read:
//! after [`STUCK_MS`] the worker is left to finish on its own and a fresh one takes over, at
//! most [`MAX_ABANDONED`] at a time.

use std::{
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{
        atomic::{AtomicBool, AtomicI64, AtomicU64, AtomicUsize, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError},
        Arc, Mutex, MutexGuard,
    },
    thread,
    time::Duration,
};

use super::session::current_unix_millis;
use crate::win32;

type Job = Box<dyn FnOnce() + Send + 'static>;

/// The worker exits after this long without a job.
const IDLE_EXIT: Duration = Duration::from_secs(30);
/// A job running longer than this counts as hung.
const STUCK_MS: i64 = 5_000;
/// Hung workers left running at once; past this, reads fail until one returns.
const MAX_ABANDONED: usize = 4;

struct Worker {
    id: u64,
    sender: Sender<Job>,
    state: Arc<WorkerState>,
}

#[derive(Default)]
struct WorkerState {
    /// When the running job started, or 0 while idle.
    busy_since: AtomicI64,
    /// Set once a hung job made the worker give up its slot.
    abandoned: AtomicBool,
}

static WORKER: Mutex<Option<Worker>> = Mutex::new(None);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static ABANDONED: AtomicUsize = AtomicUsize::new(0);

fn slot() -> MutexGuard<'static, Option<Worker>> {
    WORKER.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Runs `operation` on the media worker and waits for its result.
pub(super) fn run<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = mpsc::sync_channel(1);
    submit(Box::new(move || {
        let _ = sender.send(operation());
    }))?;
    receiver
        .recv()
        .map_err(|_| "The Windows media control thread stopped.".to_string())?
}

fn submit(job: Job) -> Result<(), String> {
    let mut slot = slot();
    if let Some(worker) = slot.as_ref() {
        let since = worker.state.busy_since.load(Ordering::Acquire);
        if since > 0 && current_unix_millis() - since > STUCK_MS {
            if ABANDONED.load(Ordering::Acquire) >= MAX_ABANDONED {
                return Err("The Windows media service is not responding.".to_string());
            }
            ABANDONED.fetch_add(1, Ordering::AcqRel);
            worker.state.abandoned.store(true, Ordering::Release);
            *slot = None;
        }
    }
    let job = match slot.as_ref() {
        Some(worker) => match worker.sender.send(job) {
            Ok(()) => return Ok(()),
            // The thread ended (it should not, but a failed spawn of its apartment could).
            Err(mpsc::SendError(job)) => job,
        },
        None => job,
    };
    let worker = spawn()?;
    worker
        .sender
        .send(job)
        .map_err(|_| "The Windows media control thread stopped.".to_string())?;
    *slot = Some(worker);
    Ok(())
}

fn spawn() -> Result<Worker, String> {
    let (sender, receiver) = mpsc::channel::<Job>();
    let state = Arc::new(WorkerState::default());
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let shared = Arc::clone(&state);
    thread::Builder::new()
        .name("media-com".into())
        .spawn(move || work(id, &receiver, &shared))
        .map_err(|error| format!("Failed to start the media control thread: {error}"))?;
    Ok(Worker { id, sender, state })
}

fn work(id: u64, receiver: &Receiver<Job>, state: &WorkerState) {
    let apartment = win32::com::ComApartment::multithreaded();
    if let Err(error) = &apartment {
        eprintln!("media worker could not enter COM: {error}");
    }
    loop {
        let job = match receiver.recv_timeout(IDLE_EXIT) {
            Ok(job) => job,
            Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {
                // Leave the slot under its lock, so no job is sent to a thread that is going.
                let mut slot = slot();
                match receiver.try_recv() {
                    Ok(job) => job,
                    Err(TryRecvError::Disconnected) => break,
                    Err(TryRecvError::Empty) => {
                        if slot.as_ref().is_some_and(|worker| worker.id == id) {
                            *slot = None;
                        }
                        break;
                    }
                }
            }
        };
        state.busy_since.store(current_unix_millis().max(1), Ordering::Release);
        if catch_unwind(AssertUnwindSafe(job)).is_err() {
            eprintln!("a media control task panicked");
        }
        state.busy_since.store(0, Ordering::Release);
    }
    // COM objects go before the apartment does.
    super::session::release_poll_manager();
    super::audio::release_cached();
    drop(apartment);
    if state.abandoned.load(Ordering::Acquire) {
        // Balanced: the count went up exactly when this flag was set.
        ABANDONED.fetch_sub(1, Ordering::AcqRel);
    }
}
