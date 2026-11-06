use std::{
    io::{BufReader, Read, Write},
    net::{Shutdown, TcpStream},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use serde_json::{json, Value};

use super::config::{is_valid_token, load_config};
use super::decision::{hook_response, Agent, Decision, HookInput};
use super::http::{check_access, read_request, HttpRequest};
use super::queue::{CloseReason, Queue};
use super::server::{listen, ApprovalEvent, Shared};

const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn hook_body(session: &str, tool: &str) -> String {
    json!({
        "session_id": session, "cwd": "E:\\p", "hook_event_name": "PermissionRequest",
        "tool_name": tool, "tool_input": { "command": "cmd /c echo hi" },
        "permission_suggestions": [{ "type": "addRules", "rules": [{ "toolName": "Bash" }], "behavior": "allow", "destination": "localSettings" }],
    })
    .to_string()
}

fn raw_request(port: u16, path: &str, auth: &str, extra: &str, body: &str) -> String {
    format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {auth}\r\nContent-Type: application/json\r\n{extra}Content-Length: {}\r\n\r\n{body}",
        body.len()
    )
}

/// Sends a request and reads the whole answer: (status, body).
fn send(port: u16, request: &str) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream.write_all(request.as_bytes()).unwrap();
    let mut answer = String::new();
    stream.read_to_string(&mut answer).unwrap();
    let status = answer[9..12].parse().unwrap();
    let body = answer.split("\r\n\r\n").nth(1).unwrap_or_default().to_string();
    (status, body)
}

struct TestServer {
    shared: Arc<Shared>,
    port: u16,
    events: Arc<Mutex<Vec<ApprovalEvent>>>,
}

impl TestServer {
    fn start(wait_limit: Duration) -> Self {
        let events = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&events);
        let (shared, port) = listen(0, TOKEN.into(), wait_limit, Arc::new(move |event| log.lock().unwrap().push(event))).unwrap();
        shared.set_enabled(true);
        Self { shared, port, events }
    }

    fn post(&self, session: &str, tool: &str) -> (u16, String) {
        send(self.port, &raw_request(self.port, "/claude/permission-request", TOKEN, "", &hook_body(session, tool)))
    }

    /// Posts on another thread, for requests that wait.
    fn post_later(&self, session: &str) -> thread::JoinHandle<(u16, String)> {
        let request = raw_request(self.port, "/claude/permission-request", TOKEN, "", &hook_body(session, "Bash"));
        let port = self.port;
        thread::spawn(move || send(port, &request))
    }

    fn requested(&self) -> Vec<(u64, String)> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter_map(|event| match event {
                ApprovalEvent::Requested(request) => Some((request.id, request.session_id.clone())),
                ApprovalEvent::Closed { .. } => None,
            })
            .collect()
    }

    fn closed(&self) -> Vec<(u64, CloseReason)> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter_map(|event| match event {
                ApprovalEvent::Closed { id, reason } => Some((*id, *reason)),
                ApprovalEvent::Requested(_) => None,
            })
            .collect()
    }

    fn wait_for(&self, what: impl Fn(&Self) -> bool) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while !what(self) {
            assert!(Instant::now() < deadline, "timed out waiting");
            thread::sleep(Duration::from_millis(20));
        }
    }
}

fn decision_of(body: &str) -> Value {
    serde_json::from_str::<Value>(body).unwrap()["hookSpecificOutput"]["decision"].clone()
}

#[test]
fn reads_a_request_with_a_length_or_in_chunks() {
    let plain = "POST /claude/permission-request?x=1 HTTP/1.1\r\nHost: a\r\nContent-Length: 2\r\n\r\n{}";
    let request = read_request(&mut BufReader::new(plain.as_bytes())).unwrap();
    assert_eq!((request.method.as_str(), request.path.as_str(), request.body.as_slice()), ("POST", "/claude/permission-request", &b"{}"[..]));
    assert_eq!(request.header("host"), Some("a"));
    let chunked = "POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n3\r\n{\"a\r\n4\r\n\":1}\r\n0\r\n\r\n";
    assert_eq!(read_request(&mut BufReader::new(chunked.as_bytes())).unwrap().body, b"{\"a\":1}");
    let short = "POST / HTTP/1.1\r\nContent-Length: 9\r\n\r\n{}";
    assert_eq!(read_request(&mut BufReader::new(short.as_bytes())).unwrap_err().status, 400);
    let huge = "POST / HTTP/1.1\r\nContent-Length: 99999999\r\n\r\n";
    assert_eq!(read_request(&mut BufReader::new(huge.as_bytes())).unwrap_err().status, 413);
}

