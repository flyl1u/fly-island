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
    webview::{NewWindowResponse, PageLoadEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

use super::workbuddy_cookie_vault as vault;
use super::workbuddy_usage::{self, ReadError, WorkbuddyUsage, SUMMARY_URL, USAGE_PAGE};

const WINDOW_LABEL: &str = "workbuddy-sign-in";
const USAGE_CHANGED: &str = "workbuddy-usage-changed";
const REFRESH_INTERVAL: Duration = Duration::from_secs(300);
const FAILURE_RETRY: Duration = Duration::from_secs(30);
const WORKBUDDY_HOST: &str = "www.workbuddy.cn";
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
/// How long a silent visit to the site may take to load and let its own script renew the sign-in.
const SITE_LOAD_TIMEOUT: Duration = Duration::from_secs(12);
const SITE_SETTLE: Duration = Duration::from_secs(2);
/// Told when the hidden sign-in window finishes loading a WorkBuddy page.
static SITE_LOADED: StdMutex<Option<Sender<bool>>> = StdMutex::new(None);

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(crate) enum WorkbuddyState {
    SignedOut,
    LoginRequired,
    Ready,
    Connected { usage: WorkbuddyUsage },
    Unavailable,
}

struct CachedUsage {
    fingerprint: [u8; 32],
    checked: Instant,
}

#[derive(Default)]
struct Connection {
    cached: Option<CachedUsage>,
    last_state: Option<WorkbuddyState>,
    user_agent: Option<String>,
    signing_in: bool,
    finish_login: bool,
    /// The saved copy and a silent site visit were already tried since the last good read.
    recovery_tried: bool,
    /// The cookie set last written to the Credential Manager, so an unchanged one is not rewritten.
    saved_fingerprint: Option<[u8; 32]>,
}

fn connection() -> &'static Mutex<Connection> {
    static CONNECTION: OnceLock<Mutex<Connection>> = OnceLock::new();
    CONNECTION.get_or_init(|| Mutex::new(Connection::default()))
}

fn profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("workbuddy-web"))
        .map_err(|e| e.to_string())
}

fn marker_path(app: &AppHandle) -> Result<PathBuf, String> {
    profile_path(app).map(|path| path.join("connected"))
}

fn publish(app: &AppHandle, state: WorkbuddyState) {
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

fn login_navigation(url: &Url) -> bool {
    workbuddy_url(url)
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

fn login_window(app: &AppHandle) -> Result<WebviewWindow, String> {
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
    .devtools(false)
    .data_directory(data_directory)
    .on_navigation(|url| url.as_str() == "about:blank" || login_navigation(url))
    .on_new_window(|url, _| {
        // Help and policy links can open separately. The login page's QR and callbacks live in this profile.
        if matches!(url.host_str(), Some("rule.tencent.com" | "privacy.qq.com"))
            && url.scheme() == "https"
        {
            let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
        }
        NewWindowResponse::Deny
    })
    .on_page_load(|window, event| {
        if event.event() == PageLoadEvent::Finished && workbuddy_url(event.url()) {
            if let Some(loaded) = SITE_LOADED.lock().unwrap_or_else(PoisonError::into_inner).take() {
                let _ = loaded.try_send(true);
            }
        }
        if event.event() != PageLoadEvent::Finished || !on_usage_page(event.url()) {
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
                if connection.signing_in {
                    if window.url().is_ok_and(|url| on_usage_page(&url)) {
                        check_login(&app, &window, &mut connection, true).await;
                    }
                    connection.signing_in = false;
                }
                let _ = window.hide();
            });
        }
    });
    Ok(window)
}

async fn browser_user_agent(window: &WebviewWindow) -> Result<String, ReadError> {
    let (send, mut receive) = channel(1);
    window
        .eval_with_callback("navigator.userAgent", move |result| {
            let _ = send.try_send(result);
        })
        .map_err(|_| ReadError::Unavailable)?;
    let result = receive.recv().await.ok_or(ReadError::Unavailable)?;
    let value: String = serde_json::from_str(&result).map_err(|_| ReadError::Unavailable)?;
    if value.is_empty() || value.len() > 512 || HeaderValue::from_str(&value).is_err() {
        return Err(ReadError::Unavailable);
    }
    Ok(value)
}

