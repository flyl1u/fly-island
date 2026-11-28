use std::{io::{Cursor, Write}, sync::{Arc, Mutex}, time::{Duration, Instant}};
use serde_json::json;
use sha2::{Digest, Sha256};
use super::{download, manifest::Manifest, packages::{self, IndexEntry}, process::{self, Worker}, protocol, service::Host};

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
    // A plugin page: the manifest names one of the host's icons, and the panel may only use
    // declared actions.
    let mut with_panel = serde_json::to_value(&m).unwrap();
    with_panel["permissions"] = json!(["panel"]);
    with_panel["contributes"] = json!(["panel"]);
    with_panel["panel"] = json!({"icon": "battery"});
    with_panel["actions"] = json!([{"id": "refresh", "label": {"zh-CN": "重新扫描", "en": "Scan again"}}]);
    let page = Manifest::parse(&serde_json::to_vec(&with_panel).unwrap()).unwrap();
    let good = json!({"panel": {"headline": "2 个设备", "note": null, "rows": [{"id": "a", "title": "A", "detail": null, "percent": 59, "countdownTo": null, "tone": "warning"}], "actions": ["refresh"], "attention": true}});
    let parsed = protocol::parse_publish(&publish(good.clone()), &page).unwrap().unwrap();
    assert!(parsed.panel.is_some_and(|panel| panel.rows.len() == 1 && panel.attention));
    assert!(protocol::parse_publish(&publish(good.clone()), &m).is_err(), "a panel needs its contribution");
    for (field, value) in [("percent", json!(101)), ("tone", json!("loud")), ("countdownTo", json!(-1))] {
        let mut bad = good.clone();
        bad["panel"]["rows"][0][field] = value;
        assert!(protocol::parse_publish(&publish(bad), &page).is_err(), "{field}");
    }
    // A fixed duration instead of a deadline: one or the other, never both, never negative.
    let mut finished = good.clone();
    finished["panel"]["rows"][0]["durationMs"] = json!(913_000_i64);
    assert!(protocol::parse_publish(&publish(finished.clone()), &page).is_ok());
    let mut bad_total = finished.clone();
    bad_total["panel"]["rows"][0]["durationMs"] = json!(-5);
    assert!(protocol::parse_publish(&publish(bad_total), &page).is_err(), "a total cannot be negative");
    let mut both = finished;
    both["panel"]["rows"][0]["countdownTo"] = json!(1_700_000_060_000_i64);
    assert!(protocol::parse_publish(&publish(both), &page).is_err(), "a row is a deadline or a total");
    // A running total counts up from its anchor instead of down to a deadline.
    let mut running = good.clone();
    running["panel"]["rows"][0]["countUpFrom"] = json!(1_700_000_000_000_i64);
    assert!(protocol::parse_publish(&publish(running.clone()), &page).is_ok());
    for from in [json!(0), json!(-5)] {
        let mut bad = running.clone();
        bad["panel"]["rows"][0]["countUpFrom"] = from.clone();
        assert!(protocol::parse_publish(&publish(bad), &page).is_err(), "countUpFrom {from}");
    }
    let mut running_done = running.clone();
    running_done["panel"]["rows"][0]["countdownTo"] = json!(1_700_000_060_000_i64);
    assert!(protocol::parse_publish(&publish(running_done), &page).is_err(), "a total does not end at a deadline");
    let mut running_fixed = running;
    running_fixed["panel"]["rows"][0]["durationMs"] = json!(60_000);
    assert!(protocol::parse_publish(&publish(running_fixed), &page).is_err(), "a total is not a fixed duration");
    // A running timer names the span it moves over, so the host can step the bar with the digits.
    let mut spanned = good.clone();
    spanned["panel"]["rows"][0]["countdownTo"] = json!(1_700_000_060_000_i64);
    spanned["panel"]["rows"][0]["totalMs"] = json!(1_200_000_i64);
    assert!(protocol::parse_publish(&publish(spanned.clone()), &page).is_ok());
    for total in [json!(0), json!(-1)] {
        let mut bad = spanned.clone();
        bad["panel"]["rows"][0]["totalMs"] = total.clone();
        assert!(protocol::parse_publish(&publish(bad), &page).is_err(), "totalMs {total}");
    }
    let mut span_only = good.clone();
    span_only["panel"]["rows"][0]["totalMs"] = json!(1_200_000_i64);
    assert!(protocol::parse_publish(&publish(span_only), &page).is_err(), "a span needs a running timer");
    let mut undeclared_action = good.clone();
    undeclared_action["panel"]["actions"] = json!(["rest_now"]);
    assert!(protocol::parse_publish(&publish(undeclared_action), &page).is_err());
    let mut bad_manifest = with_panel.clone();
    bad_manifest["panel"] = json!({"icon": "usb"});
    assert!(Manifest::parse(&serde_json::to_vec(&bad_manifest).unwrap()).is_err(), "an icon the host cannot draw");
    let mut no_meta = with_panel.clone();
    no_meta.as_object_mut().unwrap().remove("panel");
    assert!(Manifest::parse(&serde_json::to_vec(&no_meta).unwrap()).is_err(), "contribution without a page");
    for (attempt, seconds) in [1, 2, 4, 8, 16, 32].into_iter().enumerate() {
        assert_eq!(process::restart_delay(attempt as u32), Some(Duration::from_secs(seconds)));
    }
    assert_eq!(process::restart_delay(6), None);
    assert_eq!(process::restart_delay(u32::MAX), None);
}