#[test]
fn only_local_agents_with_the_token_get_in() {
    let request = |headers: &[(&str, &str)]| HttpRequest {
        headers: headers.iter().map(|(name, value)| (name.to_string(), value.to_string())).collect(),
        ..HttpRequest::default()
    };
    let bearer = format!("Bearer {TOKEN}");
    assert!(check_access(&request(&[("host", "127.0.0.1:47830"), ("authorization", &bearer)]), TOKEN, 47830).is_ok());
    assert!(check_access(&request(&[("host", "localhost:47830"), ("authorization", &bearer)]), TOKEN, 47830).is_ok());
    assert_eq!(check_access(&request(&[("host", "127.0.0.1:47830")]), TOKEN, 47830).unwrap_err().status, 401);
    assert_eq!(check_access(&request(&[("host", "127.0.0.1:47830"), ("authorization", "Bearer wrong")]), TOKEN, 47830).unwrap_err().status, 401);
    assert_eq!(check_access(&request(&[("host", "evil.example:47830"), ("authorization", &bearer)]), TOKEN, 47830).unwrap_err().status, 403);
    let from_page = request(&[("host", "127.0.0.1:47830"), ("authorization", &bearer), ("origin", "https://evil.example")]);
    assert_eq!(check_access(&from_page, TOKEN, 47830).unwrap_err().status, 403);
}

#[test]
fn each_choice_becomes_the_hooks_answer() {
    let suggestions = json!([{ "type": "addRules", "rules": [], "destination": "localSettings" }]);
    assert_eq!(hook_response(None, None, None), "{}");
    assert_eq!(hook_response(Some(Decision::Terminal), None, None), "{}");
    let allow: Value = serde_json::from_str(&hook_response(Some(Decision::Allow), None, None)).unwrap();
    assert_eq!(allow, json!({ "hookSpecificOutput": { "hookEventName": "PermissionRequest", "decision": { "behavior": "allow" } } }));
    assert_eq!(decision_of(&hook_response(Some(Decision::Deny), None, None)), json!({ "behavior": "deny", "message": "Denied in FocuSD Island" }));
    assert_eq!(decision_of(&hook_response(Some(Decision::Deny), Some(" 换个目录 "), None))["message"], "换个目录");
    // "Always" keeps the suggested rules for this session only, not in a settings file.
    let always = decision_of(&hook_response(Some(Decision::AllowAlways), None, Some(&suggestions)));
    assert_eq!(always["updatedPermissions"][0]["destination"], "session");
    assert_eq!(decision_of(&hook_response(Some(Decision::AllowAlways), None, None)), json!({ "behavior": "allow" }));
}

#[test]
fn hook_input_needs_a_session_and_a_tool() {
    let input = HookInput::parse(hook_body("s", "Bash").as_bytes()).unwrap();
    assert_eq!((input.session_id.as_str(), input.tool_name.as_str(), input.cwd.as_deref()), ("s", "Bash", Some("E:\\p")));
    assert!(input.permission_suggestions.is_some());
    assert!(HookInput::parse(b"{\"tool_name\":\"Bash\"}").is_err());
    assert!(HookInput::parse(b"not json").is_err());
    assert!(HookInput::parse(hook_body("s", "AskUserQuestion").as_bytes()).unwrap().is_question());
    assert_eq!(Agent::from_path("/codex/permission-request"), Some(Agent::Codex));
    assert_eq!(Agent::from_path("/"), None);
}

#[test]
fn a_session_shows_one_request_at_a_time() {
    let input = |session: &str| HookInput::parse(hook_body(session, "Bash").as_bytes()).unwrap();
    let mut queue = Queue::default();
    let (a1, shown) = queue.push(Agent::ClaudeCode, input("a"), 1);
    assert!(shown);
    let (a2, shown) = queue.push(Agent::ClaudeCode, input("a"), 2);
    assert!(!shown);
    let (b1, shown) = queue.push(Agent::ClaudeCode, input("b"), 3);
    assert!(shown);
    // The same session id from another agent is another session.
    assert!(queue.push(Agent::Codex, input("a"), 4).1);
    assert_eq!(queue.shown().iter().map(|request| request.id).collect::<Vec<_>>(), vec![a1.id, b1.id, 4]);
    assert!(queue.decide(a2.id, Decision::Allow, None).is_err());
    queue.decide(a1.id, Decision::Allow, None).unwrap();
    assert_eq!(queue.outcome(a1.id).unwrap().decision, Decision::Allow);
    assert_eq!(queue.remove(a1.id).map(|next| next.id), Some(a2.id));
    assert_eq!(queue.remove(b1.id), None);
    assert!(queue.decide(a1.id, Decision::Allow, None).is_err());
}

