//! WorkBuddy's isolated website profile and the connection state exposed to the island.

use reqwest::{header::HeaderValue, Url};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    os::windows::fs::MetadataExt,
    path::PathBuf,
    sync::{Mutex as StdMutex, OnceLock, PoisonError},
    time::{Duration, Instant},
};
use tauri::{
    async_runtime::{channel, Mutex, Sender},
    webview::{Cookie, NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use tokio::{sync::Notify, time};

use super::workbuddy_auth::{
    self as auth, AuthError, CookieMetadata, FailedChecks, FailureAction, Renewal,
};
use super::workbuddy_cookie_vault as vault;
use super::workbuddy_official::SavedLogin;
use super::workbuddy_usage::{self, WorkbuddyUsage, SUMMARY_URL, USAGE_PAGE};

pub(super) const WINDOW_LABEL: &str = "workbuddy-sign-in";
const USAGE_CHANGED: &str = "workbuddy-usage-changed";
pub(super) const REFRESH_INTERVAL: Duration = Duration::from_secs(300);
const STARTUP_DELAY: Duration = Duration::from_secs(30);
const WORKBUDDY_HOST: &str = "www.workbuddy.cn";
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
/// How long a silent visit to the site may take to load and let its own script renew the sign-in.
const SITE_LOAD_TIMEOUT: Duration = Duration::from_secs(20);
const SITE_SETTLE: Duration = Duration::from_secs(2);
const SITE_PROBE_INTERVAL: Duration = Duration::from_millis(250);
const SCRIPT_TIMEOUT: Duration = Duration::from_secs(3);
static SITE_LOADED: StdMutex<Option<Sender<()>>> = StdMutex::new(None);
pub(super) static SCHEDULE_CHANGED: Notify = Notify::const_new();

// Wry reports NavigationCompleted even for failed navigations. Check for the official
// document and wait for the site's own account request before checking the billing session.
const SITE_PROBE: &str = r#"
    (() => {
        if (location.origin !== "https://www.workbuddy.cn") return 0;
        const navigation = performance.getEntriesByType("navigation")[0];
        if (!navigation) return 0;
        if (navigation.responseStatus >= 400) return 2;
        const path = location.pathname.replace(/\/$/, "");
        if (path === "/login") return document.getElementById("app") ? 1 : 2;
        if (path !== "/profile/plans-usage") return 0;
        if (!document.getElementById("root")) return 2;
        const account = performance.getEntriesByName(location.origin + "/console/account", "resource").at(-1);
        if (!account || account.responseStatus === 0) return 0;
        const status = account.responseStatus;
        return status >= 400 && status !== 401 && status !== 403 ? 2 : 1;
    })()
"#;

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(crate) enum WorkbuddyState {
    SignedOut,
    LoginRequired,
    Ready,
    Connected {
        usage: WorkbuddyUsage,
    },
    Unavailable {
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<&'static str>,
    },
}

impl WorkbuddyState {
    const UNAVAILABLE: Self = Self::Unavailable { reason: None };
}

pub(super) struct CachedUsage {
    pub(super) fingerprint: [u8; 32],
    pub(super) checked: Instant,
}

#[derive(Default)]
pub(super) struct Connection {
    pub(super) cached: Option<CachedUsage>,
    pub(super) last_state: Option<WorkbuddyState>,
    pub(super) user_agent: Option<String>,
    pub(super) signing_in: bool,
    pub(super) finish_login: bool,
    pub(super) restored_startup: bool,
    pub(super) tried_startup_replacement: bool,
    pub(super) failures: FailedChecks,
    pub(super) retry_at: Option<Instant>,
    pub(super) renewal: Option<Renewal>,
    /// The cookie set last written to the Credential Manager, so an unchanged one is not rewritten.
    pub(super) saved_fingerprint: Option<[u8; 32]>,
    /// Official-protocol Bearer credential (loaded from the vault; preferred over website cookies).
    pub(super) login: Option<SavedLogin>,
    /// Pending state for an in-flight official login.
    pub(super) official_login_state: Option<String>,
    pub(super) official_login_task: Option<tauri::async_runtime::JoinHandle<()>>,
    failure_diagnostic: Option<(AuthError, bool)>,
}

fn cancel_official_login(connection: &mut Connection) {
    connection.official_login_state = None;
    if let Some(task) = connection.official_login_task.take() {
        task.abort();
    }
}

fn should_log_failure(connection: &mut Connection, error: AuthError, expired: bool) -> bool {
    let next = Some((error, expired));
    std::mem::replace(&mut connection.failure_diagnostic, next) != next
}

pub(super) fn connection() -> &'static Mutex<Connection> {
    static CONNECTION: OnceLock<Mutex<Connection>> = OnceLock::new();
    CONNECTION.get_or_init(|| Mutex::new(Connection::default()))
}

fn profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("workbuddy-web"))
        .map_err(|e| e.to_string())
}

