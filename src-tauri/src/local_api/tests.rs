use serde_json::json;

use super::config::{generate_token, is_valid_token, load_config, LocalApiConfig, PREFERRED_PORT};
use super::routes::{check_access, route, RequestHeaders};

const TOKEN: &str = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

fn headers(host: &str, authorization: Option<&str>) -> RequestHeaders {
    RequestHeaders {
        host: Some(host.to_string()),
        origin: None,
        authorization: authorization.map(str::to_string),
    }
}

#[test]
fn access_needs_the_token_and_a_local_host() {
    let bearer = format!("Bearer {TOKEN}");
    assert!(check_access(&headers("127.0.0.1:4000", Some(&bearer)), TOKEN, 4000).is_ok());
    assert!(check_access(&headers("localhost:4000", Some(&bearer)), TOKEN, 4000).is_ok());

    let wrong = check_access(&headers("127.0.0.1:4000", Some("Bearer nope")), TOKEN, 4000);
    assert_eq!(wrong.map_err(|error| error.status), Err(401));
    let missing = check_access(&headers("127.0.0.1:4000", None), TOKEN, 4000);
    assert_eq!(missing.map_err(|error| error.status), Err(401));

    let rebinding = check_access(&headers("evil.example:4000", Some(&bearer)), TOKEN, 4000);
    assert_eq!(rebinding.map_err(|error| error.status), Err(403));
    let other_port = check_access(&headers("127.0.0.1:4001", Some(&bearer)), TOKEN, 4000);
    assert_eq!(other_port.map_err(|error| error.status), Err(403));
}

#[test]
fn access_rejects_browser_requests() {
    let mut request = headers("127.0.0.1:4000", Some(&format!("Bearer {TOKEN}")));
    request.origin = Some("https://example.com".into());
    assert_eq!(check_access(&request, TOKEN, 4000).map_err(|error| error.status), Err(403));
}

#[test]
fn routes_map_to_methods() {
    let list = route("GET", "/v1/todos?x=1", b"").expect("list");
    assert_eq!((list.method, list.writes), ("todos.list", false));

    let add = route("POST", "/v1/todos", br#"{"title":"Buy milk"}"#).expect("add");
    assert_eq!((add.method, add.writes), ("todos.add", true));
    assert_eq!(add.params, json!({ "title": "Buy milk" }));

    let update = route("PATCH", "/v1/todos/abc-123", br#"{"completed":true}"#).expect("update");
    assert_eq!(update.method, "todos.update");
    assert_eq!(update.params, json!({ "completed": true, "id": "abc-123" }));

    let remove = route("DELETE", "/v1/todos/abc-123/", b"").expect("remove");
    assert_eq!(remove.params, json!({ "id": "abc-123" }));

    assert_eq!(route("GET", "/v1/note", b"").expect("note").method, "note.get");
    assert_eq!(route("PUT", "/v1/note", br#"{"note":"hi"}"#).expect("note").method, "note.set");
    assert_eq!(route("GET", "/v1/health", b"").expect("health").method, "health");

    let report = route("PUT", "/v1/agent-status/aider", br#"{"phase":"running","source":"other"}"#).expect("report");
    assert_eq!((report.method, report.writes), ("agentStatus.report", true));
    assert_eq!(report.params, json!({ "phase": "running", "source": "aider" }));
    let clear = route("DELETE", "/v1/agent-status/aider", b"").expect("clear");
    assert_eq!((clear.method, clear.params), ("agentStatus.clear", json!({ "source": "aider" })));
    assert_eq!(route("GET", "/v1/agent-status/aider", b"").map_err(|error| error.status), Err(405));
}

#[test]
fn routes_reject_bad_requests() {
    let status = |method: &str, url: &str, body: &[u8]| route(method, url, body).map_err(|error| error.status);
    assert_eq!(status("GET", "/v2/todos", b""), Err(404));
    assert_eq!(status("PUT", "/v1/todos", b""), Err(405));
    assert_eq!(status("POST", "/v1/todos", b"not json"), Err(400));
    assert_eq!(status("POST", "/v1/todos", b"[1,2]"), Err(400));
    assert_eq!(status("DELETE", "/v1/todos/..%2F", b""), Err(404));
    // An id field in the body cannot point the update at another todo.
    let update = route("PATCH", "/v1/todos/a", br#"{"id":"b"}"#).expect("update");
    assert_eq!(update.params["id"], "a");
}

#[test]
fn config_fills_in_a_token_and_keeps_saved_values() {
    let dir = std::env::temp_dir().join(format!("focusd-local-api-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let path = dir.join("local-api.json");

    std::fs::write(&path, "not json").expect("write");
    let (config, changed) = load_config(&path).expect("load");
    assert!(changed);
    assert!(!config.enabled);
    assert_eq!(config.port, PREFERRED_PORT);
    assert!(is_valid_token(&config.token));

    let saved = LocalApiConfig { enabled: true, allow_write: true, port: 40000, token: TOKEN.into() };
    std::fs::write(&path, serde_json::to_string(&saved).expect("json")).expect("write");
    assert_eq!(load_config(&path).expect("load"), (saved, false));

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn tokens_are_random_hex() {
    let first = generate_token().expect("token");
    assert!(is_valid_token(&first));
    assert_ne!(first, generate_token().expect("token"));
}
