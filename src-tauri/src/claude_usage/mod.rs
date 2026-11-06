//! Claude subscription usage (5-hour and 7-day windows) asked of Anthropic
//! directly, for users without claude-hud's usage snapshot. Optional and off by
//! default: the usage ring's built-in plugin starts the poller only when its
//! "ask Anthropic directly" setting is on. The poller reads the access token
//! Claude Code saved and asks the OAuth usage endpoint through a proxy every few
//! minutes; `agent_status::get_agent_usage` merges the result with claude-hud's
//! snapshot, so the Agent page and the ring show the same numbers.
//!
//! Adapted from TixXin/fly-island#3 by ShengLin1001.

mod source;
#[cfg(test)]
mod tests;

use serde::Serialize;
use source::{FetchError, Limits};
use std::{
    sync::{mpsc, Mutex, MutexGuard, OnceLock, PoisonError},
    thread,
    time::{Duration, Instant, SystemTime},
};

const MIN_INTERVAL_MINUTES: u64 = 5;
const MAX_INTERVAL_MINUTES: u64 = 120;
const MAX_BACKOFF: Duration = Duration::from_secs(60 * 60);
/// A refresh asked for again within this gap reuses the last answer.
const MANUAL_MIN_GAP: Duration = Duration::from_secs(60);

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct UsageWindow {
    /// 0–100.
    pub percent: f64,
    /// ISO 8601, as the endpoint gave it (numbers are turned into one).
    pub resets_at: Option<String>,
}

/// Mirrored by ClaudeUsageErrorKind in src/features/claude-usage/api.ts.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UsageErrorKind {
    /// No Claude Code login on this computer.
    NoCredentials,
    /// The saved token has expired; opening Claude Code renews it.
    TokenExpired,
    /// HTTP 401: sign in again in Claude Code.
    LoginRequired,
    /// HTTP 403: the login may lack the usage scope.
    Forbidden,
    RateLimited,
    /// No proxy in the settings, HTTPS_PROXY or the Windows proxy; going direct is never tried.
    NoProxy,
    /// Proxy or connection failure; never retried without the proxy.
    Network,
    Http,
    InvalidResponse,
}

impl UsageErrorKind {
    /// Failures found before any request; retrying them costs nothing, so no backoff.
    fn is_local(self) -> bool {
        matches!(self, Self::NoCredentials | Self::TokenExpired | Self::NoProxy)
    }
}

/// Mirrored by ClaudeUsageError in src/features/claude-usage/api.ts.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct UsageError {
    pub kind: UsageErrorKind,
    /// English detail; never contains the token.
    pub message: String,
}

/// What the poller last learned. `error` is set when the last request failed;
/// the windows then still hold the last good numbers.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct ClaudeUsage {
    pub five_hour: Option<UsageWindow>,
    pub seven_day: Option<UsageWindow>,
    /// When the numbers were read (Unix ms); None before the first answer.
    pub updated_at: Option<u64>,
    pub error: Option<UsageError>,
}

/// The built-in plugin's settings.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct UsageConfig {
    /// None: HTTPS_PROXY, else the Windows proxy, else no request.
    pub proxy: Option<String>,
    /// Clamped to 5–120.
    pub interval_minutes: u64,
}

#[derive(Default)]
struct State {
    usage: ClaudeUsage,
    config: UsageConfig,
    /// Failed requests in a row, for the backoff.
    failures: u32,
    cooldown_until: Option<Instant>,
    last_request: Option<Instant>,
    in_flight: bool,
    /// Dropping the sender stops the poller; the handle tells whether it is still alive.
    poller: Option<(mpsc::Sender<()>, thread::JoinHandle<()>)>,
}

fn state() -> MutexGuard<'static, State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
}

/// Starts polling now, or hands a running poller new settings, which apply at
/// once (new settings also clear the backoff). A poller whose thread has died
/// is started again.
pub(crate) fn start(config: UsageConfig) -> Result<(), String> {
    let mut state = state();
    if state.config != config {
        state.config = config;
        state.failures = 0;
        state.last_request = None;
    }
    if let Some((wake, thread)) = &state.poller {
        if !thread.is_finished() {
            let _ = wake.send(());
            return Ok(());
        }
    }
    let (sender, receiver) = mpsc::channel();
    let thread = thread::Builder::new()
        .name("claude-usage".into())
        .spawn(move || poll(&receiver))
        .map_err(|error| format!("Could not start the Claude usage poller: {error}"))?;
    state.poller = Some((sender, thread));
    Ok(())
}