pub(super) fn marker_path(app: &AppHandle) -> Result<PathBuf, String> {
    profile_path(app).map(|path| path.join("connected"))
}

pub(super) fn publish(app: &AppHandle, state: WorkbuddyState) {
    for label in [
        crate::island::WINDOW_LABEL,
        crate::settings_window::WINDOW_LABEL,
    ] {
        let _ = app.emit_to(label, USAGE_CHANGED, state);
    }
}

fn workbuddy_url(url: &Url) -> bool {
    url.scheme() == "https" && url.host_str() == Some(WORKBUDDY_HOST) && url.port().is_none()
}

/// The official plugin login is served from codebuddy.cn; allow its host and the QQ/WeChat QR
/// callbacks but never an arbitrary lookalike.
pub(super) fn official_login_url(url: &Url) -> bool {
    url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(url.host_str(), Some("www.codebuddy.cn" | "codebuddy.cn"))
}

fn login_navigation(url: &Url) -> bool {
    workbuddy_url(url)
        || official_login_url(url)
        || url.scheme() == "https"
            && url.port().is_none()
            && matches!(
                url.host_str(),
                Some(
                    "open.weixin.qq.com"
                        | "graph.qq.com"
                        | "xui.ptlogin2.qq.com"
                        | "ssl.ptlogin2.qq.com"
                ),
            )
}

fn on_usage_page(url: &Url) -> bool {
    workbuddy_url(url) && url.path().trim_end_matches('/') == "/profile/plans-usage"
}

pub(super) fn login_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    // WebView2's environment override takes precedence over the builder's data directory.
    if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_some_and(|folder| !folder.is_empty()) {
        return Err("WorkBuddy requires an isolated WebView2 data directory.".into());
    }
    if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
        return Ok(window);
    }
    let data_directory = isolated_profile_path(app)?.join("WebView2");
    let app_for_close = app.clone();
    let window = WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL,
        WebviewUrl::External(Url::parse("about:blank").map_err(|e| e.to_string())?),
    )
    .title("WorkBuddy · fly-island")
    .inner_size(850.0, 690.0)
    .prevent_overflow()
    .center()
    .visible(false)
    .focused(false)
    .devtools(false)
    .data_directory(data_directory)
    .on_navigation(|url| url.as_str() == "about:blank" || login_navigation(url))
    .on_new_window(|url, _| {
        // Help and policy links can open separately. The login page's QR and callbacks live in this profile.
        if SITE_LOADED
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .is_none()
            && matches!(url.host_str(), Some("rule.tencent.com" | "privacy.qq.com"))
            && url.scheme() == "https"
        {
            let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
        }
        NewWindowResponse::Deny
    })
    .on_page_load(|window, event| {
        if event.event() != PageLoadEvent::Finished || !workbuddy_url(event.url()) {
            return;
        }
        if let Some(loaded) = SITE_LOADED
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
        {
            let _ = loaded.try_send(());
            return;
        }
        if !on_usage_page(event.url()) {
            return;
        }
        let app = window.app_handle().clone();
        tauri::async_runtime::spawn(async move {
            let mut connection = connection().lock().await;
            if !connection.signing_in || !window.url().is_ok_and(|url| on_usage_page(&url)) {
                return;
            }
            check_login(&app, &window, &mut connection, false).await;
        });
    })
    .build()
    .map_err(|e| e.to_string())?;
    let closing = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let app = app_for_close.clone();
            let window = closing.clone();
            tauri::async_runtime::spawn(async move {
                let mut connection = connection().lock().await;
                cancel_official_login(&mut connection);
                if connection.signing_in {
                    if window.url().is_ok_and(|url| on_usage_page(&url)) {
                        check_login(&app, &window, &mut connection, true).await;
                    }
                    connection.signing_in = false;
                }
                let _ = window.hide();
                SCHEDULE_CHANGED.notify_one();
            });
        }
    });
    Ok(window)
}