fn summary_cookies(window: &WebviewWindow, url: &Url) -> Result<HeaderValue, ReadError> {
    let mut cookies = window
        .cookies_for_url(url.clone())
        .map_err(|_| ReadError::Unavailable)?;
    let now = super::snapshot::current_unix_millis() / 1_000;
    cookies.retain(|cookie| {
        cookie
            .expires_datetime()
            .is_none_or(|expires| expires.unix_timestamp() > now)
    });
    if cookies.is_empty() {
        return Err(ReadError::LoginRequired);
    }
    cookies.sort_by(|a, b| {
        b.path()
            .map_or(0, str::len)
            .cmp(&a.path().map_or(0, str::len))
            .then_with(|| a.name().cmp(b.name()))
    });
    let header = cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");
    HeaderValue::from_str(&header).map_err(|_| ReadError::Unavailable)
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
) -> WorkbuddyState {
    let mut state = read_usage(connection, window, force).await;
    // A remembered sign-in that comes back without cookies: put back the saved copy, then let
    // the site's own script renew an expired token, before asking the user to sign in again.
    // Not while signing in, where the usage page can load before the login redirect.
    if state == WorkbuddyState::LoginRequired && !connection.signing_in && !connection.recovery_tried {
        connection.recovery_tried = true;
        if restore_saved(window) {
            state = read_usage(connection, window, true).await;
        }
        if state == WorkbuddyState::LoginRequired && visit_site(window).await {
            state = read_usage(connection, window, true).await;
        }
        if state == WorkbuddyState::LoginRequired {
            vault::clear();
            connection.saved_fingerprint = None;
        }
    }
    if let WorkbuddyState::Connected { .. } = state {
        connection.recovery_tried = false;
        save_cookies(connection, window);
    }
    connection.last_state = Some(state);
    state
}

fn restore_saved(window: &WebviewWindow) -> bool {
    let Some(saved) = vault::load() else { return false; };
    let now = super::snapshot::current_unix_millis() / 1_000;
    let mut restored = false;
    for cookie in saved.iter().filter_map(|saved| vault::to_cookie(saved, now)) {
        restored |= window.set_cookie(cookie).is_ok();
    }
    restored
}

fn save_cookies(connection: &mut Connection, window: &WebviewWindow) {
    let Ok(url) = Url::parse(SUMMARY_URL) else { return; };
    let Ok(cookies) = window.cookies_for_url(url) else { return; };
    let snapshot = vault::snapshot(&cookies, super::snapshot::current_unix_millis() / 1_000);
    let Ok(bytes) = serde_json::to_vec(&snapshot) else { return; };
    let fingerprint: [u8; 32] = Sha256::digest(&bytes).into();
    if connection.saved_fingerprint == Some(fingerprint) { return; }
    if vault::save(&snapshot) { connection.saved_fingerprint = Some(fingerprint); }
}

async fn sleep(duration: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(duration)).await;
}

/// Loads the usage page in the hidden window, as a browser would on reopening, so the site can
/// renew its own short-lived token; then returns the window to a blank page.
async fn visit_site(window: &WebviewWindow) -> bool {
    let Ok(url) = Url::parse(USAGE_PAGE) else { return false; };
    let (loaded, mut wait) = channel(2);
    *SITE_LOADED.lock().unwrap_or_else(PoisonError::into_inner) = Some(loaded.clone());
    if window.navigate(url).is_err() {
        SITE_LOADED.lock().unwrap_or_else(PoisonError::into_inner).take();
        return false;
    }
    tauri::async_runtime::spawn(async move {
        sleep(SITE_LOAD_TIMEOUT).await;
        let _ = loaded.try_send(false);
    });
    let finished = wait.recv().await.unwrap_or(false);
    SITE_LOADED.lock().unwrap_or_else(PoisonError::into_inner).take();
    if finished {
        sleep(SITE_SETTLE).await;
    }
    if let Ok(blank) = Url::parse("about:blank") {
        let _ = window.navigate(blank);
    }
    finished
}

