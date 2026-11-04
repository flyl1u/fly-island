//! JSON-RPC 2.0 messages between the host and a plugin, one JSON object per line.

use serde_json::{json, Value};

pub(super) const PARSE_ERROR: i64 = -32700;
pub(super) const INVALID_REQUEST: i64 = -32600;
pub(super) const METHOD_NOT_FOUND: i64 = -32601;
/// The island answered with an error; `data.status` carries its HTTP-style status.
pub(super) const HOST_ERROR: i64 = -32000;
pub(super) const PERMISSION_DENIED: i64 = -32001;

#[derive(Debug, Clone, PartialEq)]
pub(super) enum Incoming {
    Request { id: Value, method: String, params: Value },
    Notification { method: String, params: Value },
    /// A response to something the host sent; the host sends no requests yet.
    Response,
    /// Answered with an error when it carries an id.
    Invalid { id: Value, code: i64, message: String },
}

pub(super) fn parse_line(line: &str) -> Incoming {
    let message: Value = match serde_json::from_str(line) {
        Ok(message) => message,
        Err(error) => {
            return Incoming::Invalid {
                id: Value::Null,
                code: PARSE_ERROR,
                message: format!("Not valid JSON: {error}"),
            }
        }
    };
    let id = message.get("id").cloned();
    let valid_id = matches!(id, None | Some(Value::String(_) | Value::Number(_)));
    let method = message.get("method").and_then(Value::as_str);
    if message.get("jsonrpc").and_then(Value::as_str) != Some("2.0") || !valid_id {
        return Incoming::Invalid {
            id: id.filter(|_| valid_id).unwrap_or(Value::Null),
            code: INVALID_REQUEST,
            message: "Expected a JSON-RPC 2.0 message with a string or number id.".into(),
        };
    }
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    match (id, method) {
        (Some(id), Some(method)) => Incoming::Request {
            id,
            method: method.to_string(),
            params,
        },
        (None, Some(method)) => Incoming::Notification {
            method: method.to_string(),
            params,
        },
        (Some(_), None) if message.get("result").is_some() || message.get("error").is_some() => Incoming::Response,
        (id, None) => Incoming::Invalid {
            id: id.unwrap_or(Value::Null),
            code: INVALID_REQUEST,
            message: "Missing \"method\".".into(),
        },
    }
}

pub(super) fn result_line(id: &Value, result: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

pub(super) fn error_line(id: &Value, code: i64, message: &str, data: Option<Value>) -> String {
    let mut error = json!({ "code": code, "message": message });
    if let Some(data) = data {
        error["data"] = data;
    }
    json!({ "jsonrpc": "2.0", "id": id, "error": error }).to_string()
}

pub(super) fn notification_line(method: &str, params: Value) -> String {
    json!({ "jsonrpc": "2.0", "method": method, "params": params }).to_string()
}
