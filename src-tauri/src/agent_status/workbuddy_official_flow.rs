//! Official WorkBuddy login orchestration: drives the state/polling sign-in and the official
//! billing read on top of `workbuddy_official` (wire protocol) and `workbuddy_connection`
//! (shared state). Split out so `workbuddy_connection` stays within the per-file line limit.

use std::fs;
use std::time::{Duration, Instant};

use reqwest::Url;
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use super::workbuddy_auth::{self as auth, AuthError, FailedChecks};
use super::workbuddy_connection::{
    connection, login_window, marker_path, official_login_url, publish, record_failure,
    CachedUsage, Connection, WorkbuddyState, REFRESH_INTERVAL, SCHEDULE_CHANGED,
};
use super::workbuddy_cookie_vault as vault;
use super::workbuddy_official as official;
use super::workbuddy_official::SavedLogin;
use super::workbuddy_usage::{WorkbuddyUsage, USAGE_PAGE};

/// Try the official Bearer channel first. Returns `Ok` on success, `Err(Some(error))` when the
/// official channel was configured but failed, or `Err(None)` when there is no official login so
/// the caller can fall back to the website-cookie channel.
pub(super) async fn read_usage_official(
    connection: &mut Connection,
    force: bool,
) -> Result<WorkbuddyUsage, Option<AuthError>> {
    if connection.login.is_none() {
        // Our own sign-in credential. The billing 403 was a TLS-fingerprint problem, not a token
        // problem, so this works once the request goes through curl. No third-party dependency.
        connection.login = vault::load_login();
        if connection.login.is_some() {
            auth::log("usage", "source=vault_login", []);
        }
    }
    let mut login = match connection.login.clone() {
        Some(login) => login,
        None => return Err(None),
    };
    let fingerprint = official_fingerprint(&login.credential.access_token);

    // Serve a recent snapshot from cache to avoid hammering the billing endpoint on every poll.
    if !force {
        if let (Some(cache), Some(WorkbuddyState::Connected { usage })) =
            (&connection.cached, connection.last_state)
        {
            if cache.fingerprint == fingerprint && cache.checked.elapsed() < REFRESH_INTERVAL {
                return Ok(usage);
            }
        }
    }

    match official::query_usage(&login.credential, &login.identity)
        .await
        .inspect_err(|error| auth::log("usage", format_args!("error={:?}", error), []))
    {
        Ok(usage) => {
            let now = Instant::now();
            connection.cached = Some(CachedUsage {
                fingerprint: official_fingerprint(&login.credential.access_token),
                checked: now,
            });
            connection.failures = FailedChecks::default();
            connection.retry_at = None;
            connection.restored_startup = true;
            return Ok(usage);
        }
        Err(official::ProtocolError::LoginRequired) => {
            // One refresh attempt, then persist the rotated credential.
            match official::refresh(&login.credential, &login.identity).await {
                Ok(credential) => {
                    login.credential = credential;
                    match official::query_usage(&login.credential, &login.identity).await {
                        Ok(usage) => {
                            let fingerprint = official_fingerprint(&login.credential.access_token);
                            if vault::save_login(&login) {
                                connection.login = Some(login);
                            }
                            let now = Instant::now();
                            connection.cached = Some(CachedUsage {
                                fingerprint,
                                checked: now,
                            });
                            connection.failures = FailedChecks::default();
                            connection.retry_at = None;
                            return Ok(usage);
                        }
                        Err(error) => return Err(Some(map_official_error(error))),
                    }
                }
                Err(error) => return Err(Some(map_official_error(error))),
            }
        }
        Err(error) => return Err(Some(map_official_error(error))),
    }
}

fn official_fingerprint(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}

fn map_official_error(error: official::ProtocolError) -> AuthError {
    use official::ProtocolError as P;
    match error {
        P::LoginRequired => AuthError::NotLoggedIn,
        P::RateLimited => AuthError::HttpStatus(429),
        P::Timeout => AuthError::Timeout,
        P::Network => AuthError::Network,
        _ => AuthError::InvalidResponse,
    }
}