#[test]
fn all_bundled_manifests_are_accepted() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../plugins");
    let mut ids = std::collections::BTreeSet::new();
    for entry in std::fs::read_dir(root).unwrap().flatten() {
        let path = entry.path().join("fly-island-plugin.json");
        if path.is_file() {
            let manifest = Manifest::parse(&std::fs::read(&path).unwrap())
                .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
            assert!(ids.insert(manifest.id), "Duplicate plugin manifest at {}", path.display());
        }
    }
    assert!(ids.contains("example-hello"));
    let market: Vec<String> = serde_json::from_str(include_str!("../../../plugins/market-packages.json")).unwrap();
    assert!(market.iter().all(|id| ids.contains(id)));
}

#[test]
fn eye_care_upgrade_rounds_legacy_durations_up_to_whole_minutes() {
    use super::storage::{upgrade_settings, Installed};
    let new = Manifest::parse(include_bytes!("../../../plugins/eye-care/fly-island-plugin.json")).unwrap();
    let mut old = new.clone();
    let rest = old.settings.iter_mut().find(|s| s.key == "rest-minutes").unwrap();
    rest.key = "rest".into();
    rest.kind = "text".into();
    rest.min = None;
    rest.max = None;
    rest.default = json!("20");
    let mut previous = Installed { manifest: old, enabled: true, directory: Default::default(),
        development: false, settings: Default::default() };
    assert_eq!(upgrade_settings(Some(&previous), &new)["rest-minutes"], "1");
    previous.settings.insert("rest".into(), json!("150"));
    let migrated = upgrade_settings(Some(&previous), &new);
    assert_eq!(migrated["rest-minutes"], "3");
    assert!(!migrated.contains_key("rest"));
    previous.settings.insert("rest-minutes".into(), json!("3"));
    assert_eq!(upgrade_settings(Some(&previous), &new)["rest-minutes"], "3");
    for (old, expected) in [("2.5", "3"), ("0.3333333333333333", "1"), ("60", "60")] {
        previous.settings.insert("rest-minutes".into(), json!(old));
        assert_eq!(upgrade_settings(Some(&previous), &new)["rest-minutes"], expected);
    }
    assert!(!upgrade_settings(None, &new).contains_key("rest-minutes"));
}

