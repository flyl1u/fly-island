//! 豆包网页会员额度插件。
//! Portions derived from Renly1994/xiaotang-daozai (MIT License).
//! Copyright (c) 2026 小唐的Token and Daozai contributors.

use fly_island_plugin_sdk::{credentials, empty, json, publish, quota, run, Value};
use serde_json::Value as JsonValue;
use std::{
    fs,
    net::{Ipv4Addr, SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tungstenite::{client::client_with_config, protocol::WebSocketConfig, Message};

const ENDPOINT: &str = "https://www.doubao.com/alice/commerce/sale/subscription/quota/summary/";
const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36";

pub fn parse_doubao_quota(value: &Value) -> Option<Value> {
    let data = value.get("data")?;
    let mut items = Vec::new();
    for section in ["window_limit_section", "incentive_quota_section"] {
        let groups = data
            .pointer(&format!("/{section}/window_limit_groups"))
            .and_then(Value::as_array);
        for group in groups.into_iter().flatten() {
            for limit in group["window_limits"].as_array().into_iter().flatten() {
                let used_percent = if limit["usage_exhausted"].as_bool() == Some(true) {
                    100.0
                } else if let Some(up) = limit["used_percent"].as_f64() {
                    up
                } else if let (Some(used), Some(tot)) =
                    (limit["used_amount"].as_f64(), limit["total_amount"].as_f64())
                {
                    if tot > 0.0 {
                        used / tot * 100.0
                    } else {
                        continue;
                    }
                } else {
                    continue;
                };
                let remaining = (100.0 - used_percent).clamp(0.0, 100.0);
                let reset = limit["end_time"]
                    .as_i64()
                    .map(|t| if t >= 100_000_000_000 { t / 1000 } else { t });
                let label = match limit["window_type"].as_i64() {
                    Some(1) => "5 小时",
                    Some(2) => "本周",
                    _ => "额度",
                };
                items.push((label, remaining, reset));
            }
        }
    }
    if let Some((label, remaining, reset)) = items.into_iter().next() {
        let plan = data
            .pointer("/current_subscription/display/short_name")
            .or_else(|| data.pointer("/current_subscription/display/product_name"))
            .and_then(Value::as_str)
            .unwrap_or("豆包");
        let display_label = format!("{plan} · {label}");
        Some(quota(
            "doubao-quota",
            &display_label,
            Some(remaining),
            None,
            reset.map(|t| t * 1000),
        ))
    } else {
        None
    }
}

fn fetch_quota_with_cookie(cookie: &str) -> Option<Value> {
    let resp = ureq::post(ENDPOINT)
        .set("Cookie", cookie)
        .set("Origin", "https://www.doubao.com")
        .set("Referer", "https://www.doubao.com/member/quota-management")
        .set("Accept", "application/json, text/plain, */*")
        .set("Content-Type", "application/json")
        .set("User-Agent", USER_AGENT)
        .timeout(Duration::from_secs(10))
        .send_string(r#"{"product_line":"membership"}"#)
        .ok()?;
    let val: Value = resp.into_json().ok()?;
    parse_doubao_quota(&val)
}

fn cookie_file_path() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(PathBuf::from(appdata).join("com.focusd.island/plugins/doubao/cookie.txt"))
}

fn load_saved_cookie() -> Option<String> {
    if let Some(cookie) = credentials::load("doubao", "cookie").ok().flatten() { return Some(cookie); }
    // Migrate only this plugin's former file, after the vault write succeeds.
    let path = cookie_file_path()?;
    let file = fs::File::open(&path).ok()?;
    use std::io::Read;
    let mut raw = String::new();
    file.take(8193).read_to_string(&mut raw).ok()?;
    let cookie = raw.trim();
    if cookie.is_empty() || cookie.len() > 8192 { return None; }
    credentials::save("doubao", "cookie", cookie).ok()?;
    let _ = fs::remove_file(path);
    Some(cookie.to_owned())
}

fn save_cookie(cookie: &str) -> Result<(), String> {
    credentials::save("doubao", "cookie", cookie.trim())
}

fn find_browser() -> Option<PathBuf> {
    use windows::{
        core::{w, PCWSTR, PWSTR},
        Win32::UI::Shell::{AssocQueryStringW, ASSOCF_IS_PROTOCOL, ASSOCSTR_EXECUTABLE},
    };
    let mut buffer = [0u16; 4096];
    let mut length = buffer.len() as u32;
    // SAFETY: the output buffer and length remain live; all inputs are fixed UTF-16 strings.
    if unsafe {
        AssocQueryStringW(
            ASSOCF_IS_PROTOCOL,
            ASSOCSTR_EXECUTABLE,
            w!("https"),
            PCWSTR::null(),
            Some(PWSTR(buffer.as_mut_ptr())),
            &mut length,
        )
    }
    .is_ok()
    {
        let path = PathBuf::from(String::from_utf16_lossy(
            &buffer[..buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len())],
        ));
        if path.is_file()
            && path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.eq_ignore_ascii_case("chrome.exe")
                        || name.eq_ignore_ascii_case("msedge.exe")
                })
        {
            return Some(path);
        }
    }
    ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"]
        .into_iter()
        .filter_map(std::env::var_os)
        .flat_map(|root| {
            [
                "Microsoft/Edge/Application/msedge.exe",
                "Google/Chrome/Application/chrome.exe",
            ]
            .map(|name| PathBuf::from(&root).join(name))
        })
        .find(|path| path.is_file())
}

