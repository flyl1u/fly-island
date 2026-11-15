use super::model::{Account, RequestConfig, Secrets};
use reqwest::{Client, Url};
use serde_json::Value;
use std::time::Duration;

const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

fn loopback(url: &Url) -> bool {
    url.host_str()
        .is_some_and(|host| matches!(host, "localhost" | "127.0.0.1" | "[::1]" | "::1"))
}

pub fn validate_url(value: &str) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid request URL".to_string())?;
    let local = loopback(&url);
    if url.host_str().is_none()
        || (url.scheme() != "https" && !(url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(
            "Use HTTPS (HTTP is allowed only for loopback), without credentials in the URL".into(),
        );
    }
    Ok(url)
}

pub fn host(base: &str) -> Result<String, String> {
    Ok(validate_url(base)?
        .host_str()
        .unwrap_or_default()
        .to_lowercase())
}

pub fn root(base: &str) -> Result<String, String> {
    Ok(validate_url(base)?.origin().ascii_serialization())
}

pub fn client(account: &Account) -> Result<Client, String> {
    let builder = Client::builder()
        .timeout(Duration::from_secs(account.timeout_seconds))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("FocuSD-Island/API-Balance");
    // Local gateways must not send credentials through a system/environment proxy.
    let builder = if Url::parse(&account.base_url).is_ok_and(|url| loopback(&url)) {
        builder.no_proxy()
    } else {
        builder
    };
    builder
        .build()
        .map_err(|_| "Unable to create HTTP client".into())
}

pub async fn send(client: &Client, request: RequestConfig) -> Result<Value, String> {
    let url = validate_url(&request.url)?;
    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|_| "Invalid HTTP method".to_string())?;
    if ![
        reqwest::Method::GET,
        reqwest::Method::POST,
        reqwest::Method::PUT,
        reqwest::Method::PATCH,
        reqwest::Method::DELETE,
        reqwest::Method::HEAD,
    ]
    .contains(&method)
    {
        return Err("Unsupported HTTP method".into());
    }
    let mut builder = client.request(method, url);
    for (name, value) in request.headers {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = match body {
            Value::String(s) => builder.body(s),
            other => builder.json(&other),
        };
    }
    let mut response = builder.send().await.map_err(|e| {
        if e.is_timeout() {
            "Request timed out".into()
        } else {
            "Network request failed (check connection and endpoint)".to_string()
        }
    })?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "HTTP {} {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or("API request failed")
        ));
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_RESPONSE_BYTES as u64)
    {
        return Err("Response exceeds 2 MiB".into());
    }
    let mut data = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Unable to read response".to_string())?
    {
        if data.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err("Response exceeds 2 MiB".into());
        }
        data.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&data).map_err(|_| "API response is not valid JSON".into())
}

pub async fn get(
    client: &Client,
    url: String,
    token: &str,
    bearer: bool,
    headers: &[(&str, &str)],
) -> Result<Value, String> {
    if token.trim().is_empty() {
        return Err("API key / access token is required".into());
    }
    let mut request = RequestConfig {
        url,
        method: "GET".into(),
        ..Default::default()
    };
    request.headers.insert(
        "Authorization".into(),
        if bearer {
            format!("Bearer {token}")
        } else {
            token.into()
        },
    );
    request
        .headers
        .insert("Accept".into(), "application/json".into());
    for (k, v) in headers {
        request.headers.insert((*k).into(), (*v).into());
    }
    send(client, request).await
}

pub fn redact(message: &str, secrets: &Secrets) -> String {
    let mut message = message.to_string();
    for secret in [
        &secrets.api_key,
        &secrets.access_token,
        &secrets.secret_access_key,
    ] {
        if !secret.is_empty() {
            message = message.replace(secret, "[redacted]");
        }
    }
    message.chars().take(500).collect()
}

pub fn check_business(body: &Value) -> Result<(), String> {
    if body.get("success").and_then(Value::as_bool) == Some(false)
        || body.get("error").is_some_and(|e| !e.is_null() && e != "")
    {
        return Err("API reported a business error (check account, plan and credentials)".into());
    }
    if let Some(base) = body.get("base_resp") {
        if base
            .get("status_code")
            .and_then(Value::as_i64)
            .is_some_and(|n| n != 0)
        {
            return Err("Provider reported a business error".into());
        }
    }
    Ok(())
}