/// Stops polling and forgets the numbers, so the island goes back to claude-hud's
/// snapshot alone; a request already on its way still finishes.
pub(crate) fn stop() {
    let mut state = state();
    state.poller = None;
    state.usage = ClaudeUsage::default();
    state.failures = 0;
}

/// The poller's last snapshot; None while it is not running.
pub(crate) fn current() -> Option<ClaudeUsage> {
    let state = state();
    state
        .poller
        .as_ref()
        .is_some_and(|(_, thread)| !thread.is_finished())
        .then(|| state.usage.clone())
}

/// Shortest wait between two looks at the schedule, so the loop never spins.
const MIN_POLL_WAIT: Duration = Duration::from_secs(1);

/// Waits until the next poll is due, recomputing whenever `start` sends new
/// settings; a manual refresh also counts as the last request.
fn poll(wake: &mpsc::Receiver<()>) {
    loop {
        if wait_before_poll(&state(), Instant::now()).is_zero() {
            tauri::async_runtime::block_on(refresh(false));
        }
        let wait = wait_before_poll(&state(), Instant::now()).max(MIN_POLL_WAIT);
        if let Err(mpsc::RecvTimeoutError::Disconnected) = wake.recv_timeout(wait) {
            return;
        }
    }
}

/// Clears `in_flight` however a refresh ends, even if its future is dropped.
struct InFlight;

impl Drop for InFlight {
    fn drop(&mut self) {
        state().in_flight = false;
    }
}

/// The interval, doubled per failure in a row (up to an hour).
fn backoff(state: &State) -> Duration {
    let minutes = state
        .config
        .interval_minutes
        .clamp(MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
    let interval = Duration::from_secs(60 * minutes);
    interval
        .saturating_mul(1 << state.failures.min(4))
        .min(MAX_BACKOFF.max(interval))
}

/// How long until the poller may ask again: the backoff since the last request,
/// and never before a 429's Retry-After. Zero before the first request.
fn wait_before_poll(state: &State, now: Instant) -> Duration {
    let Some(last) = state.last_request else {
        return Duration::ZERO;
    };
    let cooldown = state
        .cooldown_until
        .map(|until| until.saturating_duration_since(now))
        .unwrap_or_default();
    backoff(state)
        .saturating_sub(now.saturating_duration_since(last))
        .max(cooldown)
}

/// Whether a refresh may send a request now: none is running, no 429 cooldown
/// holds, and a manual refresh comes at least a minute after the last request.
fn may_request(state: &State, now: Instant, manual: bool) -> bool {
    let cooling = state.cooldown_until.is_some_and(|until| until > now);
    let recent = manual
        && state
            .last_request
            .is_some_and(|at| now.saturating_duration_since(at) < MANUAL_MIN_GAP);
    !state.in_flight && !cooling && !recent
}

async fn refresh(manual: bool) {
    let now = Instant::now();
    let config = {
        let mut state = state();
        if !may_request(&state, now, manual) {
            return;
        }
        state.in_flight = true;
        state.last_request = Some(now);
        state.config.clone()
    };
    let in_flight = InFlight;
    let now_ms = source::unix_ms(SystemTime::now());
    let proxy = source::resolve_proxy(config.proxy.as_deref());
    let api = source::fetch_api(proxy.as_deref(), now_ms).await;
    {
        let mut state = state();
        // Stopped while the request was out: keep the numbers forgotten.
        if state.poller.is_some() {
            apply(&mut state, api, now_ms, now);
        }
    }
    drop(in_flight);
}

/// Folds one answer into the state; a failure keeps the last numbers and names the reason.
fn apply(state: &mut State, api: Result<Limits, FetchError>, now_ms: u64, now: Instant) {
    let error = match api {
        Ok(limits) => {
            state.failures = 0;
            state.cooldown_until = None;
            state.usage = ClaudeUsage {
                five_hour: limits.five_hour,
                seven_day: limits.seven_day,
                updated_at: Some(now_ms),
                error: None,
            };
            return;
        }
        Err(error) => error,
    };
    // A local failure says nothing about the server; the next poll comes after the plain interval.
    state.failures = if error.kind.is_local() {
        0
    } else {
        state.failures.saturating_add(1)
    };
    state.cooldown_until = error.retry_after.map(|delay| now + delay);
    state.usage.error = Some(UsageError {
        kind: error.kind,
        message: error.message,
    });
}

/// Asks Anthropic now, unless direct asking is off, a request is running, a 429
/// cooldown holds, or the last request was under a minute ago. The caller then
/// reads the merged numbers with `get_agent_usage`.
#[tauri::command]
pub async fn refresh_claude_usage() -> Result<(), String> {
    if current().is_some() {
        refresh(true).await;
    }
    Ok(())
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::claude_usage::refresh_claude_usage,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