struct BrowserInstance {
    child: Child,
    profile: PathBuf,
}

impl Drop for BrowserInstance {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = fs::remove_dir_all(&self.profile);
    }
}

fn endpoint(raw: &str) -> Result<(u16, String), String> {
    let mut lines = raw.lines();
    let port: u16 = lines
        .next()
        .unwrap_or_default()
        .parse()
        .ok()
        .filter(|p| *p > 0)
        .ok_or("Invalid port")?;
    let path = lines
        .next()
        .filter(|p| p.starts_with("/devtools/browser/"))
        .ok_or("Invalid devtools path")?;
    Ok((port, format!("ws://127.0.0.1:{port}{path}")))
}

fn cdp(port: u16, url: &str, method: &str, cancel: &AtomicBool) -> Result<JsonValue, String> {
    let stream = TcpStream::connect_timeout(
        &SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
        Duration::from_secs(2),
    )
    .map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_millis(500))).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(2))).map_err(|e| e.to_string())?;
    let config = WebSocketConfig::default();
    let (mut socket, _) =
        client_with_config(url, stream, Some(config)).map_err(|e| e.to_string())?;
    socket
        .send(Message::Text(
            json!({"id": 1, "method": method, "params": {}}).to_string(),
        ))
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        if cancel.load(Ordering::Relaxed) { return Err("Login cancelled".into()); }
        match socket.read() {
            Ok(Message::Text(raw)) => {
                let val: JsonValue = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
                if val["id"] == 1 {
                    let _ = socket.close(None);
                    return val.get("result").cloned().ok_or_else(|| "No result".into());
                }
            }
            Ok(Message::Close(_)) => break,
            Err(tungstenite::Error::Io(error)) if matches!(error.kind(), std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock) => continue,
            Err(_) => return Err("Browser communication failed".into()),
            _ => {}
        }
    }
    Err("CDP timeout".into())
}

