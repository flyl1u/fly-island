//! 豆包网页会员额度插件。
//! Portions derived from Renly1994/xiaotang-daozai (MIT License).

use fly_island_plugin_sdk::{empty, json, publish, quota, run, Value};
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
                        0.0
                    }
                } else {
                    0.0
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
    let path = cookie_file_path()?;
    fs::read_to_string(path).ok().map(|s| s.trim().to_owned()).filter(|s| !s.is_empty())
}

fn save_cookie(cookie: &str) {
    if let Some(path) = cookie_file_path() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(path, cookie.trim());
    }
}

fn find_browser() -> Option<PathBuf> {
    use windows::{
        core::{w, PCWSTR, PWSTR},
        Win32::UI::Shell::{AssocQueryStringW, ASSOCF_IS_PROTOCOL, ASSOCSTR_EXECUTABLE},
    };
    let mut buffer = [0u16; 4096];
    let mut length = buffer.len() as u32;
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

fn cdp(port: u16, url: &str, method: &str) -> Result<JsonValue, String> {
    let stream = TcpStream::connect_timeout(
        &SocketAddr::from((Ipv4Addr::LOCALHOST, port)),
        Duration::from_secs(2),
    )
    .map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(2))).map_err(|e| e.to_string())?;
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
        match socket.read().map_err(|e| e.to_string())? {
            Message::Text(raw) => {
                let val: JsonValue = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
                if val["id"] == 1 {
                    let _ = socket.close(None);
                    return val.get("result").cloned().ok_or_else(|| "No result".into());
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    Err("CDP timeout".into())
}

fn login_via_browser(cancel: &AtomicBool) -> Result<String, String> {
    let exe = find_browser().ok_or("未找到 Chrome 或 Edge 浏览器")?;
    let temp_dir = std::env::temp_dir().join(format!("fly-island-doubao-{}", std::process::id()));
    let _ = fs::create_dir_all(&temp_dir);
    let child = Command::new(exe)
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
        .spawn()
        .map_err(|e| format!("无法启动浏览器：{e}"))?;

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
            if let Ok(res) = cdp(*port, url, "Storage.getCookies") {
                if let Some(cookies) = res["cookies"].as_array() {
                    let mut cookie_parts = Vec::new();
                    let mut has_session = false;
                    for c in cookies {
                        let name = c["name"].as_str().unwrap_or_default();
                        let val = c["value"].as_str().unwrap_or_default();
                        if name == "sessionid" || name == "sessionid_ss" {
                            has_session = true;
                        }
                        if !name.is_empty() && !val.is_empty() {
                            cookie_parts.push(format!("{name}={val}"));
                        }
                    }
                    if has_session {
                        let full_cookie = cookie_parts.join("; ");
                        save_cookie(&full_cookie);
                        return Ok(full_cookie);
                    }
                }
            }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    Err("登录等待超时".into())
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

    let last_cookie = Arc::new(Mutex::new(None::<String>));
    let last_cookie_poll = last_cookie.clone();
    let last_cookie_action = last_cookie.clone();

    if run(
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
        move |action_id, _| {
            if action_id == "login" {
                cancel_for_action.store(false, Ordering::Relaxed);
                let cookie = login_via_browser(&cancel_for_action)?;
                if let Ok(mut lock) = last_cookie_action.lock() {
                    *lock = Some(cookie.clone());
                }
                if let Some(q) = fetch_quota_with_cookie(&cookie) {
                    let _ = publish(json!({
                        "quota": [q],
                        "sessions": [],
                        "notifications": []
                    }));
                }
                Ok(json!({"success": true}))
            } else {
                Err(format!("未知操作：{action_id}"))
            }
        },
    )
    .is_err()
    {
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_doubao_quota() {
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