async fn browser_eval(window: &WebviewWindow, script: &str) -> Result<String, AuthError> {
    let (send, mut receive) = channel(1);
    window
        .eval_with_callback(script, move |result| {
            let _ = send.try_send(result);
        })
        .map_err(|_| AuthError::Webview)?;
    time::timeout(SCRIPT_TIMEOUT, receive.recv())
        .await
        .map_err(|_| AuthError::Timeout)?
        .ok_or(AuthError::Webview)
}

async fn browser_user_agent(window: &WebviewWindow) -> Result<String, AuthError> {
    let result = browser_eval(window, "navigator.userAgent").await?;
    let value: String = serde_json::from_str(&result).map_err(|_| AuthError::Webview)?;
    if value.is_empty() || value.len() > 512 || HeaderValue::from_str(&value).is_err() {
        return Err(AuthError::Webview);
    }
    Ok(value)
}

fn unix_seconds() -> i64 {
    super::snapshot::current_unix_millis() / 1_000
}

fn summary_cookies(window: &WebviewWindow, url: &Url) -> Result<Vec<Cookie<'static>>, AuthError> {
    let mut cookies = window
        .cookies_for_url(url.clone())
        .map_err(|_| AuthError::Webview)?;
    let now = unix_seconds();
    cookies.retain(|cookie| {
        cookie
            .expires_datetime()
            .is_none_or(|expires| expires.unix_timestamp() > now)
    });
    cookies.sort_by(|a, b| {
        b.path()
            .map_or(0, str::len)
            .cmp(&a.path().map_or(0, str::len))
            .then_with(|| a.name().cmp(b.name()))
    });
    Ok(cookies)
}

fn summary_header(cookies: &[Cookie<'_>]) -> Result<Option<HeaderValue>, AuthError> {
    if cookies.is_empty() {
        return Ok(None);
    }
    let header = cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");
    HeaderValue::from_str(&header)
        .map(Some)
        .map_err(|_| AuthError::Webview)
}

fn isolated_profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    let profile = profile_path(app)?;
    for directory in [&profile, &profile.join("WebView2")] {
        match directory.symlink_metadata() {
            Ok(metadata)
                if metadata.is_dir()
                    && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0 => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            _ => return Err("WorkBuddy requires an isolated WebView2 data directory.".into()),
        }
    }
    Ok(profile)
}

