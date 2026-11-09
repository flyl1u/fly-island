//! The approval listener on 127.0.0.1. Each hook request gets its own thread, which holds the
//! connection open while the user decides, and answers when they do, when the wait runs out,
//! or when the island quits. Meanwhile it watches the socket: the agent closes it when the user
//! presses Esc in the terminal, and the card has to go.

use std::{
    io::{BufReader, ErrorKind},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex, MutexGuard, PoisonError,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use super::{
    decision::{hook_response, question_response, route, Activity, Agent, Decision, HookInput, Kind, ACTIVITY_PATH},
    http::{check_access, read_request, write_response, HttpError},
    queue::{ApprovalRequest, CloseReason, Outcome, Queue},
};

/// How long a request may take to arrive in full.
const READ_TIMEOUT: Duration = Duration::from_secs(10);
/// How often a waiting request looks for a hang-up.
const POLL_INTERVAL: Duration = Duration::from_millis(250);
/// How long quitting waits for the waiting requests to be answered.
const SHUTDOWN_WAIT: Duration = Duration::from_secs(1);

/// What the island hears about: a card to show, or one to take away.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum ApprovalEvent {
    Requested(ApprovalRequest),
    Closed { id: u64, reason: CloseReason },
}

pub(super) type Notify = Arc<dyn Fn(ApprovalEvent) + Send + Sync>;

/// State shared by the listener, the request threads and the commands.
pub(super) struct Shared {
    queue: Mutex<Queue>,
    changed: Condvar,
    /// Off: requests are handed back at once, so installed hooks cost nothing.
    enabled: AtomicBool,
    token: String,
    wait_limit: Duration,
    notify: Notify,
}

impl Shared {
    fn queue(&self) -> MutexGuard<'_, Queue> {
        self.queue.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
    }

    pub fn decide(&self, id: u64, outcome: Outcome) -> Result<(), String> {
        self.queue().decide(id, outcome)?;
        self.changed.notify_all();
        Ok(())
    }

    pub fn pending(&self) -> Vec<ApprovalRequest> {
        self.queue().shown()
    }

    /// The session moved on without the island: its waiting threads close their cards.
    pub fn settle_elsewhere(&self, agent: Agent, activity: &Activity) -> Vec<u64> {
        let settled = self.queue().settle_elsewhere(agent, activity);
        if !settled.is_empty() {
            self.changed.notify_all();
        }
        settled
    }

    /// Hands every waiting request back to the terminal, waiting a moment for the answers to go out.
    pub fn shut_down(&self) {
        self.queue().shut_down();
        self.changed.notify_all();
        let deadline = Instant::now() + SHUTDOWN_WAIT;
        let mut queue = self.queue();
        while queue.len() > 0 && Instant::now() < deadline {
            queue = self
                .changed
                .wait_timeout(queue, POLL_INTERVAL)
                .unwrap_or_else(PoisonError::into_inner)
                .0;
        }
    }
}

/// Listens on `preferred_port`, or a free port when it is taken. Returns the state and the port.
pub(super) fn listen(preferred_port: u16, token: String, wait_limit: Duration, notify: Notify) -> Result<(Arc<Shared>, u16), String> {
    let listener = TcpListener::bind(("127.0.0.1", preferred_port))
        .or_else(|_| TcpListener::bind(("127.0.0.1", 0)))
        .map_err(|error| format!("Could not start the approval endpoint: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("The approval endpoint has no address: {error}"))?
        .port();
    let shared = Arc::new(Shared {
        queue: Mutex::new(Queue::default()),
        changed: Condvar::new(),
        enabled: AtomicBool::new(false),
        token,
        wait_limit,
        notify,
    });
    let accepting = Arc::clone(&shared);
    thread::Builder::new()
        .name("agent-approval".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                let shared = Arc::clone(&accepting);
                let _ = thread::Builder::new()
                    .name("agent-approval-request".into())
                    .spawn(move || handle(&shared, stream, port));
            }
        })
        .map_err(|error| format!("Could not start the approval endpoint thread: {error}"))?;
    Ok((shared, port))
}

fn handle(shared: &Shared, stream: TcpStream, port: u16) {
    let (status, body) = match answer(shared, &stream, port) {
        Ok(Some(body)) => (200, body),
        // The agent hung up: nobody to answer.
        Ok(None) => return,
        Err(error) => (error.status, serde_json::json!({ "error": error.message }).to_string()),
    };
    let _ = stream.set_nonblocking(false);
    let _ = write_response(&mut &stream, status, &body);
}

