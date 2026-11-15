use fly_island_plugin_sdk::{json, now, quota, run};
fn main() {
    if run(std::time::Duration::from_secs(30), |_| {
        let timestamp = now();
        Ok(json!({
            "quota":[quota("hello", "Hello", Some(75.0), None, Some(timestamp + 3600000))],
            "sessions":[{"id":"hello","title":"Hello Island","cwd":null,"status":"running","updatedAt":timestamp,"action":"hello"}],
            "notifications":[{"id":timestamp.to_string(),"sourceId":"hello","appName":"Hello","icon":"plugin","title":"Hello Island","body":"Hello / 你好","receivedAt":timestamp,"action":"hello"}]
        }))
    }, |_, _| Ok(json!(true))).is_err() { std::process::exit(1); }
}