async fn refresh(
    connection: &mut Connection,
    window: &WebviewWindow,
    force: bool,
) -> Result<WorkbuddyUsage, AuthError> {
    let starting = !connection.restored_startup;
    let mut restore_error = None;
    if starting {
        restore_error = restore_saved(window, false).err();
        connection.restored_startup = restore_error.is_none();
    }
    if connection
        .renewal
        .is_some_and(|renewal| renewal.at <= Instant::now())
    {
        let restore_error = restore_saved(window, false).err();
        visit_site(window).await?;
        let result = read_usage(connection, window, true, true).await;
        if let (Err(error), Some(restore_error)) = (&result, restore_error) {
            if error.server_rejected() {
                return Err(restore_error);
            }
        }
        return result;
    }

    let error = match read_usage(connection, window, force, false).await {
        Ok(usage) => return Ok(usage),
        Err(error) if error.server_rejected() || error == AuthError::NoCookies => error,
        Err(error) => return Err(error),
    };
    if let Some(error) = restore_error {
        return Err(error);
    }
    // A newer saved cookie can have the same name and path as an older cookie written to disk
    // before shutdown. Only try replacing it before this process has verified the browser session.
    let replace = error.server_rejected()
        && connection.renewal.is_none()
        && !connection.tried_startup_replacement;
    let restored = (!starting || replace) && restore_saved(window, replace)?;
    connection.tried_startup_replacement |= replace;
    if restored {
        match read_usage(connection, window, true, false).await {
            Ok(usage) => return Ok(usage),
            Err(error) if error.server_rejected() || error == AuthError::NoCookies => {}
            Err(error) => return Err(error),
        }
    }
    visit_site(window).await?;
    // When the profile and the saved copy are empty, ask the server after the visit too. A local
    // absence alone says nothing about whether the site can still recover this sign-in.
    read_usage(connection, window, true, true).await
}

fn restore_saved(window: &WebviewWindow, replace: bool) -> Result<bool, AuthError> {
    let saved = vault::load().map_err(|_| AuthError::CredentialRead)?;
    if saved.is_empty() {
        return Ok(false);
    }
    let current = window.cookies().map_err(|_| AuthError::Webview)?;
    let now = unix_seconds();
    let wanted = vault::cookies_to_restore(&saved, &current, now, replace);
    let mut restored = false;
    let mut failed = false;
    for cookie in &wanted {
        if window.set_cookie(cookie.clone()).is_ok() {
            restored = true;
        } else {
            failed = true;
        }
    }
    if failed {
        Err(AuthError::Webview)
    } else {
        Ok(restored)
    }
}

fn save_cookies(connection: &mut Connection, window: &WebviewWindow, now: i64) -> Option<i64> {
    let Ok(cookies) = window.cookies() else {
        auth::log("save", AuthError::Webview, []);
        return None;
    };
    let snapshot = vault::snapshot(&cookies, now);
    if snapshot.is_empty() {
        auth::log("save", AuthError::NoCookies, []);
        return None;
    }
    let expires = snapshot
        .iter()
        .map(CookieMetadata::from)
        .filter(|cookie| auth::is_auth_cookie(cookie.name))
        .filter_map(|cookie| cookie.expires)
        .min();
    let fingerprint = serde_json::to_vec(&snapshot)
        .ok()
        .map(|bytes| Sha256::digest(bytes).into());
    match fingerprint {
        Some(fingerprint) if connection.saved_fingerprint == Some(fingerprint) => {}
        Some(fingerprint) if vault::save(&snapshot) => {
            connection.saved_fingerprint = Some(fingerprint);
        }
        _ => auth::log("save", "credential_write_failed", []),
    }
    expires
}

async fn visit_site(window: &WebviewWindow) -> Result<(), AuthError> {
    let url = Url::parse(USAGE_PAGE).map_err(|_| AuthError::SiteLoad)?;
    let (loaded, mut wait) = channel(1);
    *SITE_LOADED.lock().unwrap_or_else(PoisonError::into_inner) = Some(loaded);
    let result = time::timeout(SITE_LOAD_TIMEOUT, async {
        window.navigate(url).map_err(|_| AuthError::SiteLoad)?;
        wait.recv().await.ok_or(AuthError::SiteLoad)?;
        loop {
            match browser_eval(window, SITE_PROBE).await.as_deref() {
                Ok("1") => return Ok(()),
                Ok("2") => return Err(AuthError::SiteLoad),
                _ => time::sleep(SITE_PROBE_INTERVAL).await,
            }
        }
    })
    .await
    .unwrap_or(Err(AuthError::SiteTimeout));
    if result.is_ok() {
        time::sleep(SITE_SETTLE).await;
    }
    let blank = Url::parse("about:blank")
        .map_err(|_| AuthError::Webview)
        .and_then(|url| window.navigate(url).map_err(|_| AuthError::Webview));
    SITE_LOADED
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .take();
    result.and(blank)
}

