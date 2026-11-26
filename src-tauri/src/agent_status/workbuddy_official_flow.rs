use std::{
    fs,
    time::{Duration, Instant},
};

use reqwest::Url;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use super::workbuddy_auth::{self as auth, AuthError, FailedChecks};
use super::workbuddy_connection::{
    connection, login_window, marker_path, official_login_url, publish, refresh_and_publish,
    CachedUsage, Connection, WorkbuddyState, REFRESH_INTERVAL, SCHEDULE_CHANGED, WINDOW_LABEL,
};
use super::workbuddy_cookie_vault as vault;
use super::workbuddy_official::{self as official, SavedLogin};
use super::workbuddy_usage::{WorkbuddyUsage, USAGE_PAGE};

pub(super) async fn read_usage_official(
    connection: &mut Connection,
    force: bool,
) -> Option<Result<WorkbuddyUsage, AuthError>> {
    if connection.login.is_none() {
        connection.login = vault::load_login();
    }
    let mut login = connection.login.clone()?;
    let fingerprint: [u8; 32] = Sha256::digest(login.credential.access_token.as_bytes()).into();
    if !force {
        if let (Some(cache), Some(WorkbuddyState::Connected { usage })) =
            (&connection.cached, connection.last_state)
        {
            if cache.fingerprint == fingerprint && cache.checked.elapsed() < REFRESH_INTERVAL {
                return Some(Ok(usage));
            }
        }
    }
    let mut result = official::query_usage(&login.credential, &login.identity).await;
    if result == Err(official::ProtocolError::LoginRequired) {
        match official::refresh(&login.credential, &login.identity).await {
            Ok(credential) => {
                login.credential = credential;
                if !vault::save_login(&login) {
                    auth::log("save", "oauth_credential_write_failed", []);
                }
                connection.login = Some(login.clone());
                result = official::query_usage(&login.credential, &login.identity).await;
            }
            Err(error) => result = Err(error),
        }
    }
    Some(
        result
            .inspect(|_| {
                connection.cached = Some(CachedUsage {
                    fingerprint: Sha256::digest(login.credential.access_token.as_bytes()).into(),
                    checked: Instant::now(),
                });
                connection.failures = FailedChecks::default();
                connection.retry_at = None;
                connection.renewal = None;
                connection.restored_startup = true;
            })
            .map_err(map_official_error),
    )
}

fn map_official_error(error: official::ProtocolError) -> AuthError {
    use official::ProtocolError as Protocol;
    match error {
        Protocol::LoginRequired => AuthError::NotLoggedIn,
        Protocol::RateLimited => AuthError::HttpStatus(429),
        Protocol::Timeout => AuthError::Timeout,
        Protocol::Network => AuthError::Network,
        Protocol::CurlUnavailable => AuthError::CurlUnavailable,
        _ => AuthError::InvalidResponse,
    }
}

async fn finish_official_login(app: AppHandle, state: String) {
    let login = tokio::time::timeout(Duration::from_secs(180), async {
        let credential = official::poll_token(&state).await?;
        let identity = official::poll_account(&state, &credential).await?;
        Ok::<_, official::ProtocolError>(SavedLogin {
            credential,
            identity,
        })
    })
    .await;
    let mut connection = connection().lock().await;
    if connection.official_login_state.as_deref() != Some(state.as_str()) {
        return;
    }
    connection.official_login_state = None;
    connection.official_login_task = None;
    connection.signing_in = false;
    connection.finish_login = false;
    match login {
        Ok(Ok(login)) => {
            if !vault::save_login(&login) {
                auth::log("save", "oauth_credential_write_failed", []);
            }
            connection.login = Some(login);
            connection.last_state = Some(WorkbuddyState::Ready);
            if let Ok(marker) = marker_path(&app) {
                let _ = fs::write(marker, b"1");
            }
            if let Some(window) = app.get_webview_window(WINDOW_LABEL) {
                let _ = window.hide();
            }
            refresh_and_publish(&app, &mut connection, true).await;
        }
        failure => {
            let reason = match failure {
                Ok(Err(error)) => map_official_error(error),
                _ => AuthError::Timeout,
            };
            auth::log("login", reason, []);
            let remembered = marker_path(&app).is_ok_and(|marker| marker.is_file());
            let state = if remembered {
                WorkbuddyState::LoginRequired
            } else {
                WorkbuddyState::SignedOut
            };
            connection.last_state = Some(state);
            publish(&app, state);
        }
    }
    SCHEDULE_CHANGED.notify_one();
}

#[tauri::command]
pub async fn open_workbuddy_login(app: AppHandle) -> Result<(), String> {
    let mut connection = connection().lock().await;
    let window = login_window(&app)?;
    if connection.signing_in {
        window.show().map_err(|error| error.to_string())?;
        return crate::system::window_focus::focus_window(&window);
    }
    let official = match official::request_login().await {
        Ok((state, address)) => Url::parse(&address)
            .ok()
            .filter(official_login_url)
            .map(|url| (state, url)),
        Err(error) => {
            auth::log("login", map_official_error(error), []);
            None
        }
    };
    let url = match &official {
        Some((_, url)) => url.clone(),
        None => Url::parse(USAGE_PAGE).map_err(|error| error.to_string())?,
    };
    window.navigate(url).map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    connection.cached = None;
    connection.finish_login = false;
    connection.failures = FailedChecks::default();
    connection.retry_at = None;
    connection.signing_in = true;
    if let Some((state, _)) = official {
        connection.official_login_state = Some(state.clone());
        let sign_in_app = app.clone();
        connection.official_login_task = Some(tauri::async_runtime::spawn(finish_official_login(
            sign_in_app,
            state,
        )));
    }
    SCHEDULE_CHANGED.notify_one();
    crate::system::window_focus::focus_window(&window)
}
