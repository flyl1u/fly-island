use std::{io::{Cursor, Write}, sync::{Arc, Mutex}, time::{Duration, Instant}};
use serde_json::json;
use sha2::{Digest, Sha256};
use super::{manifest::Manifest, packages::{self, IndexEntry}, process::{self, Worker}, protocol, service::Host};

fn manifest() -> Manifest { Manifest::parse(include_bytes!("../../../plugins/example-hello/fly-island-plugin.json")).unwrap() }
#[test]
fn validates_manifest_and_protocol() {
    for (field, value) in [("id", json!("../escape")), ("id", json!("con")), ("apiVersion", json!(2)), ("permissions", json!(["webview"]))] {
        let mut v = serde_json::to_value(manifest()).unwrap(); v[field] = value;
        assert!(Manifest::parse(&serde_json::to_vec(&v).unwrap()).is_err());
    }
    for path in ["../test.exe", "C:/test.exe", "a\\test.exe", "/test.exe"] {
        let mut m = manifest(); m.runtime.command = path.into(); assert!(m.validate().is_err());
    }
    let publish = |params| json!({"jsonrpc":"2.0","method":"publish","params":params}).to_string();
    let m = manifest();
    assert!(protocol::parse_publish(&publish(json!({})), &m).unwrap().is_some());
    assert!(protocol::parse_publish(&"x".repeat(protocol::MAX_LINE+1), &m).is_err());
    assert!(protocol::parse_publish("{\"jsonrpc\":\"1.0\"}", &m).is_err());
    let invalid = json!({"quota":[{"id":"q","label":"q","remainingPercent":101,"secondaryPercent":null,"balance":null,"resetsAt":null,"updatedAt":1}]});
    assert!(protocol::parse_publish(&publish(invalid), &m).is_err());
    let mut restricted = m.clone(); restricted.contributes.clear();
    let n = json!({"notifications":[{"id":"n","sourceId":"test","appName":"test","icon":"plugin","title":"test","body":"test","receivedAt":1,"action":null}]});
    assert!(protocol::parse_publish(&publish(n), &restricted).is_err());
    assert_eq!(process::restart_delay(0), Duration::from_secs(1));
    assert_eq!(process::restart_delay(5), Duration::from_secs(32));
    assert_eq!(process::restart_delay(6), Duration::from_secs(32));
    assert_eq!(process::restart_delay(u32::MAX), Duration::from_secs(32));
}
fn zip(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, bytes) in files {
        writer.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap().into_inner()
}
fn entry(bytes: &[u8], url: String) -> IndexEntry {
    let m = manifest();
    IndexEntry { id: m.id, version: m.version, name: m.name, description: m.description, api_version: 1, url, sha256: format!("{:x}", Sha256::digest(bytes)), size: bytes.len() as u64, min_app_version: env!("CARGO_PKG_VERSION").into() }
}
fn temporary(name: &str) -> std::path::PathBuf {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../node_modules/.cache/plugin-tests").join(format!("{name}-{}", std::process::id()));
    if root.exists() { std::fs::remove_dir_all(&root).unwrap(); }
    std::fs::create_dir_all(&root).unwrap(); root
}
#[test]
fn rejects_hash_and_zip_traversal() {
    let root = temporary("archive");
    let bytes = zip(&[("../escape.exe", b"bad")]);
    let e = entry(&bytes, String::new());
    assert!(packages::extract(&bytes, &root, &e).is_err());
    assert!(packages::verify(b"changed", &e).is_err());
    std::fs::remove_dir_all(root).unwrap();
}
fn fixture() -> std::path::PathBuf {
    let mut candidates = Vec::new();
    if let Ok(cur) = std::env::current_exe() {
        if let Some(debug_dir) = cur.parent().and_then(|p| p.parent()) {
            candidates.push(debug_dir.join("example-hello.exe"));
        }
    }
    if let Some(target) = std::env::var_os("CARGO_TARGET_DIR") {
        candidates.push(std::path::PathBuf::from(target).join("debug/example-hello.exe"));
    }
    candidates.push(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/debug/example-hello.exe"));
    candidates.push(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../target/debug/example-hello.exe"));
    candidates.push(std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../plugins/target/debug/example-hello.exe"));
    for c in candidates {
        if c.exists() {
            return c;
        }
    }
    panic!("Build plugins/example-hello first with the same CARGO_TARGET_DIR");
}
#[test]
fn example_worker_handshake_actions_and_stop() {
    let root = temporary("process");
    std::fs::copy(fixture(), root.join("example-hello.exe")).unwrap();
    let live = Arc::new(Mutex::new(Vec::new())); let output = live.clone();
    let worker = Worker::start(root.clone(), manifest(), json!({"interval":"5"}), root.join("stderr.log"), Arc::new(move |data, status| { output.lock().unwrap().push((status.to_owned(), data)); }));
    let until = Instant::now() + Duration::from_secs(8);
    while !live.lock().unwrap().iter().any(|(_, d)| !d.quota.is_empty()) && Instant::now() < until { std::thread::sleep(Duration::from_millis(20)); }
    assert!(live.lock().unwrap().iter().any(|(s, d)| s == "running" && d.quota.len() == 1 && d.notifications.len() == 1 && d.sessions.len() == 1));
    assert_eq!(worker.request("action", json!({"id":"hello"})).unwrap().recv_timeout(Duration::from_secs(3)).unwrap().unwrap(), json!(true));
    let before = Instant::now(); drop(worker); assert!(before.elapsed() < Duration::from_secs(2));
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn local_index_install_enable_publish_disable_uninstall() {
    let root = temporary("installation");
    let exe = std::fs::read(fixture()).unwrap(); let m = serde_json::to_vec(&manifest()).unwrap();
    let bytes = zip(&[("fly-island-plugin.json", &m), ("example-hello.exe", &exe)]);
    let archive = root.join("example.zip"); std::fs::write(&archive, &bytes).unwrap();
    let e = entry(&bytes, reqwest::Url::from_file_path(&archive).unwrap().to_string());
    let index = root.join("plugins-index.json"); std::fs::write(&index, serde_json::to_vec(&vec![e]).unwrap()).unwrap();
    let host = Host::new(root.join("data"), None).unwrap(); let mut registry = host.snapshot().registry;
    registry.developer_mode = true; registry.index_url = index.to_string_lossy().into_owned(); host.persist(registry).unwrap();
    tauri::async_runtime::block_on(host.install("example-hello")).unwrap();
    assert!(!host.snapshot().registry.installed["example-hello"].enabled);
    host.enable("example-hello", true).unwrap();
    let until = Instant::now() + Duration::from_secs(8);
    while !host.snapshot().live.get("example-hello").is_some_and(|l| !l.data.quota.is_empty()) && Instant::now() < until { std::thread::sleep(Duration::from_millis(20)); }
    assert_eq!(host.snapshot().live["example-hello"].data.notifications.len(), 1);
    assert_eq!(host.action("example-hello", "hello").unwrap(), json!(true));
    host.enable("example-hello", false).unwrap(); assert!(host.snapshot().live.is_empty());
    host.uninstall("example-hello").unwrap(); assert!(host.snapshot().registry.installed.is_empty());
    assert!(!host.root.join("plugins/example-hello").exists()); drop(host); std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn built_artifacts_index_installs_and_runs() {
    let index_file = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../artifacts/plugins/plugins-index.json");
    if !index_file.exists() {
        return;
    }
    let root = temporary("built-index-test");
    let host = Host::new(root.join("data"), None).unwrap();
    let mut registry = host.snapshot().registry;
    registry.developer_mode = true;
    registry.index_url = reqwest::Url::from_file_path(&index_file).unwrap().to_string();
    host.persist(registry).unwrap();

    tauri::async_runtime::block_on(host.install("example-hello")).unwrap();
    assert!(host.snapshot().registry.installed.contains_key("example-hello"));
    assert!(!host.snapshot().registry.installed["example-hello"].enabled);

    host.enable("example-hello", true).unwrap();
    let until = Instant::now() + Duration::from_secs(8);
    while !host.snapshot().live.get("example-hello").is_some_and(|l| !l.data.quota.is_empty()) && Instant::now() < until {
        std::thread::sleep(Duration::from_millis(20));
    }
    let live = host.snapshot().live;
    assert!(live.contains_key("example-hello"));
    assert_eq!(live["example-hello"].data.quota.len(), 1);
    assert_eq!(live["example-hello"].data.notifications.len(), 1);

    host.enable("example-hello", false).unwrap();
    assert!(host.snapshot().live.is_empty());
    host.uninstall("example-hello").unwrap();
    assert!(host.snapshot().registry.installed.is_empty());

    drop(host);
    let _ = std::fs::remove_dir_all(root);
}
