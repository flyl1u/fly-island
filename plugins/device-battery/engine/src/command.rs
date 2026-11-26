//! The line protocol on standard input: one JSON command per line.
use crate::engine::clock::is_public_id;
use crate::engine::{envelope, Request};
use serde_json::{json, Value};

/// Longer lines end the session.
pub(crate) const MAX_LINE_BYTES: usize = 4096;

#[derive(Debug, PartialEq)]
pub(crate) enum Command {
    Exit,
    /// A full round. A targeted request is answered with a full round as well,
    /// because a new process knows nothing about earlier cards.
    Poll(u64, u64),
    /// A snapshot without looking at any hardware.
    Ready(u64, u64),
    /// DPI is neither read nor written by this engine.
    SetDpi(u64, u64),
    Ignored,
    Invalid,
}

fn counter(command: &Value, name: &str) -> Option<u64> {
    match command.get(name) {
        None => Some(0),
        Some(value) => value.as_u64(),
    }
}

/// An absent or null target is fine; anything else must be a public identifier.
fn target_is_valid(command: &Value, name: &str) -> bool {
    match command.get(name) {
        None | Some(Value::Null) => true,
        Some(value) => value.as_str().is_some_and(is_public_id),
    }
}

pub(crate) fn parse(line: &str) -> Command {
    let Ok(command) = serde_json::from_str::<Value>(line.trim_start_matches('\u{feff}').trim())
    else {
        return Command::Invalid;
    };
    if !command.is_object() {
        return Command::Invalid;
    }
    let action = command["command"].as_str().unwrap_or_default();
    if action == "exit" {
        return Command::Exit;
    }
    let (Some(request_id), Some(generation)) = (
        counter(&command, "requestId"),
        counter(&command, "generation"),
    ) else {
        return Command::Ignored;
    };
    if !target_is_valid(&command, "deviceId") || !target_is_valid(&command, "physicalId") {
        return Command::Ignored;
    }
    let physical_misused = command.get("physicalId").is_some()
        && (command["physicalId"].is_null()
            || command.get("deviceId").is_some()
            || action != "poll");
    if physical_misused {
        return Command::Ignored;
    }
    match action {
        "poll" => Command::Poll(request_id, generation),
        "ready" => Command::Ready(request_id, generation),
        "set_dpi" => Command::SetDpi(request_id, generation),
        _ => Command::Ignored,
    }
}

pub(crate) fn request(request_id: u64, generation: u64) -> Request {
    Request {
        request_id,
        generation,
    }
}

pub(crate) fn failure(request_id: u64, generation: u64, message: &str, code: &str) -> Value {
    let mut answer = envelope(request_id, generation, true);
    answer["error"] = json!(message);
    answer["errors"] = json!([format!("manager: {code}")]);
    answer
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_hosts_command_is_a_poll() {
        let line = "\u{feff}{\"command\":\"poll\",\"requestId\":1,\"parkEmptyReaders\":true}\n";
        assert_eq!(parse(line), Command::Poll(1, 0));
    }

    #[test]
    fn malformed_arguments_are_ignored_and_malformed_lines_answered() {
        assert_eq!(
            parse(r#"{"command":"poll","requestId":-1}"#),
            Command::Ignored
        );
        assert_eq!(
            parse(r#"{"command":"poll","requestId":1.5}"#),
            Command::Ignored
        );
        assert_eq!(
            parse(r#"{"command":"poll","deviceId":"x"}"#),
            Command::Ignored
        );
        assert_eq!(
            parse(r#"{"command":"poll","physicalId":null}"#),
            Command::Ignored
        );
        assert_eq!(parse(r#"{"command":"reboot"}"#), Command::Ignored);
        assert_eq!(parse("not json"), Command::Invalid);
        assert_eq!(parse("[1]"), Command::Invalid);
        assert_eq!(parse(r#"{"command":"exit"}"#), Command::Exit);
    }

    #[test]
    fn failures_keep_the_snapshot_shape() {
        let answer = failure(0, 0, "Battery query did not complete", "invalid_request");
        assert_eq!(answer["devices"], json!([]));
        assert_eq!(answer["errors"], json!(["manager: invalid_request"]));
        assert_eq!(answer["complete"], true);
    }
}
