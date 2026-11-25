use std::{
    fs,
    path::Path,
    time::{Duration, Instant},
};

use reqwest::{
    header::{self, HeaderValue},
    redirect::Policy,
    Client, StatusCode,
};
use serde_json::Value;
use tokio::{sync::Mutex, time::timeout};

use super::{
    local_agent_files::{directory, entry, read_small_text},
    sessions::parse_timestamp_ms,
    snapshot::current_unix_millis,
    title::shorten,
    usage::{AgentUsage, UsageSource, UsageWindow},
};
use crate::win32::{ipv4_listeners::localhost_listener_owner, process::image_path};

const MAX_HUB_BYTES: u64 = 16 * 1024;
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
const MAX_HUBS: usize = 6;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(2);
const READ_TIMEOUT: Duration = Duration::from_secs(3);
const KEEP_FOR: Duration = Duration::from_secs(60);
const STATUS_PATH: &str = "/exa.language_server_pb.LanguageServerService/GetUserStatus";
const CSRF_HEADER: &str = "X-Codeium-Csrf-Token";
static LAST: Mutex<Option<(Instant, Option<AgentUsage>)>> = Mutex::const_new(None);

struct Hub {
    port: u16,
    pid: u32,
    token: HeaderValue,
    version: String,
}

fn parse_hub(name: &str, json: &str) -> Option<Hub> {
    let file_port: u16 = name
        .strip_prefix("hub_")?
        .strip_suffix(".json")?
        .parse()
        .ok()?;
    let value: Value = serde_json::from_str(json.trim_start_matches('\u{feff}')).ok()?;
    let port = u16::try_from(value["httpPort"].as_u64()?)
        .ok()
        .filter(|port| *port != 0)?;
    let pid = u32::try_from(value["pid"].as_u64()?)
        .ok()
        .filter(|pid| *pid != 0)?;
    if file_port == 0
        || (file_port != port && value["httpsPort"].as_u64() != Some(u64::from(file_port)))
    {
        return None;
    }
    let secret = value["csrfToken"].as_str()?.trim();
    if secret.is_empty() || secret.len() > 512 {
        return None;
    }
    let mut token = HeaderValue::from_str(secret).ok()?;
    token.set_sensitive(true);
    let version = value["lsVersion"]
        .as_str()
        .and_then(|version| shorten(version, 64))
        .unwrap_or_default();
    Some(Hub {
        port,
        pid,
        token,
        version,
    })
}

fn language_server_image(image: &Path) -> bool {
    let Some(file) = image.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let expected = [
        "language_server_windows_x64.exe",
        "language_server_windows_arm64.exe",
        "language_server.exe",
        "antigravity.exe",
    ];
    expected.iter().any(|name| file.eq_ignore_ascii_case(name))
        && image
            .components()
            .any(|part| part.as_os_str().eq_ignore_ascii_case("Antigravity"))
}

fn owns_listener(hub: &Hub) -> bool {
    localhost_listener_owner(hub.port) == Some(hub.pid)
        && image_path(hub.pid).is_some_and(|image| language_server_image(Path::new(&image)))
}

fn hubs(home: &Path) -> Option<Vec<Hub>> {
    let gemini = directory(home, ".gemini")?;
    let app = directory(&gemini, "antigravity")?;
    let daemon = directory(&app, "daemon")?;
    let mut files: Vec<_> = fs::read_dir(&daemon)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|file| {
            let name = file.file_name().into_string().ok()?;
            if !name.starts_with("hub_") || !name.ends_with(".json") {
                return None;
            }
            let (_, metadata) = entry(&daemon, &name)?;
            metadata
                .is_file()
                .then_some((metadata.modified().ok()?, name))
        })
        .collect();
    files.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
    Some(
        files
            .into_iter()
            .take(MAX_HUBS)
            .filter_map(|(_, name)| {
                parse_hub(&name, &read_small_text(&daemon, &name, MAX_HUB_BYTES)?)
            })
            .collect(),
    )
}

fn status_body(version: &str) -> Value {
    serde_json::json!({ "metadata": {
        "api_key": "", "ide_name": "antigravity", "ide_version": version,
        "extension_version": "", "session_id": "fly-island", "request_id": "1"
    } })
}

