//! The HTTP listener on 127.0.0.1. Each request runs on its own thread because
//! it may wait for the island window's answer.

use serde_json::{json, Value};
use std::{
    io::Read,
    sync::{Arc, Mutex, PoisonError},
    thread,
};
use tauri::AppHandle;
use tiny_http::{Header, Request, Response, Server};

use crate::agent_status;

use super::{
    bridge,
    routes::{self, ApiError, RequestHeaders, API_VERSION, MAX_BODY_BYTES},
};

/// Owner of agent statuses reported over HTTP; their ids are `local-api/<source>`.
pub(super) const LOCAL_API_OWNER: &str = "local-api";

struct RunningServer {
    server: Arc<Server>,
    port: u16,
}

static RUNNING: Mutex<Option<RunningServer>> = Mutex::new(None);

/// Starts listening, trying `preferred_port` first. Returns the actual port.
/// Already running: keeps the current listener.
pub(super) fn start(app: AppHandle, preferred_port: u16) -> Result<u16, String> {
    let mut running = RUNNING.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some(current) = running.as_ref() {
        return Ok(current.port);
    }

    let server = Server::http(("127.0.0.1", preferred_port))
        .or_else(|_| Server::http(("127.0.0.1", 0)))
        .map_err(|error| format!("Could not start the local API: {error}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|address| address.port())
        .ok_or_else(|| "The local API did not get a TCP port.".to_string())?;
    let server = Arc::new(server);
    let listener = Arc::clone(&server);
    thread::Builder::new()
        .name("local-api".into())
        .spawn(move || {
            // Ends when `stop` unblocks the server.
            for request in listener.incoming_requests() {
                let app = app.clone();
                let _ = thread::Builder::new()
                    .name("local-api-request".into())
                    .spawn(move || handle(&app, request, port));
            }
        })
        .map_err(|error| format!("Could not start the local API thread: {error}"))?;

    *running = Some(RunningServer { server, port });
    Ok(port)
}

pub(super) fn stop() {
    if let Some(current) = RUNNING.lock().unwrap_or_else(PoisonError::into_inner).take() {
        current.server.unblock();
    }
}

pub(super) fn running_port() -> Option<u16> {
    RUNNING
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_ref()
        .map(|current| current.port)
}

fn handle(app: &AppHandle, mut request: Request, port: u16) {
    let result = answer(app, &mut request, port);
    let (status, body) = match result {
        Ok(data) => (200, json!({ "ok": true, "data": data })),
        Err(error) => (error.status, json!({ "ok": false, "error": error.message })),
    };
    let mut response = Response::from_string(body.to_string()).with_status_code(status);
    if let Ok(header) = Header::from_bytes("Content-Type", "application/json; charset=utf-8") {
        response = response.with_header(header);
    }
    let _ = request.respond(response);
}

fn answer(app: &AppHandle, request: &mut Request, port: u16) -> Result<Value, ApiError> {
    let config = super::current_config();
    routes::check_access(&request_headers(request), &config.token, port)?;

    let mut body = Vec::new();
    request
        .as_reader()
        .take(MAX_BODY_BYTES as u64 + 1)
        .read_to_end(&mut body)
        .map_err(|error| ApiError::new(400, format!("Could not read the body: {error}")))?;
    if body.len() > MAX_BODY_BYTES {
        return Err(ApiError::new(413, "The body is too large."));
    }

    let call = routes::route(request.method().as_str(), request.url(), &body)?;
    if call.writes && !config.allow_write {
        return Err(ApiError::new(403, "Changes are turned off in FocuSD Island settings."));
    }
    if call.method == "health" {
        return Ok(json!({
            "app": "FocuSD Island",
            "version": app.package_info().version.to_string(),
            "apiVersion": API_VERSION,
            "allowWrite": config.allow_write,
        }));
    }
    // Agent statuses live natively; everything else is answered by the island window.
    let to_api_error = |(status, message): (u16, String)| ApiError::new(status, message);
    match call.method {
        "agentStatus.report" => {
            let name = call.params.get("source").and_then(Value::as_str).unwrap_or_default().to_string();
            agent_status::report_external_status(LOCAL_API_OWNER, &name, &call.params).map_err(to_api_error)
        }
        "agentStatus.clear" => agent_status::clear_external_status(LOCAL_API_OWNER, &call.params).map_err(to_api_error),
        _ => bridge::dispatch(app, call),
    }
}

fn request_headers(request: &Request) -> RequestHeaders {
    let mut headers = RequestHeaders::default();
    for header in request.headers() {
        let value = Some(header.value.as_str().to_string());
        if header.field.equiv("Host") {
            headers.host = value;
        } else if header.field.equiv("Origin") {
            headers.origin = value;
        } else if header.field.equiv("Authorization") {
            headers.authorization = value;
        }
    }
    headers
}