async fn read_usage(
    connection: &mut Connection,
    window: &WebviewWindow,
    force: bool,
    visited: bool,
) -> Result<WorkbuddyUsage, AuthError> {
    let url = Url::parse(SUMMARY_URL).map_err(|_| AuthError::InvalidResponse)?;
    let cookies = summary_cookies(window, &url)?;
    let cookie = summary_header(&cookies)?;
    if cookie.is_none() && !visited {
        return Err(AuthError::NoCookies);
    }
    let fingerprint = Sha256::digest(cookie.as_ref().map_or(&[][..], HeaderValue::as_bytes)).into();
    if let (Some(cache), Some(WorkbuddyState::Connected { usage })) =
        (&connection.cached, connection.last_state)
    {
        if !force && cache.fingerprint == fingerprint && cache.checked.elapsed() < REFRESH_INTERVAL
        {
            return Ok(usage);
        }
    }
    let user_agent = match &connection.user_agent {
        Some(user_agent) => user_agent,
        None => connection
            .user_agent
            .insert(browser_user_agent(window).await?),
    };
    let usage = workbuddy_usage::query(url, cookie, user_agent).await?;
    let now = Instant::now();
    connection.cached = Some(CachedUsage {
        fingerprint,
        checked: now,
    });
    connection.failures = FailedChecks::default();
    connection.retry_at = None;
    connection.restored_startup = true;
    let wall_now = unix_seconds();
    let expires = save_cookies(connection, window, wall_now);
    connection.renewal = Some(auth::renewal_schedule(
        connection.renewal,
        now,
        wall_now,
        expires,
        visited,
    ));
    Ok(usage)
}

fn record_failure(
    connection: &mut Connection,
    window: Option<&WebviewWindow>,
    error: AuthError,
) -> WorkbuddyState {
    connection.cached = None;
    let now = Instant::now();
    let (history, action) = auth::failure_action(connection.failures, error, now);
    connection.failures = history;
    let expired = matches!(action, FailureAction::ClearSaved);
    if should_log_failure(connection, error, expired) {
        let cookies = window
            .and_then(|window| window.cookies().ok())
            .unwrap_or_default();
        auth::log(
            if expired { "expired" } else { "read" },
            error,
            cookies
                .iter()
                .filter(|cookie| vault::workbuddy_cookie(cookie))
                .map(CookieMetadata::from),
        );
    }
    match action {
        FailureAction::RetryAfter(delay) => {
            connection.retry_at = Some(now + delay);
            WorkbuddyState::Unavailable {
                reason: (error == AuthError::CurlUnavailable).then_some("curlUnavailable"),
            }
        }
        FailureAction::ClearSaved => {
            connection.retry_at = None;
            connection.renewal = None;
            if connection.login.take().is_some() {
                let _ = vault::clear_login();
            } else {
                let _ = vault::clear();
                connection.saved_fingerprint = None;
            }
            WorkbuddyState::LoginRequired
        }
    }
}

pub(super) async fn refresh_and_publish(
    app: &AppHandle,
    connection: &mut Connection,
    force: bool,
) -> WorkbuddyState {
    let previous = connection.last_state;
    if previous == Some(WorkbuddyState::LoginRequired) {
        return WorkbuddyState::LoginRequired;
    }
    if !force && connection.retry_at.is_some_and(|at| at > Instant::now()) {
        return previous.unwrap_or(WorkbuddyState::UNAVAILABLE);
    }
    let state = match super::workbuddy_official_flow::read_usage_official(connection, force).await {
        Some(Ok(usage)) => WorkbuddyState::Connected { usage },
        Some(Err(error)) => record_failure(connection, None, error),
        None => match login_window(app) {
            Ok(window) => match refresh(connection, &window, force).await {
                Ok(usage) => {
                    connection.finish_login = false;
                    WorkbuddyState::Connected { usage }
                }
                Err(error) => record_failure(connection, Some(&window), error),
            },
            Err(_) => record_failure(connection, None, AuthError::Webview),
        },
    };
    if matches!(state, WorkbuddyState::Connected { .. }) {
        connection.failure_diagnostic = None;
    }
    connection.last_state = Some(state);
    if force || previous != Some(state) {
        publish(app, state);
    }
    state
}