fn login_via_browser(cancel: &AtomicBool) -> Result<String, String> {
    let exe = find_browser().ok_or("未找到 Chrome 或 Edge 浏览器")?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp_dir = std::env::temp_dir().join(format!("fly-island-doubao-{}-{stamp}", std::process::id()));
    fs::create_dir(&temp_dir).map_err(|e| e.to_string())?;
    let spawned = Command::new(exe)
        .arg(format!("--user-data-dir={}", temp_dir.display()))
        .args([
            "--remote-debugging-port=0",
            "--remote-debugging-address=127.0.0.1",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-mode",
            "--new-window",
            "https://www.doubao.com/chat/",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    let child = match spawned {
        Ok(child) => child,
        Err(error) => { let _ = fs::remove_dir(&temp_dir); return Err(format!("Cannot launch browser: {error}")); }
    };

    let mut browser = BrowserInstance {
        child,
        profile: temp_dir,
    };
    let start = Instant::now();
    let mut address = None;

    while start.elapsed() < Duration::from_secs(300) {
        if cancel.load(Ordering::Relaxed) {
            return Err("已取消登录".into());
        }
        if browser.child.try_wait().map_err(|e| e.to_string())?.is_some() {
            return Err("浏览器窗口已关闭".into());
        }
        if address.is_none() {
            address = fs::read_to_string(browser.profile.join("DevToolsActivePort"))
                .ok()
                .and_then(|raw| endpoint(&raw).ok());
        }
        if let Some((port, url)) = &address {
            if let Ok(res) = cdp(*port, url, "Storage.getCookies", cancel) {
                if let Some(cookie) = doubao_cookie(&res["cookies"]) {
                    save_cookie(&cookie)?;
                    return Ok(cookie);
                }
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err("登录等待超时".into())
}

fn doubao_cookie(value: &Value) -> Option<String> {
    let mut parts = Vec::new();
    let mut has_session = false;
    for c in value.as_array()? {
        let domain = c["domain"].as_str().unwrap_or_default().trim_start_matches('.').to_ascii_lowercase();
        if domain != "doubao.com" && !domain.ends_with(".doubao.com") { continue; }
        let name = c["name"].as_str().unwrap_or_default();
        let value = c["value"].as_str().unwrap_or_default();
        if name.is_empty() || value.is_empty() || name.contains([';', '\r', '\n', '=']) || value.contains([';', '\r', '\n']) { continue; }
        has_session |= matches!(name, "sessionid" | "sessionid_ss");
        parts.push(format!("{name}={value}"));
    }
    let cookie = parts.join("; ");
    (has_session && cookie.len() <= 8192).then_some(cookie)
}

fn try_find_cookie(settings: &Value) -> Option<String> {
    if let Some(c) = settings["cookie"].as_str().map(str::trim).filter(|s| !s.is_empty()) {
        return Some(c.to_owned());
    }
    load_saved_cookie()
}

fn main() {
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_for_action = cancel.clone();
    let mut login: Option<std::thread::JoinHandle<()>> = None;

    let last_cookie = Arc::new(Mutex::new(None::<String>));
    let last_cookie_poll = last_cookie.clone();
    let last_cookie_action = last_cookie.clone();

    let result = run(
        Duration::from_secs(60),
        move |settings| {
            let cookie_opt = try_find_cookie(settings).or_else(|| {
                last_cookie_poll.lock().ok().and_then(|c| c.clone())
            });
            let quota_item = cookie_opt.as_deref().and_then(fetch_quota_with_cookie);
            let quota_list = quota_item.map(|q| vec![q]).unwrap_or_default();
            if quota_list.is_empty() {
                Ok(empty())
            } else {
                Ok(json!({
                    "quota": quota_list,
                    "sessions": [],
                    "notifications": []
                }))
            }
        },
        |action_id, _| {
            if action_id == "login" {
                if login.as_ref().is_some_and(|job| !job.is_finished()) { return Ok(json!({"pending":true})); }
                if let Some(job) = login.take() { let _ = job.join(); }
                cancel_for_action.store(false, Ordering::Relaxed);
                let signal = cancel_for_action.clone();
                let saved = last_cookie_action.clone();
                login = Some(std::thread::spawn(move || {
                    match login_via_browser(&signal) {
                        Ok(cookie) => { if let Ok(mut lock) = saved.lock() { *lock = Some(cookie); } }
                        Err(_) => eprintln!("Doubao login unavailable or cancelled"),
                    }
                    if !signal.load(Ordering::Relaxed) {
                        let cookie = saved.lock().ok().and_then(|v| v.clone());
                        if let Some(q) = cookie.as_deref().and_then(fetch_quota_with_cookie) {
                            let _ = publish(json!({"quota":[q],"sessions":[],"notifications":[]}));
                        }
                    }
                }));
                Ok(json!({"pending": true}))
            } else {
                Err(format!("未知操作：{action_id}"))
            }
        },
    );
    cancel.store(true, Ordering::Relaxed);
    if let Some(job) = login { let _ = job.join(); }
    if result.is_err() { std::process::exit(1); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_login_only_collects_doubao_cookies() {
        let cookies = json!([
            {"domain":".doubao.com","name":"sessionid","value":"own"},
            {"domain":"www.doubao.com","name":"pref","value":"light"},
            {"domain":"accounts.google.com","name":"sessionid","value":"private-oauth"},
            {"domain":"evil-doubao.com","name":"other","value":"unrelated"}
        ]);
        assert_eq!(doubao_cookie(&cookies).as_deref(), Some("sessionid=own; pref=light"));
        assert_eq!(doubao_cookie(&json!([{"domain":"other.com","name":"sessionid","value":"wrong"}])), None);
        assert_eq!(doubao_cookie(&json!([{"domain":"doubao.com","name":"sessionid","value":"x\r\ny"}])), None);
    }

    #[test]
    fn test_parse_doubao_quota() {
        for limit in [json!({}), json!({"used_amount":0,"total_amount":0})] {
            assert!(parse_doubao_quota(&json!({"data":{"window_limit_section":{"window_limit_groups":[{"window_limits":[limit]}]}}})).is_none());
        }
        let val = json!({
            "code": 0,
            "data": {
                "current_subscription": {
                    "display": {
                        "short_name": "豆包会员"
                    }
                },
                "window_limit_section": {
                    "window_limit_groups": [
                        {
                            "window_limits": [
                                {
                                    "window_type": 1,
                                    "used_percent": 15.0,
                                    "end_time": 1750000000
                                }
                            ]
                        }
                    ]
                }
            }
        });
        let q = parse_doubao_quota(&val).expect("should parse");
        assert_eq!(q["id"], "doubao-quota");
        assert_eq!(q["label"], "豆包会员 · 5 小时");
        assert_eq!(q["remainingPercent"], 85.0);
        assert_eq!(q["resetsAt"], 1750000000000i64);
    }
}
