use std::{
    io::{BufReader, Read, Write},
    net::{Shutdown, TcpStream},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use serde_json::{json, Value};

use super::config::{is_valid_token, load_config};
use super::decision::{hook_response, question_response, route, Activity, Agent, Answers, Decision, HookInput, Kind, Settled};
use super::http::{check_access, read_request, HttpRequest};
use super::queue::{CloseReason, Outcome, Queue};
use super::server::{listen, ApprovalEvent, Shared};

const TOKEN: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn out(decision: Decision, message: Option<String>) -> Outcome {
    Outcome { decision, message, answers: None }
}

fn answered(pairs: &[(&str, &str)]) -> Outcome {
    let answers: Answers = pairs.iter().map(|(question, answer)| (question.to_string(), answer.to_string())).collect();
    Outcome { decision: Decision::Answer, message: None, answers: Some(answers) }
}

fn questions() -> Value {
    json!({ "questions": [{ "question": "接下来做什么？", "header": "下一步", "multiSelect": false,
        "options": [{ "label": "修 bug", "description": "" }, { "label": "写文档", "description": "" }] }] })
}

fn question_body(session: &str) -> String {
    json!({
        "session_id": session, "cwd": "E:\\p", "hook_event_name": "PreToolUse",
        "tool_name": "AskUserQuestion", "tool_input": questions(),
    })
    .to_string()
}

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
    // A remote computer's hooks carry its own token, which only goes with its name.
    let remote = format!("Bearer {}", super::config::remote_token(TOKEN, "zcm6"));
    let from = |host: &str, auth: &str| check_access(&request(&[("host", "127.0.0.1:47830"), ("x-focusd-remote", host), ("authorization", auth)]), TOKEN, 47830);
    assert_eq!(from("zcm6", &remote).unwrap(), Some("zcm6".to_string()));
    assert_eq!(from("nc-e", &remote).unwrap_err().status, 401);
    assert_eq!(from("zcm6", &bearer).unwrap_err().status, 401);
    assert_eq!(check_access(&request(&[("host", "127.0.0.1:47830"), ("authorization", &bearer)]), TOKEN, 47830).unwrap(), None);
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
    assert_eq!(route("/codex/permission-request"), Some((Agent::Codex, Kind::Permission)));
    assert_eq!(route("/"), None);
}