fn text(value: &Value, maximum: usize) -> Option<String> {
    value
        .as_str()
        .and_then(|text| shorten(text.trim(), maximum))
}

fn parse_status(value: &Value, now: i64) -> Option<AgentUsage> {
    let status = &value["userStatus"];
    let plan = text(&status["planStatus"]["planInfo"]["planName"], 64);
    let mut models: Vec<UsageWindow> = Vec::new();
    for config in status["cascadeModelConfigData"]["clientModelConfigs"]
        .as_array()?
        .iter()
    {
        let Some(left) = config["quotaInfo"]["remainingFraction"]
            .as_f64()
            .filter(|left| left.is_finite())
        else {
            continue;
        };
        let Some(name) = text(&config["label"], 60).or_else(|| text(&config["modelId"], 60)) else {
            continue;
        };
        let window = UsageWindow {
            name,
            used: (1.0 - left.clamp(0.0, 1.0)) * 100.0,
            resets_at: config["quotaInfo"]["resetTime"]
                .as_str()
                .and_then(parse_timestamp_ms),
        };
        if !models.iter().any(|known| {
            (known.used - window.used).abs() < 0.05 && known.resets_at == window.resets_at
        }) {
            models.push(window);
        }
    }
    if models.is_empty() {
        return None;
    }
    models.sort_by(|first, second| second.used.total_cmp(&first.used));
    Some(AgentUsage {
        updated_at: Some(now),
        five_hour: None,
        seven_day: None,
        models,
        plan,
        source: UsageSource::Antigravity,
    })
}

async fn fetch_status(client: &Client, hub: &Hub) -> Option<AgentUsage> {
    let url = format!("http://127.0.0.1:{}{}", hub.port, STATUS_PATH);
    let mut response = client
        .post(url)
        .header(CSRF_HEADER, hub.token.clone())
        .header(header::CONTENT_TYPE, "application/json")
        .body(status_body(&hub.version).to_string())
        .send()
        .await
        .ok()?;
    if response.status() != StatusCode::OK
        || response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return None;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return None;
        }
        body.extend_from_slice(&chunk);
    }
    parse_status(&serde_json::from_slice(&body).ok()?, current_unix_millis())
}