#[test]
fn integer_settings_reject_fractions_and_enforce_manifest_bounds() {
    let manifest = Manifest::parse(include_bytes!("../../../plugins/eye-care/fly-island-plugin.json")).unwrap();
    for (key, max) in [("period", 720), ("rest-minutes", 60), ("idle", 120)] {
        let setting = manifest.settings.iter().find(|s| s.key == key).unwrap();
        assert!(setting.accepts(&json!("1")));
        assert!(setting.accepts(&json!(max.to_string())));
        for invalid in ["", "0", "1.5", "-1", "1e1", "NaN", " 2 ", "4294967296"] {
            assert!(!setting.accepts(&json!(invalid)), "{key}: {invalid}");
        }
        assert!(!setting.accepts(&json!((max + 1).to_string())));
        assert!(!setting.accepts(&json!(1)));
    }
    for (min, max) in [(Some(3), Some(2)), (None, Some(2)), (Some(1), None)] {
        let mut invalid = manifest.clone();
        let period = invalid.settings.iter_mut().find(|s| s.key == "period").unwrap();
        period.min = min;
        period.max = max;
        assert!(invalid.validate().is_err());
    }
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
    ] { assert_eq!(download::network_source_allowed(&reqwest::Url::parse(url).unwrap(), dev), allowed, "{url}"); }
    let fetch = |url: &str, local, limit| tauri::async_runtime::block_on(download::fetch(url, local, limit, Default::default()));
    let root = temporary("local-bound");
    let path = root.join("file"); std::fs::write(&path, [1; 32]).unwrap();
    assert!(fetch(path.to_str().unwrap(), true, 16).is_err());
    assert!(fetch(path.to_str().unwrap(), false, 64).is_err());
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
    let error = tauri::async_runtime::block_on(download::fetch(&url, true, 1024, Default::default())).unwrap_err();
    server.join().unwrap();
    assert_eq!(error.code, download::REFUSED);
    assert!(!error.detail.contains("example.com"), "URL omitted from diagnostics: {}", error.detail);
}

#[test]
fn incompatible_plugin_does_not_hide_compatible_index_entries() {
    let good = entry(b"zip", "https://example.com/a.zip".into());
    let mut future = good.clone(); future.id = "future-plugin".into(); future.min_app_version = "999.0.0".into();
    let entries: Vec<_> = packages::parse_index(&serde_json::to_vec(&vec![good, future]).unwrap()).unwrap()
        .into_iter().filter(IndexEntry::compatible).collect();
    assert_eq!(entries.len(), 1); assert_eq!(entries[0].id, "example-hello");
}