/// Poll the official state protocol after the user completes login in the window, then persist
/// the credential and publish a connected state with a fresh usage read.
pub(super) async fn finish_official_login(app: AppHandle, state: String) {
    // Bound the whole login so an abandoned sign-in window cannot leave a task polling forever.
    // Login success and the first usage read are handled separately: a successful sign-in must be
    // persisted even if the billing read fails, otherwise the user is thrown back to "sign in"
    // despite having just logged in (the website showed success but the island showed "unavailable").
    let login_result = async {
        let credential = tokio::time::timeout(
            Duration::from_secs(180),
            official::poll_token(&state),
        )
        .await
        .map_err(|_| AuthError::Timeout)?
        .map_err(map_official_error)?;
        auth::log("login", "token_ok", []);
        let identity = tokio::time::timeout(
            Duration::from_secs(180),
            official::poll_account(&state, &credential),
        )
        .await
        .map_err(|_| AuthError::Timeout)?
        .map_err(map_official_error)?;
        auth::log("login", "account_ok", []);
        Ok::<SavedLogin, AuthError>(SavedLogin { credential, identity })
    }
    .await;

    let login = match login_result {
        Ok(login) => login,
        Err(error) => {
            auth::log("login", format_args!("failed={error}"), []);
            let mut connection = connection().lock().await;
            connection.signing_in = false;
            connection.official_login_state = None;
            let _ = record_failure(&mut connection, None, error);
            SCHEDULE_CHANGED.notify_one();
            return;
        }
    };

    // Persist the credential and mark connected immediately — the account is signed in now.
    {
        let mut connection = connection().lock().await;
        let _ = vault::save_login(&login);
        connection.login = Some(login.clone());
        connection.official_login_state = None;
        connection.cached = None;
        connection.failures = FailedChecks::default();
        connection.retry_at = None;
        connection.signing_in = false;
        connection.finish_login = false;
        connection.restored_startup = true;
        if let Ok(marker) = marker_path(&app) {
            let _ = fs::write(marker, b"1");
        }
    }

    // Fetch usage on its own. A failure here is a quota-read problem, not a sign-in problem, so it
    // must not clear the freshly saved credential; report it as Unavailable and let the periodic
    // refresh try again.
    let mut login = login;
    // The freshly issued access token can be rejected once; refresh then re-query before giving up.
    let usage_result = match official::query_usage(&login.credential, &login.identity).await {
        Ok(usage) => Ok(usage),
        Err(official::ProtocolError::LoginRequired) => {
            auth::log("login", "usage_401_refreshing", []);
            match official::refresh(&login.credential, &login.identity).await {
                Ok(credential) => {
                    login.credential = credential;
                    let _ = vault::save_login(&login);
                    official::query_usage(&login.credential, &login.identity).await
                }
                Err(error) => Err(error),
            }
        }
        Err(error) => Err(error),
    };

    {
        let mut connection = connection().lock().await;
        connection.login = Some(login.clone());
    }
    match usage_result {
        Ok(usage) => {
            auth::log("login", "usage_ok", []);
            let mut connection = connection().lock().await;
            connection.cached = Some(CachedUsage {
                fingerprint: official_fingerprint(&login.credential.access_token),
                checked: Instant::now(),
            });
            connection.last_state = Some(WorkbuddyState::Connected { usage });
            publish(&app, WorkbuddyState::Connected { usage });
        }
        Err(error) => {
            auth::log("login", format_args!("usage_failed={:?}", error), []);
            let mut connection = connection().lock().await;
            let state = record_failure(&mut connection, None, map_official_error(error));
            connection.last_state = Some(state);
            publish(&app, state);
        }
    }
    SCHEDULE_CHANGED.notify_one();
}

#[tauri::command]
pub async fn open_workbuddy_login(app: AppHandle) -> Result<(), String> {
    auth::log("login", "open_clicked", []);
    let mut connection = connection().lock().await;
    let window = login_window(&app)?;
    if connection.signing_in {
        auth::log("login", "already_signing_in_reshow", []);
    }
    if !connection.signing_in {
        connection.cached = None;
        connection.finish_login = false;
        connection.failures = FailedChecks::default();
        connection.retry_at = None;
        connection.signing_in = true;

        // Preferred path: official state/polling login. Open the authorization page in the window;
        // the user signs in there while a background task polls for the Bearer credential.
        match official::request_login().await {
            Ok((state, auth_url)) => {
                auth::log("login", "state_ok", []);
                match Url::parse(&auth_url) {
                    Ok(url) if official_login_url(&url) => {
                        if let Err(error) = window.navigate(url) {
                            connection.signing_in = false;
                            return Err(error.to_string());
                        }
                        connection.official_login_state = Some(state.clone());
                        let app_for_task = app.clone();
                        tauri::async_runtime::spawn(async move {
                            finish_official_login(app_for_task, state).await;
                        });
                    }
                    _ => {
                        connection.signing_in = false;
                        return Err("WorkBuddy returned an invalid login URL.".to_string());
                    }
                }
            }
            Err(error) => {
                // Official protocol unreachable: fall back to the website-cookie login.
                auth::log("login", format_args!("state_failed={:?}_fallback_to_cookie", error), []);
                let url = Url::parse(USAGE_PAGE).map_err(|e| e.to_string())?;
                if let Err(error) = window.navigate(url) {
                    connection.signing_in = false;
                    return Err(error.to_string());
                }
            }
        }
    }
    if let Err(error) = window.show() {
        connection.signing_in = false;
        connection.official_login_state = None;
        SCHEDULE_CHANGED.notify_one();
        return Err(error.to_string());
    }
    SCHEDULE_CHANGED.notify_one();
    crate::system::window_focus::focus_window(&window)
}