async fn read_usage(
    connection: &mut Connection,
    window: &WebviewWindow,
    force: bool,
) -> WorkbuddyState {
    let Ok(url) = Url::parse(SUMMARY_URL) else {
        return WorkbuddyState::Unavailable;
    };
    let cookie = match summary_cookies(window, &url) {
        Ok(cookie) => cookie,
        Err(error) => {
            connection.cached = None;
            return error_state(error);
        }
    };
    let fingerprint = Sha256::digest(cookie.as_bytes()).into();
    if let (Some(cache), Some(state)) = (&connection.cached, connection.last_state) {
        let interval = match state {
            WorkbuddyState::Unavailable => FAILURE_RETRY,
            _ => REFRESH_INTERVAL,
        };
        if !force && cache.fingerprint == fingerprint && cache.checked.elapsed() < interval {
            return state;
        }
    }
    let user_agent = match &connection.user_agent {
        Some(user_agent) => user_agent,
        None => match browser_user_agent(window).await {
            Ok(user_agent) => connection.user_agent.insert(user_agent),
            Err(error) => return error_state(error),
        },
    };
    let state = match workbuddy_usage::query(url, cookie, user_agent).await {
        Ok(usage) => WorkbuddyState::Connected { usage },
        Err(error) => error_state(error),
    };
    connection.cached = Some(CachedUsage {
        fingerprint,
        checked: Instant::now(),
    });
    state
}

async fn check_login(
    app: &AppHandle,
    window: &WebviewWindow,
    connection: &mut Connection,
    force: bool,
) {
    // The usage page can load before the signed-out redirect, including during an earlier login.
    // The account is connected only after the billing endpoint accepts the browser session.
    let state = refresh(connection, window, force).await;
    match state {
        WorkbuddyState::Connected { .. } => {
            if marker_path(app)
                .and_then(|path| fs::write(path, b"1").map_err(|e| e.to_string()))
                .is_ok()
            {
                connection.signing_in = false;
                connection.finish_login = false;
                let _ = window.hide();
                publish(app, state);
            } else {
                connection.finish_login = true;
                publish(app, WorkbuddyState::Unavailable);
            }
        }
        WorkbuddyState::Unavailable => {
            connection.finish_login = true;
            publish(app, state);
        }
        WorkbuddyState::LoginRequired => {
            connection.finish_login = false;
            if force || marker_path(app).is_ok_and(|path| path.is_file()) {
                publish(app, state);
            }
        }
        _ => {}
    }
}

fn error_state(error: ReadError) -> WorkbuddyState {
    match error {
        ReadError::LoginRequired => WorkbuddyState::LoginRequired,
        ReadError::Unavailable => WorkbuddyState::Unavailable,
    }
}

#[tauri::command]
pub async fn get_workbuddy_usage(
    app: AppHandle,
    refresh_now: Option<bool>,
    cached_only: Option<bool>,
) -> Result<WorkbuddyState, String> {
    let mut connection = connection().lock().await;
    let remembered = marker_path(&app)?.is_file();
    let force = refresh_now.unwrap_or(false);
    if connection.signing_in && !force {
        return Ok(if remembered {
            WorkbuddyState::LoginRequired
        } else {
            WorkbuddyState::SignedOut
        });
    }
    if connection.finish_login && force {
        let window = login_window(&app)?;
        check_login(&app, &window, &mut connection, true).await;
        if connection.finish_login {
            return Ok(WorkbuddyState::Unavailable);
        }
        return Ok(connection
            .last_state
            .unwrap_or(WorkbuddyState::LoginRequired));
    }
    if !remembered {
        if connection.finish_login {
            return Ok(WorkbuddyState::Unavailable);
        }
        return Ok(WorkbuddyState::SignedOut);
    }
    if cached_only.unwrap_or(false) {
        return Ok(connection.last_state.unwrap_or(WorkbuddyState::Ready));
    }
    let window = login_window(&app)?;
    let previous = connection.last_state;
    let state = refresh(&mut connection, &window, force).await;
    if force || previous != Some(state) {
        publish(&app, state);
    }
    Ok(state)
}

#[tauri::command]
pub async fn open_workbuddy_login(app: AppHandle) -> Result<(), String> {
    let mut connection = connection().lock().await;
    let window = login_window(&app)?;
    if !connection.signing_in {
        connection.cached = None;
        connection.last_state = None;
        connection.finish_login = false;
        connection.signing_in = true;
        let url = Url::parse(USAGE_PAGE).map_err(|e| e.to_string())?;
        if let Err(error) = window.navigate(url) {
            connection.signing_in = false;
            return Err(error.to_string());
        }
    }
    window.show().map_err(|e| e.to_string())?;
    crate::system::window_focus::focus_window(&window)
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
    vault::clear();
    if let Err(error) = fs::remove_file(marker) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(error.to_string());
        }
    }
    *connection = Connection::default();
    publish(&app, WorkbuddyState::SignedOut);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
