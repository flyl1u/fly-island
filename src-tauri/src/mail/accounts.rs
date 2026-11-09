//! One mail service (worker thread, state and IMAP connection) per mailbox,
//! keyed by the normalized address. Multi-account design ported from
//! flyl1u/fly-island#39 by ShengLin1001.

use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex, MutexGuard, OnceLock, PoisonError,
    },
    thread,
};
use tauri::AppHandle;

use super::service::{MailService, MailState, Work};
use super::supervisor::supervise;

/// Each mailbox holds a thread and an IMAP connection, so the count stays small.
pub(super) const MAX_ACCOUNTS: usize = 5;

static APP: OnceLock<AppHandle> = OnceLock::new();
static SERVICES: Mutex<BTreeMap<String, Arc<MailService>>> = Mutex::new(BTreeMap::new());
// Shared by every mailbox so a re-added account never reuses revisions the frontend already saw.
static REVISION: AtomicU64 = AtomicU64::new(0);

pub(super) fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

pub(super) fn next_revision() -> u64 {
    REVISION.fetch_add(1, Ordering::SeqCst) + 1
}

fn services() -> MutexGuard<'static, BTreeMap<String, Arc<MailService>>> {
    SERVICES.lock().unwrap_or_else(PoisonError::into_inner)
}

pub(super) fn all() -> Vec<Arc<MailService>> {
    services().values().cloned().collect()
}

pub(super) fn find(email: &str) -> Result<Arc<MailService>, String> {
    services()
        .get(email)
        .cloned()
        .ok_or_else(|| "请先连接这个邮箱。".into())
}

/// The mailbox's service, starting one (and its worker thread) when it has none yet.
pub(super) fn find_or_start(email: &str, host: &str) -> Result<Arc<MailService>, String> {
    let mut services = services();
    if let Some(service) = services.get(email) {
        // A worker that crashed too often has ended; connecting or switching
        // the mailbox on again starts a fresh one in its place.
        if service.is_alive() {
            service.set_host(host);
            return Ok(service.clone());
        }
        services.remove(email);
    }
    if services.len() >= MAX_ACCOUNTS {
        return Err(format!("最多同时连接 {MAX_ACCOUNTS} 个邮箱，请先断开一个。"));
    }
    let app = APP.get().ok_or("邮箱服务尚未就绪。")?.clone();
    let (sender, receiver) = mpsc::channel();
    let mut state = MailState::default();
    state.snapshot.email = Some(email.to_string());
    let service = Arc::new(MailService {
        app,
        email: email.to_string(),
        host: Mutex::new(host.to_string()),
        state: Mutex::new(state),
        sender,
        idle_socket: Mutex::new(None),
    });
    let worker_service = service.clone();
    thread::Builder::new()
        .name("qq-mail".into())
        .spawn(move || supervise(worker_service, receiver, is_registered))
        .map_err(|_| "无法启动邮箱服务。".to_string())?;
    services.insert(email.to_string(), service.clone());
    Ok(service)
}

/// Whether this service is still the one the mailbox uses.
fn is_registered(service: &Arc<MailService>) -> bool {
    services()
        .get(&service.email)
        .is_some_and(|current| Arc::ptr_eq(current, service))
}

/// Forgets the mailbox and ends its worker thread.
pub(super) fn remove(email: &str) {
    if let Some(service) = services().remove(email) {
        let _ = service.send(Work::Stop);
    }
}