#[test]
fn a_session_shows_one_request_at_a_time() {
    let input = |session: &str| HookInput::parse(hook_body(session, "Bash").as_bytes()).unwrap();
    let mut queue = Queue::default();
    let (a1, shown) = queue.push(Agent::ClaudeCode, Kind::Permission, input("a"), 1);
    assert!(shown);
    let (a2, shown) = queue.push(Agent::ClaudeCode, Kind::Permission, input("a"), 2);
    assert!(!shown);
    let (b1, shown) = queue.push(Agent::ClaudeCode, Kind::Permission, input("b"), 3);
    assert!(shown);
    // The same session id from another agent is another session.
    assert!(queue.push(Agent::Codex, Kind::Permission, input("a"), 4).1);
    assert_eq!(queue.shown().iter().map(|request| request.id).collect::<Vec<_>>(), vec![a1.id, b1.id, 4]);
    assert!(queue.decide(a2.id, out(Decision::Allow, None)).is_err());
    queue.decide(a1.id, out(Decision::Allow, None)).unwrap();
    assert_eq!(queue.outcome(a1.id).unwrap().decision, Decision::Allow);
    assert_eq!(queue.remove(a1.id).map(|next| next.id), Some(a2.id));
    assert_eq!(queue.remove(b1.id), None);
    assert!(queue.decide(a1.id, out(Decision::Allow, None)).is_err());
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
    server.shared.decide(id, out(Decision::Allow, None)).unwrap();
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
    server.shared.decide(first, out(Decision::Terminal, None)).unwrap();
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
    server.shared.decide(first_id, out(Decision::Deny, Some("不行".into()))).unwrap();
    assert_eq!(decision_of(&first.join().unwrap().1)["message"], "不行");
    server.wait_for(|server| server.requested().len() == 2);
    let second_id = server.requested()[1].0;
    server.shared.decide(second_id, out(Decision::Allow, None)).unwrap();
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

#[test]
fn answers_go_back_in_the_tools_input() {
    assert_eq!(question_response(None, &questions()), "{}");
    assert_eq!(question_response(Some(&Answers::new()), &questions()), "{}");
    let answers: Answers = [("接下来做什么？".to_string(), "随便写点什么".to_string())].into();
    let output: Value = serde_json::from_str(&question_response(Some(&answers), &questions())).unwrap();
    let output = &output["hookSpecificOutput"];
    assert_eq!((output["hookEventName"].as_str(), output["permissionDecision"].as_str()), (Some("PreToolUse"), Some("allow")));
    assert_eq!(output["updatedInput"]["questions"], questions()["questions"]);
    assert_eq!(output["updatedInput"]["answers"]["接下来做什么？"], "随便写点什么");
    assert_eq!(route("/claude/ask-user-question"), Some((Agent::ClaudeCode, Kind::Question)));
}

#[test]
fn a_question_takes_answers_or_a_hand_back_and_an_approval_does_not_take_answers() {
    let mut queue = Queue::default();
    let (question, _) = queue.push(Agent::ClaudeCode, Kind::Question, HookInput::parse(question_body("q").as_bytes()).unwrap(), 1);
    let (approval, _) = queue.push(Agent::ClaudeCode, Kind::Permission, HookInput::parse(hook_body("p", "Bash").as_bytes()).unwrap(), 2);
    for decision in [Decision::Allow, Decision::Deny, Decision::AllowAlways] {
        assert!(queue.decide(question.id, out(decision, None)).is_err());
    }
    assert!(queue.decide(question.id, out(Decision::Answer, None)).is_err(), "answering needs answers");
    assert!(queue.decide(approval.id, answered(&[("x", "y")])).is_err());
    queue.decide(question.id, answered(&[("接下来做什么？", "修 bug")])).unwrap();
    assert_eq!(queue.shown()[0].kind, Kind::Question);
}

#[test]
fn a_question_answered_on_the_island_reaches_claude_code() {
    let server = TestServer::start(Duration::from_secs(30));
    let request = raw_request(server.port, "/claude/ask-user-question", TOKEN, "", &question_body("s1"));
    let port = server.port;
    let waiting = thread::spawn(move || send(port, &request));
    server.wait_for(|server| server.requested().len() == 1);
    let shown = server.shared.pending()[0].clone();
    assert_eq!((shown.kind, shown.tool_name.as_str()), (Kind::Question, "AskUserQuestion"));
    server.shared.decide(shown.id, answered(&[("接下来做什么？", "写文档")])).unwrap();
    let (status, body) = waiting.join().unwrap();
    let output: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(status, 200);
    assert_eq!(output["hookSpecificOutput"]["updatedInput"]["answers"]["接下来做什么？"], "写文档");
    assert_eq!(server.closed()[0].1, CloseReason::Decided);
}

#[test]
fn questions_handed_back_or_off_the_path_go_to_the_terminal() {
    let server = TestServer::start(Duration::from_millis(400));
    let question = |body: &str| send(server.port, &raw_request(server.port, "/claude/ask-user-question", TOKEN, "", body));
    // Only AskUserQuestion is held there, whatever the hook's matcher.
    assert_eq!(question(&hook_body("s1", "Bash")), (200, "{}".to_string()));
    // Nobody answers: back to the terminal.
    assert_eq!(question(&question_body("s1")), (200, "{}".to_string()));
    assert_eq!(server.closed()[0].1, CloseReason::Timeout);
    // Handed back on the island.
    let request = raw_request(server.port, "/claude/ask-user-question", TOKEN, "", &question_body("s2"));
    let port = server.port;
    let waiting = thread::spawn(move || send(port, &request));
    server.wait_for(|server| server.requested().len() == 2);
    let id = server.requested()[1].0;
    server.shared.decide(id, out(Decision::Terminal, None)).unwrap();
    assert_eq!(waiting.join().unwrap(), (200, "{}".to_string()));
    // Off: no card.
    server.shared.set_enabled(false);
    assert_eq!(question(&question_body("s3")), (200, "{}".to_string()));
    assert_eq!(server.requested().len(), 2);
}

fn activity_body(session: &str, event: &str, tool: &str, command: &str, agent_id: Option<&str>) -> String {
    let mut body = json!({ "session_id": session, "hook_event_name": event, "tool_name": tool, "tool_input": { "command": command } });
    if let Some(agent_id) = agent_id {
        body["agent_id"] = json!(agent_id);
    }
    body.to_string()
}

fn activity(session: &str, event: &str, tool: &str, command: &str, agent_id: Option<&str>) -> Activity {
    Activity::parse(activity_body(session, event, tool, command, agent_id).as_bytes()).unwrap().unwrap()
}

/// A permission request of session `session` for the Bash `command`, from subagent `agent_id`.
fn bash_input(session: &str, command: &str, agent_id: Option<&str>) -> HookInput {
    let mut body: Value = serde_json::from_str(&hook_body(session, "Bash")).unwrap();
    body["tool_input"] = json!({ "command": command });
    if let Some(agent_id) = agent_id {
        body["agent_id"] = json!(agent_id);
    }
    HookInput::parse(body.to_string().as_bytes()).unwrap()
}

#[test]
fn activity_says_which_requests_it_settles() {
    assert!(Activity::parse(b"not json").is_err());
    assert!(Activity::parse(br#"{ "hook_event_name": "Stop" }"#).is_err(), "no session");
    assert_eq!(Activity::parse(activity_body("s", "PreToolUse", "Bash", "x", None).as_bytes()).unwrap(), None);
    assert_eq!(Activity::parse(br#"{ "session_id": "s", "hook_event_name": "SubagentStop" }"#).unwrap(), None, "whose turn?");
    let done = activity("s", "PostToolUse", "Bash", "x", Some("a1"));
    assert_eq!(done.agent_id.as_deref(), Some("a1"));
    assert_eq!(done.settled, Settled::ToolCall { tool_name: "Bash".into(), tool_input: json!({ "command": "x" }) });
    for event in ["PostToolUseFailure", "PermissionDenied"] {
        assert!(matches!(activity("s", event, "Bash", "x", None).settled, Settled::ToolCall { .. }), "{event}");
    }
    // Stop and a new prompt belong to the main agent whatever else the input says.
    assert_eq!(activity("s", "Stop", "", "", Some("a1")).agent_id, None);
    assert_eq!(activity("s", "UserPromptSubmit", "", "", None).settled, Settled::Turn);
    assert_eq!(activity("s", "SubagentStop", "", "", Some("a1")).agent_id.as_deref(), Some("a1"));
}

#[test]
fn a_session_that_moved_on_settles_only_its_own_requests() {
    let mut queue = Queue::default();
    let (one, _) = queue.push(Agent::ClaudeCode, Kind::Permission, bash_input("s", "one", None), 1);
    let (two, _) = queue.push(Agent::ClaudeCode, Kind::Permission, bash_input("s", "two", None), 2);
    let (sub, _) = queue.push(Agent::ClaudeCode, Kind::Permission, bash_input("s", "one", Some("a1")), 3);
    let (other, _) = queue.push(Agent::ClaudeCode, Kind::Permission, bash_input("t", "one", None), 4);
    let (codex, _) = queue.push(Agent::Codex, Kind::Permission, bash_input("s", "one", None), 5);

    // The call that ran: exactly that request, not the subagent's twin, another session's or Codex's.
    assert_eq!(queue.settle_elsewhere(Agent::ClaudeCode, &activity("s", "PostToolUse", "Bash", "one", None)), vec![one.id]);
    assert!(queue.answered_elsewhere(one.id) && !queue.answered_elsewhere(sub.id));
    // Settled once: the next event finds the only Bash request left, by its tool alone.
    assert_eq!(queue.settle_elsewhere(Agent::ClaudeCode, &activity("s", "PostToolUse", "Bash", "changed", None)), vec![two.id]);
    // Another tool settles nothing.
    assert!(queue.settle_elsewhere(Agent::ClaudeCode, &activity("s", "PostToolUse", "Write", "one", None)).is_empty());
    // A decision on the island wins over a later activity.
    queue.decide(other.id, out(Decision::Allow, None)).unwrap();
    assert!(queue.settle_elsewhere(Agent::ClaudeCode, &activity("t", "Stop", "", "", None)).is_empty());
    // The main agent's turn ending leaves the subagent's request; the subagent's ending settles it.
    assert!(queue.settle_elsewhere(Agent::ClaudeCode, &activity("s", "Stop", "", "", None)).is_empty());
    assert_eq!(queue.settle_elsewhere(Agent::ClaudeCode, &activity("s", "SubagentStop", "", "", Some("a1"))), vec![sub.id]);
    assert!(!queue.answered_elsewhere(codex.id));
}

#[test]
fn ambiguous_tool_calls_settle_nothing_but_a_finished_turn_settles_all() {
    let mut queue = Queue::default();
    let (a, _) = queue.push(Agent::ClaudeCode, Kind::Permission, bash_input("s", "a", None), 1);
    let (b, _) = queue.push(Agent::ClaudeCode, Kind::Permission, bash_input("s", "b", None), 2);
    assert!(queue.settle_elsewhere(Agent::ClaudeCode, &activity("s", "PostToolUse", "Bash", "c", None)).is_empty());
    assert_eq!(queue.settle_elsewhere(Agent::ClaudeCode, &activity("s", "UserPromptSubmit", "", "", None)), vec![a.id, b.id]);
}

#[test]
fn an_answer_in_the_terminal_takes_the_card_away_and_shows_the_next() {
    let server = TestServer::start(Duration::from_secs(30));
    let first = server.post_later("s1");
    server.wait_for(|server| server.requested().len() == 1);
    let second = server.post_later("s1");
    thread::sleep(Duration::from_millis(300));
    let post = |token: &str, body: &str| send(server.port, &raw_request(server.port, "/claude/activity", token, "", body));

    assert_eq!(post("wrong", &activity_body("s1", "PostToolUse", "Bash", "cmd /c echo hi", None)).0, 401);
    assert_eq!(post(TOKEN, "{}").0, 400);
    // Other events, and other sessions, change nothing.
    assert_eq!(post(TOKEN, &activity_body("s1", "PreToolUse", "Bash", "cmd /c echo hi", None)), (200, "{}".into()));
    assert_eq!(post(TOKEN, &activity_body("s2", "PostToolUse", "Bash", "cmd /c echo hi", None)), (200, "{}".into()));
    thread::sleep(Duration::from_millis(300));
    assert!(server.closed().is_empty());

    // The user allowed the first call in the terminal and it ran.
    assert_eq!(post(TOKEN, &activity_body("s1", "PostToolUse", "Bash", "cmd /c echo hi", None)).0, 200);
    assert_eq!(first.join().unwrap(), (200, "{}".into()), "the open hook connection gets an empty answer");
    server.wait_for(|server| server.requested().len() == 2);
    assert_eq!(server.closed()[0], (server.requested()[0].0, CloseReason::AnsweredElsewhere));
    // The turn ended while the second still showed.
    post(TOKEN, &activity_body("s1", "Stop", "", "", None));
    assert_eq!(second.join().unwrap(), (200, "{}".into()));
    assert!(server.shared.pending().is_empty());
}