#[test]
fn config_gets_a_token_and_keeps_it() {
    let dir = std::env::temp_dir().join(format!("focusd-approval-test-{}", std::process::id()));
    let path = dir.join("agent-approval.json");
    let _ = std::fs::remove_dir_all(&dir);
    let (config, changed) = load_config(&path).unwrap();
    assert!(changed && is_valid_token(&config.token));
    assert_eq!(config.port, 47830);
    super::config::save_config(&path, &config).unwrap();
    assert_eq!(load_config(&path).unwrap(), (config, false));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn a_decision_on_the_island_answers_the_waiting_hook() {
    let server = TestServer::start(Duration::from_secs(30));
    let waiting = server.post_later("s1");
    server.wait_for(|server| server.requested().len() == 1);
    let id = server.requested()[0].0;
    assert_eq!(server.shared.pending().len(), 1);
    server.shared.decide(id, Decision::Allow, None).unwrap();
    let (status, body) = waiting.join().unwrap();
    assert_eq!((status, decision_of(&body)["behavior"].clone()), (200, json!("allow")));
    assert_eq!(server.closed(), vec![(id, CloseReason::Decided)]);
    assert!(server.shared.pending().is_empty());
}

#[test]
fn handing_back_or_waiting_too_long_returns_an_empty_answer() {
    let server = TestServer::start(Duration::from_millis(400));
    let waiting = server.post_later("s1");
    server.wait_for(|server| server.requested().len() == 1);
    let first = server.requested()[0].0;
    server.shared.decide(first, Decision::Terminal, None).unwrap();
    assert_eq!(waiting.join().unwrap(), (200, "{}".to_string()));
    // Nobody answers this one.
    assert_eq!(server.post("s1", "Bash"), (200, "{}".to_string()));
    let closed = server.closed();
    assert_eq!(closed[0], (first, CloseReason::HandedBack));
    assert_eq!(closed[1].1, CloseReason::Timeout);
}

#[test]
fn the_next_request_of_a_session_shows_when_the_first_closes() {
    let server = TestServer::start(Duration::from_secs(30));
    let first = server.post_later("s1");
    server.wait_for(|server| server.requested().len() == 1);
    let second = server.post_later("s1");
    // Give the second request time to arrive and queue.
    thread::sleep(Duration::from_millis(300));
    assert_eq!(server.requested().len(), 1, "the second waits behind the first");
    let first_id = server.requested()[0].0;
    server.shared.decide(first_id, Decision::Deny, Some("不行".into())).unwrap();
    assert_eq!(decision_of(&first.join().unwrap().1)["message"], "不行");
    server.wait_for(|server| server.requested().len() == 2);
    let second_id = server.requested()[1].0;
    server.shared.decide(second_id, Decision::Allow, None).unwrap();
    assert_eq!(decision_of(&second.join().unwrap().1)["behavior"], "allow");
}

#[test]
fn a_hang_up_takes_the_card_away() {
    let server = TestServer::start(Duration::from_secs(30));
    let mut stream = TcpStream::connect(("127.0.0.1", server.port)).unwrap();
    let request = raw_request(server.port, "/claude/permission-request", TOKEN, "", &hook_body("s1", "Bash"));
    stream.write_all(request.as_bytes()).unwrap();
    server.wait_for(|server| server.requested().len() == 1);
    // The user pressed Esc: the agent closes the connection.
    stream.shutdown(Shutdown::Both).unwrap();
    drop(stream);
    server.wait_for(|server| !server.closed().is_empty());
    assert_eq!(server.closed()[0].1, CloseReason::Disconnected);
    assert!(server.shared.pending().is_empty());
}

#[test]
fn off_questions_and_strangers_get_no_card() {
    let server = TestServer::start(Duration::from_secs(30));
    // Questions go to the terminal until the island can ask them.
    assert_eq!(server.post("s1", "AskUserQuestion"), (200, "{}".to_string()));
    server.shared.set_enabled(false);
    assert_eq!(server.post("s1", "Bash"), (200, "{}".to_string()));
    server.shared.set_enabled(true);
    let body = hook_body("s1", "Bash");
    assert_eq!(send(server.port, &raw_request(server.port, "/claude/permission-request", "wrong", "", &body)).0, 401);
    assert_eq!(send(server.port, &raw_request(server.port, "/claude/permission-request", TOKEN, "Origin: https://evil.example\r\n", &body)).0, 403);
    assert_eq!(send(server.port, &raw_request(server.port, "/other", TOKEN, "", &body)).0, 404);
    assert_eq!(send(server.port, &raw_request(server.port, "/claude/permission-request", TOKEN, "", "{}")).0, 400);
    assert!(server.events.lock().unwrap().is_empty());
}

#[test]
fn quitting_hands_every_waiting_request_back() {
    let server = TestServer::start(Duration::from_secs(30));
    let first = server.post_later("s1");
    let second = server.post_later("s2");
    server.wait_for(|server| server.requested().len() == 2);
    server.shared.shut_down();
    assert_eq!(first.join().unwrap(), (200, "{}".to_string()));
    assert_eq!(second.join().unwrap(), (200, "{}".to_string()));
    assert!(server.closed().iter().all(|(_, reason)| *reason == CloseReason::Shutdown));
    // And new ones go straight back.
    assert_eq!(server.post("s3", "Bash"), (200, "{}".to_string()));
}