/// The hook's answer, or None when the agent hung up while waiting.
fn answer(shared: &Shared, stream: &TcpStream, port: u16) -> Result<Option<String>, HttpError> {
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let request = read_request(&mut BufReader::new(stream))?;
    if request.method != "POST" {
        return Err(HttpError { status: 405, message: "Only POST is accepted." });
    }
    let route = route(&request.path);
    if route.is_none() && request.path != ACTIVITY_PATH {
        return Err(HttpError { status: 404, message: "Unknown path." });
    }
    check_access(&request, &shared.token, port)?;
    let Some((agent, kind)) = route else {
        // ACTIVITY_PATH: answered at once; the hook runs in the background and reads nothing back.
        let activity = Activity::parse(&request.body).map_err(|message| HttpError { status: 400, message })?;
        if let Some(activity) = activity {
            shared.settle_elsewhere(Agent::ClaudeCode, &activity);
        }
        return Ok(Some("{}".to_string()));
    };
    let input = HookInput::parse(&request.body).map_err(|message| HttpError { status: 400, message })?;

    // A question comes through PermissionRequest too, after its PreToolUse hook gave it back
    // (or when that hook is not installed): let the terminal ask at once. And the PreToolUse path
    // only takes AskUserQuestion, whatever matcher the hook was installed with.
    let question_elsewhere = match kind {
        Kind::Permission => input.is_question(),
        Kind::Question => !input.is_question(),
    };
    let hand_back = !shared.enabled.load(Ordering::Relaxed) || question_elsewhere || shared.queue().is_shutting_down();
    if hand_back {
        return Ok(Some("{}".to_string()));
    }

    let suggestions = input.permission_suggestions.clone();
    let tool_input = input.tool_input.clone();
    let (request, shown) = shared.queue().push(agent, kind, input, unix_millis());
    if shown {
        (shared.notify)(ApprovalEvent::Requested(request.clone()));
    }
    let (outcome, reason) = wait(shared, stream, request.id, Instant::now() + shared.wait_limit);

    let next = shared.queue().remove(request.id);
    shared.changed.notify_all();
    (shared.notify)(ApprovalEvent::Closed { id: request.id, reason });
    if let Some(next) = next {
        (shared.notify)(ApprovalEvent::Requested(next));
    }
    if reason == CloseReason::Disconnected {
        return Ok(None);
    }
    let decision = outcome.as_ref().map(|outcome| outcome.decision);
    Ok(Some(match kind {
        Kind::Permission => {
            let message = outcome.as_ref().and_then(|outcome| outcome.message.as_deref());
            hook_response(decision, message, suggestions.as_ref())
        }
        Kind::Question => {
            let answers = outcome.as_ref().filter(|_| decision == Some(Decision::Answer)).and_then(|outcome| outcome.answers.as_ref());
            question_response(answers, &tool_input)
        }
    }))
}

/// Waits for the user's choice, the deadline, a hang-up or the island quitting.
fn wait(shared: &Shared, stream: &TcpStream, id: u64, deadline: Instant) -> (Option<Outcome>, CloseReason) {
    loop {
        {
            let queue = shared.queue();
            if let Some(outcome) = queue.outcome(id) {
                let reason = if outcome.decision == Decision::Terminal { CloseReason::HandedBack } else { CloseReason::Decided };
                return (Some(outcome), reason);
            }
            if queue.answered_elsewhere(id) {
                return (None, CloseReason::AnsweredElsewhere);
            }
            if queue.is_shutting_down() {
                return (None, CloseReason::Shutdown);
            }
            let now = Instant::now();
            if now >= deadline {
                return (None, CloseReason::Timeout);
            }
            let _ = shared
                .changed
                .wait_timeout(queue, POLL_INTERVAL.min(deadline - now))
                .unwrap_or_else(PoisonError::into_inner);
        }
        if hung_up(stream) {
            return (None, CloseReason::Disconnected);
        }
    }
}

/// Whether the agent closed its end: a read that would block means the connection is alive.
fn hung_up(stream: &TcpStream) -> bool {
    if stream.set_nonblocking(true).is_err() {
        return false;
    }
    let mut byte = [0u8; 1];
    let closed = match stream.peek(&mut byte) {
        Ok(0) => true,
        Ok(_) => false,
        Err(error) => error.kind() != ErrorKind::WouldBlock,
    };
    let _ = stream.set_nonblocking(false);
    closed
}

fn unix_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}