#[test]
fn market_install_errors_report_the_failing_stage() {
    let root = temporary("market-error-codes");
    let host = Host::new(root.join("data"), None, true).unwrap();
    let index = root.join("index.json");
    let archive = root.join("bundle.zip");
    let mut registry = host.snapshot().registry;
    registry.developer_mode = true;
    registry.index_url = index.to_string_lossy().into_owned();
    host.persist(registry).unwrap();
    let install_error = || tauri::async_runtime::block_on(host.install("example-hello", false)).unwrap_err();
    assert_eq!(install_error(), "plugin_index_unavailable");
    std::fs::write(&index, b"not JSON").unwrap();
    assert_eq!(install_error(), "plugin_index_incompatible");
    std::fs::write(&index, b"[]").unwrap();
    assert_eq!(install_error(), "plugin_not_listed");
    let mut bundle = entry(b"not ZIP", archive.to_string_lossy().into_owned());
    let update_index = |bundle: &IndexEntry| std::fs::write(&index, serde_json::to_vec(&[bundle]).unwrap()).unwrap();
    bundle.min_app_version = "999.0.0".into();
    update_index(&bundle);
    assert_eq!(install_error(), "plugin_index_incompatible");
    bundle.min_app_version = env!("CARGO_PKG_VERSION").into();
    update_index(&bundle);
    assert_eq!(install_error(), "plugin_package_download_failed");
    std::fs::write(&archive, b"wrong bytes").unwrap();
    assert_eq!(install_error(), "plugin_package_integrity_failed");
    std::fs::write(&archive, b"not ZIP").unwrap();
    assert_eq!(install_error(), "plugin_package_invalid");
    let log = std::fs::read_to_string(host.root.join("plugin-logs/catalog.log")).unwrap();
    assert!(log.contains("plugin_package_integrity_failed: Plugin SHA-256 or size mismatch"));
    assert!(log.contains("Requires Fly Island 999.0.0"));
    assert!(host.snapshot().registry.installed.is_empty());
    assert!(!host.root.join("plugins/.staging-example-hello").exists());
    drop(host);
    std::fs::remove_dir_all(root).unwrap();
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
    let host = Host::new(root.join("data"), None, true).unwrap(); let mut registry = host.snapshot().registry;
    registry.developer_mode = true; registry.index_url = index.to_string_lossy().into_owned(); host.persist(registry).unwrap();
    assert!(tauri::async_runtime::block_on(host.install("not-in-index", false)).is_err());
    tauri::async_runtime::block_on(host.install("example-hello", false)).unwrap();
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
        assert!(std::env::var_os("FLY_ISLAND_REQUIRE_PLUGIN_ARTIFACTS").is_none(), "Build the market packages before running this test");
        return;
    }
    const ISOLATED: &str = "FLY_ISLAND_PLUGIN_TEST_PROFILE";
    if std::env::var_os(ISOLATED).is_none() {
        let profile = temporary("built-index-profile");
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "plugin_host::tests::built_artifacts_index_installs_and_runs", "--nocapture"])
            .env(ISOLATED, &profile).env("USERPROFILE", &profile).env("HOME", &profile)
            .env("APPDATA", &profile).env("LOCALAPPDATA", &profile).env_remove("FLY_ISLAND_PLUGINS_INDEX")
            .status().unwrap();
        std::fs::remove_dir_all(profile).unwrap();
        assert!(status.success());
        return;
    }
    keyring::Entry::store_status().as_ref().unwrap();
    keyring_core::set_default_store(keyring_core::mock::Store::new().unwrap());
    let root = temporary("built-index-test");
    let host = Host::new(root.join("data"), None, true).unwrap();
    let mut registry = host.snapshot().registry;
    registry.developer_mode = true;
    let mut built = packages::parse_index(&std::fs::read(&index_file).unwrap()).unwrap();
    for entry in &mut built {
        let asset = format!("{}-{}-windows-x86_64.zip", entry.id, entry.version);
        assert!(entry.url.ends_with(&format!("/{asset}")));
        let archive = index_file.with_file_name(asset).canonicalize().unwrap();
        entry.url = archive.to_string_lossy().into_owned();
    }
    let local_index = root.join("local-index.json");
    std::fs::write(&local_index, serde_json::to_vec(&built).unwrap()).unwrap();
    registry.index_url = local_index.to_string_lossy().into_owned();
    host.persist(registry).unwrap();

    let entries = tauri::async_runtime::block_on(host.catalog()).unwrap();
    if !entries.iter().any(|entry| entry.id == "example-hello") {
        let approved: Vec<String> = serde_json::from_str(include_str!("../../../plugins/market-packages.json")).unwrap();
        assert!(approved.iter().all(|id| entries.iter().any(|entry| &entry.id == id)));
        assert_eq!(entries.len(), approved.len());
        assert!(!entries.is_empty());
        for entry in entries {
            let id = entry.id.as_str();
            tauri::async_runtime::block_on(host.install(id, false)).unwrap();
            assert!(!host.snapshot().registry.installed[id].enabled);
            match id {
                "eye-care" => {
                    host.enable(id, true).unwrap();
                    let until = Instant::now() + Duration::from_secs(8);
                    while !host.snapshot().live.get(id).is_some_and(|entry| entry.data.panel.is_some()) && Instant::now() < until {
                        std::thread::sleep(Duration::from_millis(20));
                    }
                    assert!(host.snapshot().live[id].data.panel.is_some());
                    host.enable(id, false).unwrap();
                    host.uninstall(id).unwrap();
                }
                "device-battery" => {
                    assert!(host.device_battery().is_err());
                    host.enable(id, true).unwrap();
                    assert!(host.device_battery().is_ok());
                    let bridge = host.snapshot().registry.installed[id].directory.join("device-battery-bridge.exe");
                    let output = std::process::Command::new(bridge).arg("battery").output().unwrap();
                    assert!(output.status.success());
                    let snapshot: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
                    assert!(snapshot["devices"].is_array());
                    host.uninstall(id).unwrap();
                    assert!(host.device_battery().is_err());
                }
                "minimax" => {
                    host.enable(id, true).unwrap();
                    let until = Instant::now() + Duration::from_secs(8);
                    while !host.snapshot().live.get(id).is_some_and(|entry| entry.status == "running") && Instant::now() < until {
                        std::thread::sleep(Duration::from_millis(20));
                    }
                    assert_eq!(host.snapshot().live[id].status, "running");
                    host.uninstall(id).unwrap();
                }
                _ => panic!("Unexpected package in the selected market: {id}"),
            }
        }
        assert!(host.snapshot().registry.installed.is_empty());
        drop(host);
        std::fs::remove_dir_all(root).unwrap();
        return;
    }

    tauri::async_runtime::block_on(host.install("example-hello", false)).unwrap();
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

