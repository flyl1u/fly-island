//! Official WorkBuddy plugin protocol: app-owned login and personal credit billing.
//!
//! Mirrors token-monitor's verified contract (`src/shared/providers/workbuddy/{oauth,limits}.js`):
//! a state/polling login yields a Bearer credential, which then posts to the Tencent billing
//! endpoint. Kept transport- and storage-free so the wire contract stays unit-testable.

use reqwest::{header, redirect::Policy, Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

/// CN realm only for this first cut (personal accounts).
const AUTH_ORIGIN: &str = "https://www.codebuddy.cn";
const PLATFORM: &str = "workbuddy";
const BILLING_ORIGIN: &str = "https://copilot.tencent.com";
const PERSONAL_PATH: &str = "/v2/billing/meter/get-user-resource";
const PRODUCT_CODE: &str = "p_tcaca";
/// 101 years, matching token-monitor's personal billing range.
const PERSONAL_RANGE_MS: i64 = 101 * 365 * 24 * 60 * 60 * 1000;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_RESPONSE_BYTES: usize = 512 * 1024;
const CODE_PENDING_TOKEN: i64 = 11217;
const CODE_PENDING_ACCOUNT: i64 = 12151;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Credential {
    pub access_token: String,
    pub refresh_token: String,
    pub domain: String,
    /// Absolute unix millis; 0 when the server omits an expiry.
    pub expires_at: i64,
    pub refresh_expires_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Identity {
    pub user_id: String,
    pub enterprise_id: String,
    pub realm: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(super) struct SavedLogin {
    pub credential: Credential,
    pub identity: Identity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ProtocolError {
    LoginRequired,
    RateLimited,
    Network,
    Timeout,
    Rejected,
    InvalidResponse,
}


fn is_success(code: Option<i64>) -> bool {
    matches!(code, Some(0) | Some(200))
}

fn text(value: &Value) -> Option<String> {
    match value {
        Value::String(value) if !value.is_empty() && value.len() <= 65536 => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn number(value: &Value) -> Option<i64> {
    match value {
        Value::Number(value) => value.as_i64().or_else(|| value.as_f64().map(|n| n as i64)),
        Value::String(value) => value.parse().ok(),
        _ => None,
    }
}

/// Absolute expiry from `expiresAt` or relative `expiresIn` (seconds).
fn expiry(data: &Value, absolute: &str, relative: &str, now: i64) -> i64 {
    if let Some(value) = data.get(absolute) {
        if !value.is_null() {
            return number(value).unwrap_or(0);
        }
    }
    data.get(relative)
        .and_then(number)
        .map(|seconds| now.saturating_add(seconds.saturating_mul(1000)))
        .unwrap_or(0)
}

fn parse_credential(body: &[u8], now: i64, previous_refresh: &str) -> Result<Credential, ProtocolError> {
    let payload: Value = serde_json::from_slice(body).map_err(|_| ProtocolError::InvalidResponse)?;
    if payload.get("code").and_then(number) == Some(401)
        || payload.get("error").and_then(text).as_deref() == Some("invalid_grant")
    {
        return Err(ProtocolError::LoginRequired);
    }
    if !is_success(payload.get("code").and_then(number)) {
        return Err(ProtocolError::Rejected);
    }
    let data = payload.get("data").ok_or(ProtocolError::InvalidResponse)?;
    let access_token = data.get("accessToken").and_then(text).ok_or(ProtocolError::InvalidResponse)?;
    let refresh_token = data.get("refreshToken").and_then(text)
        .or_else(|| (!previous_refresh.is_empty()).then(|| previous_refresh.to_string()))
        .ok_or(ProtocolError::InvalidResponse)?;
    let domain = data.get("domain").and_then(text)
        .filter(|domain| matches!(domain.as_str(), "www.codebuddy.cn" | "codebuddy.cn" | "www.workbuddy.cn" | "workbuddy.cn" | "copilot.tencent.com"))
        .unwrap_or_else(|| "www.codebuddy.cn".to_string());
    Ok(Credential {
        access_token,
        refresh_token,
        domain,
        expires_at: expiry(data, "expiresAt", "expiresIn", now),
        refresh_expires_at: expiry(data, "refreshExpiresAt", "refreshExpiresIn", now),
    })
}

fn parse_state(body: &[u8]) -> Result<(String, String), ProtocolError> {
    let payload: Value = serde_json::from_slice(body).map_err(|_| ProtocolError::InvalidResponse)?;
    if !is_success(payload.get("code").and_then(number)) {
        return Err(ProtocolError::Rejected);
    }
    let data = payload.get("data").ok_or(ProtocolError::InvalidResponse)?;
    let state = data.get("state").and_then(text)
        .filter(|state| state.len() <= 2048 && !state.chars().any(|c| c.is_control()))
        .ok_or(ProtocolError::InvalidResponse)?;
    let auth_url = data.get("authUrl").and_then(text)
        .filter(|url| url.starts_with(&format!("{AUTH_ORIGIN}/")))
        .ok_or(ProtocolError::InvalidResponse)?;
    Ok((state, auth_url))
}

fn parse_identity(body: &[u8]) -> Result<Identity, ProtocolError> {
    let payload: Value = serde_json::from_slice(body).map_err(|_| ProtocolError::InvalidResponse)?;
    if !is_success(payload.get("code").and_then(number)) {
        return Err(ProtocolError::Rejected);
    }
    let data = payload.get("data").ok_or(ProtocolError::InvalidResponse)?;
    let user_id = data.get("uid").and_then(text)
        .or_else(|| data.get("userId").and_then(text))
        .ok_or(ProtocolError::InvalidResponse)?;
    let enterprise_id = data.get("enterpriseId").and_then(text).unwrap_or_default();
    Ok(Identity { user_id, enterprise_id, realm: "cn".to_string() })
}

/// Pending-code classification shared by both pollers.
fn poll_code(body: &[u8], pending: i64) -> Result<Option<&[u8]>, ProtocolError> {
    let payload: Value = serde_json::from_slice(body).map_err(|_| ProtocolError::InvalidResponse)?;
    match payload.get("code").and_then(number) {
        Some(code) if code == pending => Ok(None),
        code if is_success(code) => Ok(Some(body)),
        Some(401) | Some(403) => Err(ProtocolError::LoginRequired),
        Some(429) => Err(ProtocolError::RateLimited),
        _ => Err(ProtocolError::Rejected),
    }
}

fn client() -> Result<Client, ProtocolError> {
    Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .redirect(Policy::none())
        .build()
        .map_err(|_| ProtocolError::Network)
}

async fn send(
    _client: &Client,
    request: reqwest::RequestBuilder,
) -> Result<Vec<u8>, ProtocolError> {
    let mut response = request.send().await.map_err(|error| {
        if error.is_timeout() { ProtocolError::Timeout } else { ProtocolError::Network }
    })?;
    let status = response.status();
    if status != StatusCode::OK {
        // Capture a short body snippet so a 401 can be told apart from a business-code rejection.
        let mut snippet = Vec::new();
        if let Ok(Some(chunk)) = response.chunk().await {
            let bytes: &[u8] = chunk.as_ref();
            snippet.extend_from_slice(&bytes[..bytes.len().min(300)]);
        }
        let text = String::from_utf8_lossy(&snippet);
        super::workbuddy_auth::log(
            "http",
            format_args!("status={} body={}", status.as_u16(), text),
            [],
        );
    }
    match status {
        StatusCode::OK => {}
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => return Err(ProtocolError::LoginRequired),
        StatusCode::TOO_MANY_REQUESTS => return Err(ProtocolError::RateLimited),
        status if status.is_server_error() => return Err(ProtocolError::Network),
        _ => return Err(ProtocolError::InvalidResponse),
    }
    if response.content_length().is_some_and(|size| size > MAX_RESPONSE_BYTES as u64) {
        return Err(ProtocolError::InvalidResponse);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ProtocolError::Network)? {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(ProtocolError::InvalidResponse);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

async fn auth_request(
    client: &Client,
    path: &str,
    method: reqwest::Method,
    token: Option<&str>,
    domain: Option<&str>,
    no_identity_headers: bool,
) -> Result<Vec<u8>, ProtocolError> {
    let url = Url::parse(&format!("{AUTH_ORIGIN}{path}")).map_err(|_| ProtocolError::InvalidResponse)?;
    let is_post = method == reqwest::Method::POST;
    let mut request = client
        .request(method, url)
        .header(header::ACCEPT, "application/json")
        .header(header::ORIGIN, AUTH_ORIGIN)
        .header(header::REFERER, format!("{AUTH_ORIGIN}/"))
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    if let Some(domain) = domain {
        request = request.header("X-Domain", domain);
    }
    if no_identity_headers {
        request = request
            .header("X-No-User-Id", "true")
            .header("X-No-Enterprise-Id", "true")
            .header("X-No-Department-Info", "true");
    }
    if is_post {
        request = request.body("{}");
    }
    send(client, request).await
}

/// Minimal RFC 3986 component encoding for the state query parameter.
fn url_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Step 1: obtain the state and the official authorization URL.
pub(super) async fn request_login() -> Result<(String, String), ProtocolError> {
    let client = client()?;
    let body = auth_request(
        &client,
        &format!("/v2/plugin/auth/state?platform={PLATFORM}"),
        reqwest::Method::POST,
        None,
        None,
        false,
    )
    .await?;
    parse_state(&body)
}

/// Step 2: poll until the token endpoint returns a credential.
pub(super) async fn poll_token(state: &str) -> Result<Credential, ProtocolError> {
    let client = client()?;
    let now = super::snapshot::current_unix_millis();
    let path = format!("/v2/plugin/auth/token?state={}", url_encode(state));
    let previous = "";
    loop {
        let body = auth_request(&client, &path, reqwest::Method::GET, None, None, false).await?;
        match poll_code(&body, CODE_PENDING_TOKEN)? {
            Some(data) => return parse_credential(data, now, previous),
            None => tokio::time::sleep(Duration::from_secs(1)).await,
        }
    }
}

/// Step 3: poll until the account endpoint returns the signed-in identity.
pub(super) async fn poll_account(state: &str, credential: &Credential) -> Result<Identity, ProtocolError> {
    let client = client()?;
    let path = format!("/v2/plugin/login/account?state={}", url_encode(state));
    loop {
        let body = auth_request(
            &client,
            &path,
            reqwest::Method::GET,
            Some(&credential.access_token),
            Some(&credential.domain),
            true,
        )
        .await?;
        match poll_code(&body, CODE_PENDING_ACCOUNT)? {
            Some(data) => return parse_identity(data),
            None => tokio::time::sleep(Duration::from_secs(1)).await,
        }
    }
}

/// Refresh an expired credential; keeps the old refresh token if the server omits it.
pub(super) async fn refresh(credential: &Credential, identity: &Identity) -> Result<Credential, ProtocolError> {
    let client = client()?;
    let url = Url::parse(&format!("{AUTH_ORIGIN}/v2/plugin/auth/token/refresh"))
        .map_err(|_| ProtocolError::InvalidResponse)?;
    let request = client
        .post(url)
        .bearer_auth(&credential.access_token)
        .header("X-Refresh-Token", &credential.refresh_token)
        .header("X-Auth-Refresh-Source", "plugin")
        .header("X-Domain", &credential.domain)
        .header("X-User-Id", &identity.user_id)
        .header(header::ACCEPT, "application/json")
        .header(header::CONTENT_TYPE, "application/json")
        .body("{}");
    let body = send(&client, request).await?;
    parse_credential(&body, super::snapshot::current_unix_millis(), &credential.refresh_token)
}

fn format_local_datetime(now: i64) -> String {
    // The billing API expects local wall-clock "YYYY-MM-DD HH:MM:SS".
    use chrono::TimeZone;
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = if now > 0 { now / 1000 } else { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0) };
    chrono::Local
        .timestamp_opt(secs, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "2000-01-01 00:00:00".to_string())
}

/// Pull the personal credit balance using a Bearer credential.
///
/// The Tencent billing gateway rejects reqwest+rustls on TLS-fingerprint grounds (HTTP 403,
/// business code 10085 "请求不合法") while accepting the same request from curl/WinSSL and
/// Node/Electron. Token Monitor uses Node's fetch and works, so use the OS curl (WinSSL, same
/// fingerprint family as the browser) for this one request. Config is fed on stdin so the token
/// never appears in the process command line.
pub(super) async fn query_usage(
    credential: &Credential,
    identity: &Identity,
) -> Result<super::workbuddy_usage::WorkbuddyUsage, ProtocolError> {
    let now = super::snapshot::current_unix_millis();
    let body = serde_json::json!({
        "PageNumber": 1,
        "PageSize": 100,
        "ProductCode": PRODUCT_CODE,
        "Status": [0, 3],
        "PackageEndTimeRangeBegin": format_local_datetime(now),
        "PackageEndTimeRangeEnd": format_local_datetime(now.saturating_add(PERSONAL_RANGE_MS)),
    });
    let credential = credential.clone();
    let identity = identity.clone();
    let response = tokio::task::spawn_blocking(move || billing_via_curl(&credential, &identity, &body.to_string()))
        .await
        .map_err(|_| ProtocolError::Network)??;
    super::workbuddy_auth::log("billing", format_args!("response_len={}", response.len()), []);
    parse_usage(&response, now)
}

/// Synchronous curl-based billing request. Uses `--config -` (read from stdin) so the bearer
/// token is not exposed in the process argument list.
fn billing_via_curl(credential: &Credential, identity: &Identity, body: &str) -> Result<Vec<u8>, ProtocolError> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    // curl config quoting: strings are double-quoted; escape backslash and double quote.
    let escape = |value: &str| value.replace('\\', "\\\\").replace('"', "\\\"");
    let config = format!(
        "url = \"{BILLING_ORIGIN}{PERSONAL_PATH}\"\n\
         request = \"POST\"\n\
         header = \"Authorization: Bearer {}\"\n\
         header = \"X-User-Id: {}\"\n\
         header = \"X-Domain: {}\"\n\
         header = \"Accept: application/json\"\n\
         header = \"Content-Type: application/json\"\n\
         data-binary = \"{}\"\n",
        escape(&credential.access_token),
        escape(&identity.user_id),
        escape(&credential.domain),
        escape(body),
    );

    let curl = std::env::var("WINDIR")
        .map(|dir| std::path::Path::new(&dir).join("System32").join("curl.exe"))
        .unwrap_or_else(|_| std::path::PathBuf::from("curl.exe"));
    let mut child = Command::new(curl)
        .args(["--config", "-", "-s", "-m", "20"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| ProtocolError::Network)?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(config.as_bytes()).map_err(|_| ProtocolError::Network)?;
    }
    let output = child.wait_with_output().map_err(|_| ProtocolError::Network)?;
    if !output.status.success() {
        super::workbuddy_auth::log("billing", format_args!("curl_exit={:?}", output.status.code()), []);
        return Err(ProtocolError::Network);
    }
    if output.stdout.len() > MAX_RESPONSE_BYTES {
        return Err(ProtocolError::InvalidResponse);
    }
    Ok(output.stdout)
}

/// Parse `get-user-resource` into a usage snapshot. Aggregates active (Status 0) credit packages
/// only; fails closed when an active package carries unusable data.
fn parse_usage(body: &[u8], now: i64) -> Result<super::workbuddy_usage::WorkbuddyUsage, ProtocolError> {
    let payload: Value = serde_json::from_slice(body).map_err(|_| ProtocolError::InvalidResponse)?;
    let accounts = value_at(&payload, &[
        &["data", "Accounts"], &["data", "data", "Accounts"], &["Accounts"],
        &["data", "Response", "Data", "Accounts"], &["data", "data", "Response", "Data", "Accounts"],
        &["Response", "Data", "Accounts"], &["data", "response", "data", "accounts"],
        &["response", "data", "accounts"],
    ])
    .and_then(|value| value.as_array())
    .ok_or(ProtocolError::InvalidResponse)?;

    let mut total = 0.0_f64;
    let mut remaining = 0.0_f64;
    let mut candidates = 0usize;
    let mut valid = 0usize;
    for account in accounts {
        let status = account.get("Status").or_else(|| account.get("status")).and_then(number);
        if status.is_some_and(|status| status != 0) {
            continue;
        }
        candidates += 1;
        let cap = parse_amount(pick(account, &["CycleCapacitySizePrecise", "cycleCapacitySizePrecise"]));
        let left = parse_amount(pick(account, &["CycleCapacityRemainPrecise", "cycleCapacityRemainPrecise"]));
        match (cap, left) {
            (Some(cap), Some(left)) if cap >= 0.0 && left >= 0.0 => {
                total += cap;
                remaining += left.min(cap);
                valid += 1;
            }
            _ => return Err(ProtocolError::InvalidResponse),
        }
    }
    if candidates == 0 || candidates != valid {
        return Err(ProtocolError::InvalidResponse);
    }
    Ok(super::workbuddy_usage::WorkbuddyUsage::new(remaining, total, now))
}

fn value_at<'a>(root: &'a Value, paths: &[&[&str]]) -> Option<&'a Value> {
    for path in paths {
        let mut value = root;
        let mut ok = true;
        for key in *path {
            match value.get(*key) {
                Some(next) => value = next,
                None => { ok = false; break; }
            }
        }
        if ok && value.is_array() {
            return Some(value);
        }
    }
    None
}

fn pick<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    for key in keys {
        if let Some(found) = value.get(*key) {
            if !found.is_null() {
                return Some(found);
            }
        }
    }
    None
}

fn parse_amount(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(value)) => value.as_f64().filter(|n| n.is_finite()),
        Some(Value::String(value)) => value.parse::<f64>().ok().filter(|n| n.is_finite()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_state_and_auth_url() {
        let body = br#"{"code":0,"data":{"state":"abc123","authUrl":"https://www.codebuddy.cn/login?state=abc123&platform=workbuddy"}}"#;
        assert_eq!(parse_state(body).unwrap().0, "abc123");
    }

    #[test]
    fn parses_credential_and_reuses_refresh_token() {
        let body = br#"{"code":0,"data":{"accessToken":"a","refreshToken":"r","domain":"www.codebuddy.cn","expiresIn":3600}}"#;
        let credential = parse_credential(body, 1_000_000, "").unwrap();
        assert_eq!(credential.access_token, "a");
        assert_eq!(credential.refresh_token, "r");
        assert_eq!(credential.expires_at, 1_000_000 + 3_600_000);
        let without = br#"{"code":0,"data":{"accessToken":"a2","domain":"www.codebuddy.cn"}}"#;
        let refreshed = parse_credential(without, 0, "old").unwrap();
        assert_eq!(refreshed.refresh_token, "old");
    }

    #[test]
    fn pending_token_and_account_codes() {
        assert_eq!(poll_code(br#"{"code":11217}"#, CODE_PENDING_TOKEN), Ok(None));
        assert!(poll_code(br#"{"code":0,"data":{}}"#, CODE_PENDING_TOKEN).is_ok());
    }

    #[test]
    fn aggregates_only_active_credit_packages() {
        // Real billing response nests Accounts under data.Response.Data; a first-path miss must
        // not abort the search (regression: `value_at` used `?` and only tried one path).
        let body = br#"{"code":0,"data":{"Response":{"Data":{"Accounts":[
            {"Status":0,"CycleCapacitySizePrecise":"500","CycleCapacityRemainPrecise":"10.25"},
            {"Status":0,"CycleCapacitySizePrecise":50,"CycleCapacityRemainPrecise":49.5},
            {"Status":3,"CycleCapacitySizePrecise":"9999","CycleCapacityRemainPrecise":"9999"}
        ]}}}}"#;
        let usage = parse_usage(body, 42).unwrap();
        assert_eq!((usage.total(), usage.remaining()), (550.0, 59.75));
    }

    #[test]
    fn fails_closed_on_unusable_active_package() {
        let body = br#"{"code":0,"data":{"Accounts":[
            {"Status":0,"CycleCapacitySizePrecise":"100","CycleCapacityRemainPrecise":"bad"}
        ]}}"#;
        assert_eq!(parse_usage(body, 0), Err(ProtocolError::InvalidResponse));
    }
}