fn maintenance_at(
    app: &AppHandle,
    connection: &Connection,
    startup_at: Instant,
) -> Option<Instant> {
    if connection.signing_in
        || connection.finish_login
        || connection.last_state == Some(WorkbuddyState::LoginRequired)
        || !marker_path(app).is_ok_and(|path| path.is_file())
    {
        return None;
    }
    Some(refresh_deadline(connection, startup_at))
}

fn refresh_deadline(connection: &Connection, startup_at: Instant) -> Instant {
    connection
        .retry_at
        .or(connection.renewal.map(|renewal| renewal.at))
        .or(connection
            .cached
            .as_ref()
            .map(|cache| cache.checked + REFRESH_INTERVAL))
        .unwrap_or(startup_at)
}

pub(crate) fn init(app: &AppHandle) {
    let app = app.clone();
    let startup_at = Instant::now() + STARTUP_DELAY;
    tauri::async_runtime::spawn(async move {
        loop {
            let next = {
                let mut connection = connection().lock().await;
                if maintenance_at(&app, &connection, startup_at)
                    .is_some_and(|at| at <= Instant::now())
                {
                    refresh_and_publish(&app, &mut connection, true).await;
                }
                maintenance_at(&app, &connection, startup_at)
            };
            if let Some(at) = next {
                let _ = time::timeout(
                    at.saturating_duration_since(Instant::now()),
                    SCHEDULE_CHANGED.notified(),
                )
                .await;
            } else {
                SCHEDULE_CHANGED.notified().await;
            }
        }
    });
}

async fn check_login(
    app: &AppHandle,
    window: &WebviewWindow,
    connection: &mut Connection,
    force: bool,
) -> WorkbuddyState {
    // A usage page can finish loading before the signed-out redirect.
    let state = match read_usage(connection, window, force, false).await {
        Ok(usage) if marker_path(app).is_ok_and(|path| fs::write(path, b"1").is_ok()) => {
            connection.failure_diagnostic = None;
            connection.signing_in = false;
            connection.finish_login = false;
            let _ = window.hide();
            WorkbuddyState::Connected { usage }
        }
        Err(error) if error.server_rejected() || error == AuthError::NoCookies => {
            connection.finish_login = false;
            let state = if connection.last_state == Some(WorkbuddyState::LoginRequired) {
                WorkbuddyState::LoginRequired
            } else if marker_path(app).is_ok_and(|path| path.is_file()) {
                WorkbuddyState::Ready
            } else {
                WorkbuddyState::SignedOut
            };
            if !force {
                return state;
            }
            state
        }
        _ => {
            connection.finish_login = true;
            WorkbuddyState::UNAVAILABLE
        }
    };
    connection.last_state = Some(state);
    publish(app, state);
    SCHEDULE_CHANGED.notify_one();
    state
}

#[tauri::command]
pub async fn get_workbuddy_usage(
    app: AppHandle,
    refresh_now: Option<bool>,
    cached_only: Option<bool>,
) -> Result<WorkbuddyState, String> {
    let mut connection = connection().lock().await;
    let remembered = marker_path(&app)?.is_file() || connection.login.is_some();
    let force = refresh_now.unwrap_or(false);
    if force
        && connection.official_login_state.is_none()
        && (connection.signing_in || connection.finish_login)
    {
        let window = login_window(&app)?;
        return Ok(check_login(&app, &window, &mut connection, true).await);
    }
    if !remembered {
        return Ok(if connection.finish_login {
            WorkbuddyState::UNAVAILABLE
        } else {
            WorkbuddyState::SignedOut
        });
    }
    if cached_only.unwrap_or(false) || connection.signing_in {
        return Ok(connection.last_state.unwrap_or(WorkbuddyState::Ready));
    }
    let state = refresh_and_publish(&app, &mut connection, force).await;
    SCHEDULE_CHANGED.notify_one();
    Ok(state)
}