#[test]
fn disabled_host_does_not_start_fetch_or_change_saved_plugins() {
    let root = temporary("disabled-host");
    let plugin = super::storage::Installed {
        manifest: manifest(), enabled: true, directory: root.join("plugins/example-hello"),
        development: false, settings: Default::default(),
    };
    let registry = super::storage::Registry {
        installed: [(plugin.manifest.id.clone(), plugin)].into(),
        developer_mode: true, index_url: "http://127.0.0.1:1/must-not-fetch".into(),
    };
    super::storage::save(&root, &registry).unwrap();
    let saved = std::fs::read(root.join("plugins-state.json")).unwrap();
    let host = Host::new(root.clone(), None, false).unwrap();
    assert!(host.snapshot().registry.installed.is_empty());
    host.start("example-hello").unwrap();
    assert!(tauri::async_runtime::block_on(host.catalog()).unwrap().is_empty());
    tauri::async_runtime::block_on(host.install("example-hello", false)).unwrap();
    host.enable("example-hello", false).unwrap();
    host.setting("example-hello", "enabled", json!(false)).unwrap();
    host.uninstall("example-hello").unwrap();
    assert_eq!(host.action("example-hello", "hello").unwrap(), serde_json::Value::Null);
    host.persist(Default::default()).unwrap();
    assert!(host.workers.lock().unwrap().is_empty() && host.snapshot().live.is_empty());
    assert!(!root.join("plugins").exists() && !root.join("plugin-logs").exists());
    assert_eq!(std::fs::read(root.join("plugins-state.json")).unwrap(), saved);
    drop(host);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn market_host_only_exposes_approved_non_development_packages() {
    let root = temporary("market-only");
    let host = Host::market(root.clone(), None).unwrap();
    let from = |name: &str, manifest: Manifest, development| super::storage::Installed {
        manifest, enabled: true, directory: root.join("plugins").join(name),
        development, settings: Default::default(),
    };
    let mut registry = host.snapshot().registry;
    registry.developer_mode = true;
    registry.index_url = "http://127.0.0.1:1/local-index".into();
    let eye = Manifest::parse(include_bytes!("../../../plugins/eye-care/fly-island-plugin.json")).unwrap();
    let mini = Manifest::parse(include_bytes!("../../../plugins/minimax/fly-island-plugin.json")).unwrap();
    registry.installed.insert("example-hello".into(), from("example-hello", manifest(), false));
    registry.installed.insert("eye-care".into(), from("eye-care", eye, false));
    registry.installed.insert("minimax".into(), from("minimax", mini, true));
    host.persist(registry).unwrap();
    let public = host.public_snapshot();
    assert!(!public.registry.installed.contains_key("example-hello"));
    assert!(!public.registry.installed.contains_key("minimax"));
    assert!(public.registry.installed.contains_key("eye-care"));
    assert!(!public.registry.developer_mode && public.registry.index_url.is_empty());
    assert!(!host.allows_development());
    assert!(!host.source().1);
    assert!(host.source().0.ends_with("/releases/download/plugins-channel/plugins-index.json"));
    assert!(host.start("example-hello").is_err());
    assert_eq!(
        tauri::async_runtime::block_on(host.install("example-hello", false)).unwrap_err(),
        "Plugin is unavailable in this build"
    );
    assert!(host.start("minimax").is_err());
    assert!(host.uninstall("minimax").is_err());
    assert_eq!(host.snapshot().registry.installed.len(), 3);
    drop(host);
    std::fs::remove_dir_all(root).unwrap();
}

/// Real packages from the published `plugins-channel`, installed into a temporary directory and
/// removed again. Reads the release only. Run by hand:
/// `cargo test --manifest-path src-tauri/Cargo.toml published_market_packages -- --ignored --nocapture`
#[test]
#[ignore = "downloads the published packages from GitHub"]
fn published_market_packages_install() {
    // Removing MiniMax runs its own disconnect step and clears its credential: keep both away
    // from the real profile and Credential Manager.
    const ISOLATED: &str = "FLY_ISLAND_PLUGIN_LIVE_PROFILE";
    if std::env::var_os(ISOLATED).is_none() {
        let profile = temporary("published-profile");
        let status = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "plugin_host::tests::published_market_packages_install", "--ignored", "--nocapture"])
            .env(ISOLATED, &profile).env("USERPROFILE", &profile).env("HOME", &profile)
            .env("APPDATA", &profile).env("LOCALAPPDATA", &profile).env_remove("FLY_ISLAND_PLUGINS_INDEX")
            .status().unwrap();
        std::fs::remove_dir_all(profile).unwrap();
        assert!(status.success());
        return;
    }
    keyring::Entry::store_status().as_ref().unwrap();
    keyring_core::set_default_store(keyring_core::mock::Store::new().unwrap());
    let root = temporary("published-market");
    let host = Host::market(root.clone(), None).unwrap();
    let entries = tauri::async_runtime::block_on(host.catalog()).unwrap();
    assert!(!entries.is_empty(), "the published index lists no approved package");
    let mut failed = Vec::new();
    for entry in entries {
        let started = Instant::now();
        let result = tauri::async_runtime::block_on(host.install(&entry.id, false));
        println!("{} {} ({} bytes): {:?} in {:.1}s", entry.id, entry.version, entry.size, result, started.elapsed().as_secs_f32());
        if result.is_err() {
            failed.push(entry.id);
            continue;
        }
        assert!(host.root.join("plugins").join(&entry.id).join("fly-island-plugin.json").is_file());
        assert!(!host.root.join("plugins").join(format!(".download-{}.zip", entry.id)).exists());
        tauri::async_runtime::block_on(host.remove(&entry.id)).unwrap();
        assert!(!host.root.join("plugins").join(&entry.id).exists());
    }
    if !failed.is_empty() {
        println!("{}", std::fs::read_to_string(host.root.join("plugin-logs/catalog.log")).unwrap_or_default());
    }
    drop(host);
    std::fs::remove_dir_all(root).unwrap();
    assert!(failed.is_empty(), "failed: {failed:?}");
}

