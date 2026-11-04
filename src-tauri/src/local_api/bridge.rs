//! Hands API calls to the island window and waits for its answer. Todos and
//! notes live in the window's localStorage, so the window is the only place
//! that can read or change them.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Mutex, OnceLock, PoisonError,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter};

use super::routes::{ApiCall, ApiError};
use crate::island;

/// Sent to the island window. Mirrored by `LOCAL_API_REQUEST_EVENT` in
/// src/features/local-api/api.ts.
pub(super) const REQUEST_EVENT: &str = "local-api-request";
const ANSWER_TIMEOUT: Duration = Duration::from_secs(5);

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static PENDING: OnceLock<Mutex<HashMap<u64, mpsc::Sender<BridgeResponse>>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
struct BridgeRequest {
    id: u64,
    method: &'static str,
    params: Value,
}

/// The island window's answer. Mirrored by `LocalApiResponse` in
/// src/features/local-api/api.ts.
#[derive(Debug, Clone, Deserialize)]
pub struct BridgeResponse {
    ok: bool,
    #[serde(default)]
    status: Option<u16>,
    #[serde(default)]
    data: Value,
    #[serde(default)]
    error: Option<String>,
}

fn pending() -> &'static Mutex<HashMap<u64, mpsc::Sender<BridgeResponse>>> {
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

pub(super) fn dispatch(app: &AppHandle, call: ApiCall) -> Result<Value, ApiError> {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (sender, receiver) = mpsc::channel();
    pending()
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .insert(id, sender);

    let request = BridgeRequest {
        id,
        method: call.method,
        params: call.params,
    };
    if let Err(error) = app.emit_to(island::WINDOW_LABEL, REQUEST_EVENT, request) {
        forget(id);
        return Err(ApiError::new(503, format!("The island is not available: {error}")));
    }

    let answer = receiver.recv_timeout(ANSWER_TIMEOUT);
    forget(id);
    match answer {
        Ok(response) if response.ok => Ok(response.data),
        Ok(response) => Err(ApiError::new(
            response.status.filter(|status| (400..600).contains(status)).unwrap_or(400),
            response.error.unwrap_or_else(|| "The request failed.".into()),
        )),
        Err(_) => Err(ApiError::new(504, "The island did not answer in time.")),
    }
}

/// Called by the island window with its answer. An unknown id means the call
/// already timed out, which is not an error for the window.
pub(super) fn complete(id: u64, response: BridgeResponse) {
    let sender = pending()
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .remove(&id);
    if let Some(sender) = sender {
        let _ = sender.send(response);
    }
}

fn forget(id: u64) {
    pending()
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .remove(&id);
}