async fn read_quota() -> Option<AgentUsage> {
    let home = crate::system::windows_home_dir().ok()?;
    let hubs = tokio::task::spawn_blocking(move || hubs(&home))
        .await
        .ok()??;
    let client = Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .connect_timeout(REQUEST_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .ok()?;
    for hub in hubs {
        if owns_listener(&hub) {
            if let Some(usage) = fetch_status(&client, &hub).await {
                return Some(usage);
            }
        }
    }
    None
}

#[tauri::command]
pub async fn get_antigravity_usage() -> Result<Option<AgentUsage>, String> {
    let mut cache = LAST.lock().await;
    if let Some((when, result)) = &*cache {
        if when.elapsed() < KEEP_FOR {
            return Ok(result.clone());
        }
    }
    let answer = timeout(READ_TIMEOUT, read_quota()).await.ok().flatten();
    *cache = Some((Instant::now(), answer.clone()));
    Ok(answer)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn requires_a_local_daemon_record_with_matching_identity() {
        let record = |port, pid, token: &str| {
            json!({ "httpPort": port, "httpsPort": 60106, "pid": pid, "csrfToken": token, "lsVersion": "2.34.0" }).to_string()
        };
        let hub = parse_hub("hub_60106.json", &record(60107, 12, "token")).unwrap();
        assert_eq!(
            (hub.port, hub.pid, hub.version.as_str()),
            (60107, 12, "2.34.0")
        );
        assert!(hub.token.is_sensitive());
        assert!(parse_hub("hub_60107.json", &record(60107, 12, "token")).is_some());
        assert!(parse_hub("hub_1234.json", &record(60107, 12, "token")).is_none());
        assert!(parse_hub("hub_60106.json", &record(0, 12, "token")).is_none());
        assert!(parse_hub("hub_60106.json", &record(60107, 0, "token")).is_none());
        assert!(parse_hub("hub_60106.json", &record(60107, 12, "foo\r\nbar")).is_none());
        assert!(parse_hub("hub_60106.json", "not json").is_none());
        assert_eq!(status_body("2.34.0")["metadata"]["ide_version"], "2.34.0");
    }

    #[test]
    fn a_port_nobody_listens_on_is_refused() {
        let free = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = free.local_addr().unwrap().port();
        drop(free);
        let record = json!({ "httpPort": port, "httpsPort": port, "pid": std::process::id(), "csrfToken": "t" }).to_string();
        let hub = parse_hub(&format!("hub_{port}.json"), &record).unwrap();
        assert!(!owns_listener(&hub));
    }

    #[test]
    fn a_listener_that_is_not_antigravity_is_refused() {
        let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let record = json!({ "httpPort": port, "httpsPort": port, "pid": std::process::id(), "csrfToken": "t" }).to_string();
        let hub = parse_hub(&format!("hub_{port}.json"), &record).unwrap();
        assert_eq!(localhost_listener_owner(port), Some(std::process::id()), "the port is ours");
        assert!(!owns_listener(&hub), "but this test binary is not Antigravity's language server");
        let other = Hub { pid: std::process::id().wrapping_add(1), ..hub };
        assert!(!owns_listener(&other), "the hub file names a different process than the listener");
    }

    #[test]
    fn a_missing_or_broken_hub_folder_has_no_hubs() {
        let home = crate::agent_status::local_agent_files::scratch::tempdir();
        assert!(hubs(home.path()).is_none());
        let daemon = home.path().join(".gemini/antigravity/daemon");
        std::fs::create_dir_all(&daemon).unwrap();
        std::fs::write(daemon.join("hub_60106.json"), "{ truncated").unwrap();
        std::fs::write(daemon.join("hub_notaport.json"), "{}").unwrap();
        assert!(hubs(home.path()).is_some_and(|hubs| hubs.is_empty()));
    }

    #[test]
    fn a_changed_reply_shape_shows_nothing() {
        assert!(parse_status(&json!({"userStatus": {"cascadeModelConfigData": {"clientModelConfigs": "none"}}}), 1).is_none());
        assert!(parse_status(&json!([1, 2]), 1).is_none());
        assert!(parse_status(&json!({"userStatus": {"cascadeModelConfigData": {"clientModelConfigs": [
            {"label": "x", "quotaInfo": {"remainingFraction": "a lot"}}]}}}), 1).is_none());
    }

    #[test]
    fn only_accepts_the_expected_server_in_the_antigravity_installation() {
        assert!(language_server_image(Path::new(
            r"C:\Programs\Antigravity\resources\app\language_server_windows_x64.exe"
        )));
        assert!(!language_server_image(Path::new(
            r"C:\Programs\Antigravity\curl.exe"
        )));
        assert!(!language_server_image(Path::new(
            r"C:\Programs\Other\language_server_windows_x64.exe"
        )));
    }

    #[test]
    fn reads_and_deduplicates_model_quotas_without_inventing_a_window() {
        let window = |label, remaining, resets| json!({ "label": label, "quotaInfo": { "remainingFraction": remaining, "resetTime": resets } });
        let reply = json!({"userStatus": {
            "planStatus": {"planInfo": {"planName": "Pro"}},
            "cascadeModelConfigData": {"clientModelConfigs": [
                window("Gemini", 0.75, "2030-01-01T00:00:00Z"),
                window("Gemini High", 0.75, "2030-01-01T00:00:00Z"),
                window("Claude", 0.25, "2030-01-02T00:00:00Z"),
                {"label": "Unlimited"}
            ]}
        }});
        let usage = parse_status(&reply, 7).unwrap();
        assert_eq!(usage.plan.as_deref(), Some("Pro"));
        assert_eq!(usage.source, UsageSource::Antigravity);
        assert_eq!(usage.five_hour, None);
        assert_eq!(usage.models.len(), 2);
        assert_eq!(usage.models[0].name, "Claude");
        assert_eq!(usage.models[0].used, 75.0);
        assert!(usage.models[0].resets_at.is_some());
        assert!(parse_status(&json!({"userStatus": {}}), 1).is_none());
    }
}
