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
    for (attempt, seconds) in [1, 2, 4, 8, 16, 32].into_iter().enumerate() {
        assert_eq!(process::restart_delay(attempt as u32), Some(Duration::from_secs(seconds)));
    }
    assert_eq!(process::restart_delay(6), None);
    assert_eq!(process::restart_delay(u32::MAX), None);
}

#[test]
fn all_bundled_manifests_are_accepted() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../plugins");
    let mut count = 0;
    for entry in std::fs::read_dir(root).unwrap().flatten() {
        let path = entry.path().join("fly-island-plugin.json");
        if path.is_file() {
            assert!(Manifest::parse(&std::fs::read(&path).unwrap()).is_ok(), "{}", path.display());
            count += 1;
        }
    }
    assert_eq!(count, 8);
}

#[test]
fn windows_device_names_and_archive_aliases_are_rejected() {
    for path in ["CON.txt", "aux.exe", "dir/COM1.log", "LPT9.exe", "LPT¹.log", "a./file", "a /file", "x:stream", "dir//x", "dir/../x"] {
        assert!(!super::manifest::relative_path(path), "{path}");
        let root = temporary(&format!("path-{}", path.bytes().map(u32::from).sum::<u32>()));
        let bytes = zip(&[(path, b"bad")]);
        assert!(packages::extract(&bytes, &root, &entry(&bytes, String::new())).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn stderr_does_not_leak_split_or_multiline_credentials() {
    let root = temporary("redaction");
    let secret = "sensitive-token".to_owned();
    let mut input = format!("{}{}\n", "x".repeat(8188), secret);
    input.push_str("before sensitive-token after\nfirst-secret\nsecond-secret\nunterminated-sensitive");
    let path = root.join("log");
    process::log_stderr(Cursor::new(input), &path, &[secret, "first-secret\nsecond-secret".into()]);
    let raw = std::fs::read_to_string(path).unwrap();
    assert!(!raw.contains("sensitive") && !raw.contains("first-secret") && !raw.contains("second-secret"));
    assert!(raw.contains("before [redacted] after"));
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn download_policy_and_file_limits_are_enforced() {
    for (url, dev, allowed) in [
        ("https://github.com/a", false, true), ("http://github.com/a", true, false),
        ("http://127.0.0.1/a", true, true), ("http://127.0.0.1/a", false, false),
        ("https://user:password@example.com/a", false, false), ("file:///C:/a", false, false),
    ] { assert_eq!(packages::network_source_allowed(&reqwest::Url::parse(url).unwrap(), dev), allowed, "{url}"); }
    let root = temporary("local-bound");
    let path = root.join("file"); std::fs::write(&path, [1; 32]).unwrap();
    assert!(tauri::async_runtime::block_on(packages::download(path.to_str().unwrap(), true, 16)).is_err());
    assert!(tauri::async_runtime::block_on(packages::download(path.to_str().unwrap(), false, 64)).is_err());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn redirects_cannot_escape_the_local_http_policy() {
    use std::{io::Read, net::TcpListener};
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/index", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        let mut request = [0; 2048]; let _ = stream.read(&mut request).unwrap();
        stream.write_all(b"HTTP/1.1 302 Found\r\nLocation: http://example.com/not-local\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
    });
    let error = tauri::async_runtime::block_on(packages::download(&url, true, 1024)).unwrap_err();
    server.join().unwrap();
    assert!(!error.contains("example.com"), "URL omitted from diagnostics: {error}");
}

#[test]
fn incompatible_plugin_does_not_hide_compatible_index_entries() {
    let good = entry(b"zip", "https://example.com/a.zip".into());
    let mut future = good.clone(); future.id = "future-plugin".into(); future.min_app_version = "999.0.0".into();
    let entries = packages::parse_index(&serde_json::to_vec(&vec![good, future]).unwrap()).unwrap();
    assert_eq!(entries.len(), 1); assert_eq!(entries[0].id, "example-hello");
}

#[test]
fn registry_drops_secret_and_unknown_plaintext_settings() {
    let root = temporary("registry-settings");
    let mut m = manifest();
    m.settings.push(serde_json::from_value(json!({"key":"api_key","label":{"zh-CN":"密钥","en":"Key"},"type":"secret","default":""})).unwrap());
    let p = super::storage::Installed { manifest:m, enabled:false, directory:root.clone(), development:false,
        settings: [("api_key".into(), json!("never-persist")), ("unknown".into(), json!(true))].into() };
    let registry = super::storage::Registry { installed:[(p.manifest.id.clone(), p)].into(), ..Default::default() };
    super::storage::save(&root, &registry).unwrap();
    assert!(super::storage::load(&root).installed["example-hello"].settings.is_empty());
    std::fs::remove_dir_all(root).unwrap();
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
    assert!(tauri::async_runtime::block_on(host.install("not-in-index")).is_err());
    tauri::async_runtime::block_on(host.install("example-hello")).unwrap();
    assert!(!host.snapshot().registry.installed["example-hello"].enabled);
    host.enable("example-hello", true).unwrap();
    let until = Instant::now() + Duration::from_secs(8);
    while !host.snapshot().live.get("example-hello").is_some_and(|l| !l.data.quota.is_empty()) && Instant::now() < until { std::thread::sleep(Duration::from_millis(20)); }
    assert_eq!(host.snapshot().live["example-hello"].data.notifications.len(), 1);
    assert_eq!(host.action("example-hello", "hello").unwrap(), json!(true));
    host.shutdown();
    assert!(host.workers.lock().unwrap().is_empty() && host.snapshot().live.is_empty());
    host.enable("example-hello", true).unwrap();
    let until = Instant::now() + Duration::from_secs(8);
    while !host.snapshot().live.get("example-hello").is_some_and(|l| !l.data.quota.is_empty()) && Instant::now() < until { std::thread::sleep(Duration::from_millis(20)); }
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
