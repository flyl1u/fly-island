//! Pure request checks and routing: HTTP method + path + body to an API call.

use serde_json::{json, Map, Value};

pub(super) const API_VERSION: u32 = 1;
pub(super) const MAX_BODY_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub(super) struct ApiCall {
    /// Method name handled by the island window, e.g. `todos.add`; `health` is
    /// answered by Rust directly.
    pub method: &'static str,
    pub params: Value,
    pub writes: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ApiError {
    pub status: u16,
    pub message: String,
}

impl ApiError {
    pub fn new(status: u16, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

/// The request headers that matter for access checks.
#[derive(Debug, Default)]
pub(super) struct RequestHeaders {
    pub host: Option<String>,
    pub origin: Option<String>,
    pub authorization: Option<String>,
}

/// Rejects browser requests (any `Origin`), foreign `Host` names (DNS
/// rebinding) and requests without the right token.
pub(super) fn check_access(headers: &RequestHeaders, token: &str, port: u16) -> Result<(), ApiError> {
    if headers.origin.is_some() {
        return Err(ApiError::new(403, "Requests from web pages are not allowed."));
    }
    let host_ok = headers.host.as_deref().is_some_and(|host| {
        host == format!("127.0.0.1:{port}") || host == format!("localhost:{port}")
    });
    if !host_ok {
        return Err(ApiError::new(403, "Unexpected Host header."));
    }
    let supplied = headers
        .authorization
        .as_deref()
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or("");
    if !constant_time_eq(supplied.as_bytes(), token.as_bytes()) {
        return Err(ApiError::new(401, "Missing or wrong access token."));
    }
    Ok(())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter().zip(right).fold(0u8, |diff, (a, b)| diff | (a ^ b)) == 0
}

pub(super) fn route(method: &str, url: &str, body: &[u8]) -> Result<ApiCall, ApiError> {
    let path = url.split(['?', '#']).next().unwrap_or("");
    let segments: Vec<&str> = path.trim_end_matches('/').split('/').skip(1).collect();
    let call = |name: &'static str, params: Value, writes: bool| ApiCall {
        method: name,
        params,
        writes,
    };

    match (method, segments.as_slice()) {
        ("GET", ["v1", "health"]) => Ok(call("health", Value::Null, false)),
        ("GET", ["v1", "todos"]) => Ok(call("todos.list", Value::Null, false)),
        ("POST", ["v1", "todos"]) => Ok(call("todos.add", body_object(body)?, true)),
        ("PATCH", ["v1", "todos", id]) => {
            let mut params = body_map(body)?;
            params.insert("id".into(), Value::String(todo_id(id)?));
            Ok(call("todos.update", Value::Object(params), true))
        }
        ("DELETE", ["v1", "todos", id]) => {
            let mut params = Map::new();
            params.insert("id".into(), Value::String(todo_id(id)?));
            Ok(call("todos.remove", Value::Object(params), true))
        }
        ("GET", ["v1", "note"]) => Ok(call("note.get", Value::Null, false)),
        ("PUT", ["v1", "note"]) => Ok(call("note.set", body_object(body)?, true)),
        ("PUT", ["v1", "agent-status", source]) => {
            let mut params = body_map(body)?;
            params.insert("source".into(), Value::String((*source).to_string()));
            Ok(call("agentStatus.report", Value::Object(params), true))
        }
        ("DELETE", ["v1", "agent-status", source]) => {
            let mut params = Map::new();
            params.insert("source".into(), Value::String((*source).to_string()));
            Ok(call("agentStatus.clear", Value::Object(params), true))
        }
        // Development mode (plugin_host/dev.rs), for `fly-island-plugin dev`.
        ("POST", ["v1", "dev", "plugins"]) => Ok(call("dev.load", body_object(body)?, false)),
        ("POST", ["v1", "dev", "plugins", id, "reload"]) => Ok(call("dev.reload", json!({ "id": id }), false)),
        ("DELETE", ["v1", "dev", "plugins", id]) => Ok(call("dev.unload", json!({ "id": id }), false)),
        ("GET", ["v1", "dev", "plugins", id, "log"]) => Ok(call("dev.log", json!({ "id": id, "after": query_number(url, "after") }), false)),
        (_, ["v1", "dev", "plugins"] | ["v1", "dev", "plugins", _] | ["v1", "dev", "plugins", _, "reload" | "log"]) => {
            Err(ApiError::new(405, "Method not allowed for this path."))
        }
        (_, ["v1", "health"] | ["v1", "todos"] | ["v1", "todos", _] | ["v1", "note"] | ["v1", "agent-status", _]) => {
            Err(ApiError::new(405, "Method not allowed for this path."))
        }
        _ => Err(ApiError::new(404, "Unknown path.")),
    }
}

/// A non-negative number from the query string, 0 when missing or not a number.
fn query_number(url: &str, name: &str) -> u64 {
    url.split_once('?')
        .map(|(_, query)| query)
        .unwrap_or("")
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find(|(key, _)| *key == name)
        .and_then(|(_, value)| value.parse().ok())
        .unwrap_or(0)
}

fn body_object(body: &[u8]) -> Result<Value, ApiError> {
    body_map(body).map(Value::Object)
}

fn body_map(body: &[u8]) -> Result<Map<String, Value>, ApiError> {
    if body.iter().all(u8::is_ascii_whitespace) {
        return Ok(Map::new());
    }
    match serde_json::from_slice::<Value>(body) {
        Ok(Value::Object(map)) => Ok(map),
        Ok(_) => Err(ApiError::new(400, "The body must be a JSON object.")),
        Err(error) => Err(ApiError::new(400, format!("Invalid JSON: {error}"))),
    }
}

/// Todo ids are UUIDs (or the older fallback ids); anything else cannot exist.
fn todo_id(segment: &str) -> Result<String, ApiError> {
    let valid = !segment.is_empty()
        && segment.len() <= 64
        && segment
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_' || byte == b'.');
    if valid {
        Ok(segment.to_string())
    } else {
        Err(ApiError::new(404, "Todo not found."))
    }
}