#[tauri::command]
pub async fn disconnect_workbuddy(app: AppHandle) -> Result<(), String> {
    let mut connection = connection().lock().await;
    isolated_profile_path(&app)?;
    let marker = marker_path(&app)?;
    let window = if marker.is_file() || app.get_webview_window(WINDOW_LABEL).is_some() {
        Some(login_window(&app)?)
    } else {
        None
    };
    connection.signing_in = false;
    cancel_official_login(&mut connection);
    connection.finish_login = false;
    connection.cached = None;
    connection.last_state = None;
    if let Some(window) = window {
        window.hide().map_err(|e| e.to_string())?;
        let blank = Url::parse("about:blank").map_err(|e| e.to_string())?;
        window.navigate(blank).map_err(|e| e.to_string())?;
        // This webview has its own user data directory. Clearing its profile cannot clear island settings.
        for cookie in window.cookies().map_err(|e| e.to_string())? {
            window.delete_cookie(cookie).map_err(|e| e.to_string())?;
        }
        if !window.cookies().map_err(|e| e.to_string())?.is_empty() {
            return Err("WorkBuddy sign-in could not be cleared.".into());
        }
        window
            .clear_all_browsing_data()
            .map_err(|e| e.to_string())?;
    }
    let _ = vault::clear();
    let _ = vault::clear_login();
    connection.login = None;
    connection.official_login_state = None;
    if let Err(error) = fs::remove_file(marker) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(error.to_string());
        }
    }
    *connection = Connection::default();
    SCHEDULE_CHANGED.notify_one();
    publish(&app, WorkbuddyState::SignedOut);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_successful_read_anchors_the_next_check_and_a_retry_overrides_it() {
        let now = Instant::now();
        let startup = now - Duration::from_secs(30);
        let mut connection = Connection::default();
        assert_eq!(refresh_deadline(&connection, startup), startup);
        connection.cached = Some(CachedUsage {
            fingerprint: [0; 32],
            checked: now,
        });
        assert_eq!(
            refresh_deadline(&connection, startup),
            now + REFRESH_INTERVAL
        );
        connection.retry_at = Some(now + Duration::from_secs(60));
        assert_eq!(
            refresh_deadline(&connection, startup),
            now + Duration::from_secs(60)
        );
    }

    #[test]
    fn repeated_rejections_only_log_when_the_reason_or_expiry_changes() {
        let mut connection = Connection::default();
        assert!(should_log_failure(
            &mut connection,
            AuthError::Unauthorized,
            false
        ));
        assert!(!should_log_failure(
            &mut connection,
            AuthError::Unauthorized,
            false
        ));
        assert!(should_log_failure(
            &mut connection,
            AuthError::Unauthorized,
            true
        ));
        assert!(should_log_failure(
            &mut connection,
            AuthError::Network,
            false
        ));
    }

    #[test]
    fn only_the_workbuddy_site_can_complete_login() {
        for url in [
            USAGE_PAGE,
            "https://www.workbuddy.cn/profile/plans-usage/?from=login",
        ] {
            assert!(on_usage_page(&Url::parse(url).unwrap()));
        }
        for url in [
            "http://www.workbuddy.cn/profile/plans-usage",
            "https://www.workbuddy.cn.evil.test/profile/plans-usage",
            "https://www.workbuddy.cn/login/",
            "https://open.weixin.qq.com/profile/plans-usage",
        ] {
            assert!(!on_usage_page(&Url::parse(url).unwrap()));
        }
        assert!(login_navigation(
            &Url::parse("https://open.weixin.qq.com/connect/qrconnect").unwrap()
        ));
        assert!(!login_navigation(
            &Url::parse("https://open.weixin.qq.com.evil.test/").unwrap()
        ));
    }
}
