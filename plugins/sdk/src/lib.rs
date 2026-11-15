//! API v1 stdio runtime. Only JSON-RPC goes to stdout; credentials never go to diagnostics.
use std::{io::{self, BufRead, Write}, sync::mpsc, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
pub use serde_json::{json, Value};

pub fn now() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64) }
pub fn empty() -> Value { json!({"quota":[],"sessions":[],"notifications":[]}) }
pub fn quota(id: &str, label: &str, percent: Option<f64>, balance: Option<String>, reset: Option<i64>) -> Value {
    json!({"id":id,"label":label,"remainingPercent":percent.map(|v| v.clamp(0.0,100.0)),"secondaryPercent":null,"balance":balance,"resetsAt":reset,"updatedAt":now()})
}
pub fn session(id: &str, title: &str, cwd: Option<&str>, status: &str, updated: i64, action: Option<&str>) -> Value {
    json!({"id":id,"title":title,"cwd":cwd,"status":status,"updatedAt":updated,"action":action})
}
pub fn notification(id: &str, source_id: &str, app_name: &str, icon: &str, title: &str, body: &str, action: Option<&str>) -> Value {
    json!({"id":id,"sourceId":source_id,"appName":app_name,"icon":icon,"title":title,"body":body,"receivedAt":now(),"action":action})
}
pub fn send(value: Value) -> io::Result<()> {
    let mut out = io::stdout().lock();
    writeln!(out, "{value}")?;
    out.flush()
}
pub fn publish(data: Value) -> io::Result<()> {
    send(json!({"jsonrpc":"2.0","method":"publish","params":data}))
}

pub fn run(mut interval: Duration, mut poll: impl FnMut(&Value) -> Result<Value, String>, mut action: impl FnMut(&str, &Value) -> Result<Value, String>) -> Result<(), String> {
    let (tx, rx) = mpsc::sync_channel(16);
    std::thread::spawn(move || {
        let input = io::stdin();
        for line in input.lock().lines() {
            let Ok(line) = line else { break; };
            if line.len() > 256 * 1024 { break; }
            if tx.send(line).is_err() { break; }
        }
    });
    let mut settings = Value::Null;
    let mut ready = false;
    let mut next = Instant::now();
    loop {
        let wait = if ready { next.saturating_duration_since(Instant::now()) } else { Duration::from_secs(10) };
        match rx.recv_timeout(wait) {
            Ok(line) => {
                let v: Value = serde_json::from_str(&line).map_err(|_| "Invalid RPC")?;
                if v["jsonrpc"] != "2.0" { return Err("Invalid RPC version".into()); }
                let id = v["id"].clone();
                match v["method"].as_str() {
                    Some("initialize") if !ready && v["params"]["apiVersion"] == 1 => {
                        settings = v["params"]["settings"].clone();
                        if let Some(seconds) = settings["interval"].as_str().and_then(|s| s.parse::<u64>().ok()) { interval = Duration::from_secs(seconds.clamp(1,3600)); }
                        send(json!({"jsonrpc":"2.0","id":id,"result":{"apiVersion":1}})).map_err(|e| e.to_string())?;
                        ready = true; next = Instant::now();
                    }
                    Some("action") if ready => {
                        match action(v["params"]["id"].as_str().unwrap_or_default(), &settings) {
                            Ok(result) => send(json!({"jsonrpc":"2.0","id":id,"result":result})),
                            Err(_) => send(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32000,"message":"Action failed"}})),
                        }.map_err(|e| e.to_string())?;
                        next = Instant::now();
                    }
                    _ => { send(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Unknown method"}})).map_err(|e| e.to_string())?; }
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
            Err(mpsc::RecvTimeoutError::Timeout) if !ready => return Err("Initialize timeout".into()),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if ready && Instant::now() >= next {
            let params = match poll(&settings) { Ok(v) => v, Err(_) => { eprintln!("Plugin refresh unavailable; check local sign-in"); empty() } };
            send(json!({"jsonrpc":"2.0","method":"publish","params":params})).map_err(|e| e.to_string())?;
            next = Instant::now() + interval;
        }
    }
}