#[test]
fn a_choice_offers_two_or_three_options_and_conditional_rows_name_a_real_value() {
    let base = json!({
        "id":"demo","name":{"zh-CN":"演示","en":"Demo"},"description":{"zh-CN":"演示","en":"Demo"},
        "version":"0.1.0","apiVersion":1,"runtime":{"command":"demo.exe"},
        "permissions":[],"contributes":[],
        "settings":[
            {"key":"mode","label":{"zh-CN":"方式","en":"Style"},"type":"choice","default":"a",
             "options":[{"value":"a","label":{"zh-CN":"甲","en":"A"}},{"value":"b","label":{"zh-CN":"乙","en":"B"}}]},
            {"key":"extra","label":{"zh-CN":"其他","en":"Extra"},"type":"toggle","default":true,
             "showWhen":{"key":"mode","value":"a"}}
        ]
    });
    let parse = |value: &serde_json::Value| Manifest::parse(&serde_json::to_vec(value).unwrap());
    let manifest = parse(&base).unwrap();
    let choice = manifest.settings.iter().find(|s| s.key == "mode").unwrap();
    assert!(choice.accepts(&json!("a")) && !choice.accepts(&json!("c")) && !choice.accepts(&json!(true)));
    let mut single = base.clone();
    single["settings"][0]["options"].as_array_mut().unwrap().pop();
    assert!(parse(&single).is_err(), "one option is a select, not a choice");
    let mut wrong = base.clone();
    wrong["settings"][1]["showWhen"]["value"] = json!("zzz");
    assert!(parse(&wrong).is_err(), "a rule names a value its source takes");
    let mut orphan = base.clone();
    orphan["settings"][1]["showWhen"]["key"] = json!("gone");
    assert!(parse(&orphan).is_err(), "a rule names a setting that exists");
    let mut secret = base.clone();
    secret["settings"][0] = json!({"key":"mode","label":{"zh-CN":"方式","en":"Style"},"type":"secret","default":""});
    secret["settings"][1]["showWhen"]["value"] = json!("token");
    assert!(parse(&secret).is_err(), "a secret cannot drive a condition");
}
