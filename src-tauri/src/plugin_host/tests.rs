use serde_json::{json, Value};
use std::{ffi::OsString, path::Path};

use super::manifest::{launch_command, parse_manifest, runtime_requirement, version_at_least, PluginRuntime};
use super::permissions::{method_permission, missing_permissions};
use super::rpc::{error_line, parse_line, result_line, Incoming, INVALID_REQUEST, PARSE_ERROR};
use super::store::{load_state, PluginsState};

fn manifest(overrides: Value) -> String {
    let mut base = json!({
        "id": "dev.example.sync",
        "name": { "zh-CN": "同步", "en": "Sync" },
        "description": { "zh-CN": "说明", "en": "About" },
        "version": "1.0.0",
        "apiVersion": 1,
        "runtime": { "type": "process", "command": "main.mjs" },
        "permissions": ["todos:write", "todos:read", "todos:read"],
        "contributes": { "commands": [{ "id": "sync-now", "title": { "zh-CN": "立即同步", "en": "Sync now" } }] }
    });
    if let (Value::Object(base), Value::Object(overrides)) = (&mut base, overrides) {
        base.extend(overrides);
    }
    base.to_string()
}

fn parse(overrides: Value) -> Result<super::manifest::PluginManifest, String> {
    parse_manifest(&manifest(overrides), "dev.example.sync", "0.2.14")
}

#[test]
fn a_valid_manifest_is_read_and_permissions_are_deduplicated() {
    let manifest = parse(json!({})).expect("valid");
    assert_eq!(manifest.permissions, vec!["todos:read", "todos:write"]);
    assert_eq!(manifest.runtime, PluginRuntime::Process { command: "main.mjs".into(), args: vec![] });
    let described_only = parse(json!({ "runtime": { "type": "none" } })).expect("valid");
    assert_eq!(described_only.runtime, PluginRuntime::None);
}

#[test]
fn api_versions_1_and_2_are_both_accepted() {
    assert_eq!(parse(json!({ "apiVersion": 1 })).expect("v1").api_version, 1);
    assert_eq!(parse(json!({ "apiVersion": 2 })).expect("v2").api_version, 2);
}

/// plugins/schema/ is the protocol's source of truth; the host must match it.
#[test]
fn the_host_matches_the_protocol_description() {
    use super::permissions::{CAPABILITIES, METHODS, PERMISSIONS};
    let rpc: Value = serde_json::from_str(include_str!("../../../plugins/schema/rpc.json")).expect("rpc.json");
    let names = |list: &Value| -> Vec<String> {
        list.as_array().expect("array").iter().map(|item| item["name"].as_str().expect("name").to_string()).collect()
    };
    assert_eq!(names(&rpc["permissions"]), PERMISSIONS);
    let sensitive: Vec<&str> = rpc["permissions"]
        .as_array()
        .expect("permissions")
        .iter()
        .filter(|permission| permission["sensitive"] == true)
        .filter_map(|permission| permission["name"].as_str())
        .collect();
    assert_eq!(sensitive, super::sensitive::SENSITIVE_PERMISSIONS);
    assert!(sensitive.iter().all(|name| PERMISSIONS.contains(name)));
    assert_eq!(names(&rpc["capabilities"]), CAPABILITIES);
    let events: Vec<(String, Option<String>)> = rpc["events"]
        .as_array()
        .expect("events")
        .iter()
        .map(|event| (event["name"].as_str().expect("name").into(), event["permission"].as_str().map(Into::into)))
        .collect();
    let host_events: Vec<(String, Option<String>)> =
        super::events::EVENTS.iter().map(|(name, permission)| ((*name).into(), permission.map(Into::into))).collect();
    assert_eq!(events, host_events);
    assert_eq!(rpc["apiVersions"]["current"], super::manifest::HOST_API_VERSION);
    assert_eq!(rpc["apiVersions"]["min"], super::manifest::MIN_API_VERSION);

    let methods = rpc["methods"].as_array().expect("methods");
    let gated: Vec<(&str, &str)> = methods
        .iter()
        .filter_map(|method| Some((method["name"].as_str()?, method["permission"].as_str()?)))
        .collect();
    assert_eq!(gated, METHODS);
    // Methods without a permission are answered in runtime/dispatch.rs.
    let open: Vec<&str> = methods.iter().filter(|method| method["permission"].is_null()).filter_map(|method| method["name"].as_str()).collect();
    assert_eq!(
        open,
        [
            "host.info",
            "settings.get",
            "ui.setInfo",
            "events.subscribe",
            "events.unsubscribe",
            "storage.get",
            "storage.set",
            "storage.delete",
            "storage.keys"
        ]
    );
    assert!(open.iter().all(|name| method_permission(name).is_none()));

    let schema: Value = serde_json::from_str(include_str!("../../../plugins/schema/manifest.schema.json")).expect("schema");
    assert_eq!(schema["properties"]["permissions"]["items"]["enum"], json!(PERMISSIONS));
    assert_eq!(schema["properties"]["apiVersion"]["maximum"], super::manifest::HOST_API_VERSION);
}

#[test]
fn bad_manifests_say_why() {
    let reason = |overrides: Value| parse(overrides).expect_err("invalid");
    assert!(reason(json!({ "id": "Dev.Example" })).contains("lowercase"));
    assert!(reason(json!({ "id": "dev.other" })).contains("folder"));
    assert!(reason(json!({ "apiVersion": 3 })).contains("version 3"));
    assert!(reason(json!({ "apiVersion": 0 })).contains("version 0"));
    assert!(reason(json!({ "minAppVersion": "0.3.0" })).contains("0.3.0"));
    assert!(reason(json!({ "name": { "zh-CN": "同步", "en": " " } })).contains("name"));
    assert!(reason(json!({ "permissions": ["camera:read"] })).contains("camera:read"));
    assert!(reason(json!({ "runtime": { "type": "process", "command": "../evil.exe" } })).contains("inside"));
    assert!(reason(json!({ "runtime": { "type": "process", "command": "C:\\evil.exe" } })).contains("inside"));
    assert!(reason(json!({ "runtime": { "type": "process", "command": "run.bat" } })).contains(".exe"));
    assert!(reason(json!({ "contributes": { "commands": [{ "id": "a b", "title": { "zh-CN": "x", "en": "x" } }] } })).contains("a b"));
    assert!(reason(json!({ "version": "" })).contains("version"));
    assert!(parse_manifest("{", "dev.example.sync", "1.0.0").expect_err("invalid").contains("not valid"));
}

#[test]
fn runtime_requirement_follows_the_command() {
    let process = |command: &str| PluginRuntime::Process { command: command.into(), args: vec![] };
    assert_eq!(runtime_requirement(&process("bin/app.exe")), "exe");
    assert_eq!(runtime_requirement(&process("main.ps1")), "powershell");
    assert_eq!(runtime_requirement(&process("main.mjs")), "node");
    assert_eq!(runtime_requirement(&PluginRuntime::None), "none");
}

#[test]
fn versions_compare_by_number() {
    assert!(version_at_least("0.2.14", "0.2.9"));
    assert!(version_at_least("0.2.14", "0.2.14"));
    assert!(version_at_least("1.0", "0.9.9"));
    assert!(version_at_least("0.3.0-beta", "0.3"));
    assert!(!version_at_least("0.2.14", "0.10.0"));
    assert!(!version_at_least("0.2", "0.2.1"));
}

#[test]
fn launch_uses_the_right_interpreter() {
    let dir = Path::new("C:\\plugins\\dev.example.sync");
    let args = vec!["--flag".to_string()];

    let (program, arguments) = launch_command(dir, "bin/app.exe", &args).expect("exe");
    assert_eq!(program, dir.join("bin/app.exe").into_os_string());
    assert_eq!(arguments, vec![OsString::from("--flag")]);

    let (program, arguments) = launch_command(dir, "main.mjs", &args).expect("node");
    assert_eq!(program, OsString::from("node"));
    assert_eq!(arguments, vec![dir.join("main.mjs").into_os_string(), OsString::from("--flag")]);

    let (program, arguments) = launch_command(dir, "main.ps1", &[]).expect("powershell");
    assert_eq!(program, OsString::from("powershell.exe"));
    assert_eq!(arguments.last(), Some(&dir.join("main.ps1").into_os_string()));
    assert!(arguments.contains(&OsString::from("-File")));
}

#[test]
fn methods_need_their_permission() {
    assert_eq!(method_permission("todos.list"), Some(("todos.list", "todos:read")));
    assert_eq!(method_permission("note.set"), Some(("note.set", "notes:write")));
    assert_eq!(method_permission("agentStatus.report"), Some(("agentStatus.report", "agent-status:write")));
    assert_eq!(method_permission("clipboard.read"), None);

    let requested = vec!["todos:read".to_string(), "todos:write".to_string()];
    assert_eq!(missing_permissions(&requested, &["todos:read".to_string()]), vec!["todos:write"]);
    assert!(missing_permissions(&requested, &requested).is_empty());
}

#[test]
fn rpc_lines_are_parsed_and_written() {
    assert_eq!(
        parse_line(r#"{"jsonrpc":"2.0","id":7,"method":"todos.list"}"#),
        Incoming::Request { id: json!(7), method: "todos.list".into(), params: Value::Null }
    );
    assert_eq!(
        parse_line(r#"{"jsonrpc":"2.0","method":"log","params":{"message":"hi"}}"#),
        Incoming::Notification { method: "log".into(), params: json!({ "message": "hi" }) }
    );
    assert_eq!(parse_line(r#"{"jsonrpc":"2.0","id":1,"result":{}}"#), Incoming::Response);
    assert!(matches!(parse_line("nope"), Incoming::Invalid { code: PARSE_ERROR, .. }));
    assert!(matches!(
        parse_line(r#"{"id":1,"method":"x"}"#),
        Incoming::Invalid { code: INVALID_REQUEST, id, .. } if id == json!(1)
    ));
    assert!(matches!(
        parse_line(r#"{"jsonrpc":"2.0","id":{"a":1},"method":"x"}"#),
        Incoming::Invalid { id: Value::Null, .. }
    ));

    let ok: Value = serde_json::from_str(&result_line(&json!("a"), json!([1]))).expect("json");
    assert_eq!(ok, json!({ "jsonrpc": "2.0", "id": "a", "result": [1] }));
    let failed: Value = serde_json::from_str(&error_line(&json!(2), -32001, "no", Some(json!({ "status": 403 })))).expect("json");
    assert_eq!(failed["error"], json!({ "code": -32001, "message": "no", "data": { "status": 403 } }));
}

#[test]
fn a_missing_or_broken_state_file_allows_nothing() {
    let dir = std::env::temp_dir().join(format!("focusd-plugins-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let path = dir.join("plugins.json");
    assert_eq!(load_state(&path), PluginsState::default());
    std::fs::write(&path, "[]").expect("write");
    assert!(!load_state(&path).allow_third_party);
    std::fs::write(&path, r#"{"allowThirdParty":true,"plugins":{"a.b":{"enabled":true}}}"#).expect("write");
    let state = load_state(&path);
    assert!(state.allow_third_party && state.plugins["a.b"].enabled);
    let _ = std::fs::remove_dir_all(&dir);
}

mod market_tests {
    use std::io::Write;

    use super::super::market::{extract_package, incompatibility, install_package, parse_index, verify_package, MarketEntry};

    const INDEX: &str = include_str!("../../../plugins/index.json");
    const PACKAGE: &[u8] = include_bytes!("../../../plugins/packages/dev.focusd.todo-digest-1.2.0.zip");

    fn example_entry() -> MarketEntry {
        parse_index(INDEX)
            .expect("index")
            .into_iter()
            .find(|entry| entry.id == "dev.focusd.todo-digest")
            .expect("example in index")
    }

    const SIGNATURE: &str = include_str!("../../../plugins/index.json.sig");

    #[test]
    fn the_repository_index_is_signed_by_a_trusted_key() {
        use super::super::signature::{verify_index, TRUSTED_KEYS};
        verify_index(INDEX, SIGNATURE, TRUSTED_KEYS).expect("signed");
        // The same index with CRLF line ends (a Windows checkout) still verifies.
        let crlf = INDEX.replace("\r\n", "\n").replace('\n', "\r\n");
        verify_index(&crlf, SIGNATURE, TRUSTED_KEYS).expect("CRLF");

        let tampered = INDEX.replace("\"version\": \"1.2.0\"", "\"version\": \"1.2.1\"");
        assert_ne!(tampered, INDEX);
        assert!(verify_index(&tampered, SIGNATURE, TRUSTED_KEYS).expect_err("tampered").contains("does not match"));

        let mut signature: serde_json::Value = serde_json::from_str(SIGNATURE).expect("json");
        signature["keyId"] = "0000000000000000".into();
        assert!(verify_index(INDEX, &signature.to_string(), TRUSTED_KEYS).expect_err("unknown key").contains("does not trust"));
        assert!(verify_index(INDEX, "", TRUSTED_KEYS).expect_err("missing").contains("missing"));
        assert!(verify_index(INDEX, r#"{"keyId":"7ee2729370070df6","signature":"AAAA"}"#, TRUSTED_KEYS).is_err());
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("focusd-market-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn the_repository_index_parses_and_its_package_checks_out() {
        let entry = example_entry();
        let download: serde_json::Value = serde_json::to_value(&entry).expect("json")["download"].clone();
        let download = serde_json::from_value(download).expect("download");
        verify_package(PACKAGE, &download).expect("checksum matches");
        assert!(verify_package(&PACKAGE[1..], &download).is_err());
        let mut tampered = PACKAGE.to_vec();
        let last = tampered.len() - 1;
        tampered[last] ^= 1;
        assert!(verify_package(&tampered, &download).expect_err("tampered").contains("checksum"));
        assert_eq!(incompatibility(&entry, "0.2.14"), None);
    }

    #[test]
    fn bad_indexes_and_entries_are_rejected() {
        assert!(parse_index(r#"{"version":2,"plugins":[]}"#).expect_err("format").contains("format 2"));
        assert!(parse_index("nope").is_err());
        let mut index: serde_json::Value = serde_json::from_str(INDEX).expect("json");
        let good = serde_json::to_value(example_entry()).expect("json");
        let good = index["plugins"]
            .as_array()
            .and_then(|plugins| plugins.iter().find(|plugin| plugin["id"] == good["id"]))
            .cloned()
            .expect("example in index");
        let mut http = good.clone();
        http["id"] = "a.http".into();
        http["download"]["url"] = "http://example.com/x.zip".into();
        let mut bad_hash = good.clone();
        bad_hash["id"] = "a.hash".into();
        bad_hash["download"]["sha256"] = "xyz".into();
        let mut work_dir = good.clone();
        work_dir["id"] = ".installing-x".into();
        index["plugins"] = serde_json::json!([http, good, bad_hash, work_dir, "junk"]);
        let entries = parse_index(&index.to_string()).expect("index");
        assert_eq!(entries.iter().map(|entry| entry.id.as_str()).collect::<Vec<_>>(), vec!["dev.focusd.todo-digest"]);
    }

    #[test]
    fn installing_twice_replaces_the_old_version() {
        let plugins = temp_dir("install");
        let entry = example_entry();
        install_package(&plugins, &entry, PACKAGE, "0.2.14").expect("install");
        let target = plugins.join("dev.focusd.todo-digest");
        assert!(target.join("focusd-plugin.json").is_file());
        assert!(target.join("lib").join("focusd.ps1").is_file());

        std::fs::write(target.join("stale.txt"), "from the old version").expect("write");
        install_package(&plugins, &entry, PACKAGE, "0.2.14").expect("update");
        assert!(!target.join("stale.txt").exists());
        let names: Vec<String> = std::fs::read_dir(&plugins)
            .expect("list")
            .map(|item| item.expect("entry").file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["dev.focusd.todo-digest"], "no work folders left behind");
        let _ = std::fs::remove_dir_all(&plugins);
    }

    #[test]
    fn packages_that_do_not_match_the_index_are_not_installed() {
        let plugins = temp_dir("mismatch");
        let mut entry = serde_json::to_value(example_entry()).expect("json");
        entry["version"] = "9.9.9".into();
        let entry: MarketEntry = serde_json::from_value(entry).expect("entry");
        assert!(install_package(&plugins, &entry, PACKAGE, "0.2.14").expect_err("version").contains("9.9.9"));

        let mut entry = serde_json::to_value(example_entry()).expect("json");
        entry["permissions"] = serde_json::json!(["todos:read"]);
        let entry: MarketEntry = serde_json::from_value(entry).expect("entry");
        assert!(install_package(&plugins, &entry, PACKAGE, "0.2.14").expect_err("permissions").contains("notes:write"));
        assert_eq!(std::fs::read_dir(&plugins).expect("list").count(), 0);
        let _ = std::fs::remove_dir_all(&plugins);
    }

    #[test]
    fn paths_that_leave_the_folder_are_refused() {
        let mut bytes = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(std::io::Cursor::new(&mut bytes));
            let options = zip::write::SimpleFileOptions::default();
            writer.start_file("../escape.txt", options).expect("start");
            writer.write_all(b"x").expect("write");
            writer.finish().expect("finish");
        }
        let dir = temp_dir("escape");
        let target = dir.join("plugin");
        assert!(extract_package(&bytes, &target).expect_err("unsafe").contains("unsafe path"));
        assert!(!dir.join("escape.txt").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

mod settings_tests {
    use serde_json::{json, Map, Value};

    use super::super::settings::{coerce, parse_info, resolve, validate_specs, SettingSpec};

    fn specs() -> Vec<SettingSpec> {
        serde_json::from_value(json!([
            { "key": "allowWrite", "type": "boolean", "title": { "zh-CN": "允许修改", "en": "Allow changes" }, "default": false },
            { "key": "interval", "type": "number", "title": { "zh-CN": "间隔", "en": "Interval" }, "min": 1, "max": 60, "default": 30 },
            { "key": "name", "type": "string", "title": { "zh-CN": "名称", "en": "Name" } },
            { "key": "mode", "type": "select", "title": { "zh-CN": "模式", "en": "Mode" },
              "options": [{ "value": "fast", "title": { "zh-CN": "快", "en": "Fast" } }, { "value": "slow", "title": { "zh-CN": "慢", "en": "Slow" } }] }
        ]))
        .expect("specs")
    }

    #[test]
    fn values_are_checked_against_their_type() {
        let specs = specs();
        validate_specs(&specs).expect("valid");
        assert_eq!(coerce(&specs[0], &json!(true)), Ok(json!(true)));
        assert!(coerce(&specs[0], &json!("yes")).is_err());
        assert_eq!(coerce(&specs[1], &json!(5)), Ok(json!(5)));
        assert!(coerce(&specs[1], &json!(0)).is_err());
        assert!(coerce(&specs[1], &json!(61)).is_err());
        assert!(coerce(&specs[2], &json!("x".repeat(1001))).is_err());
        assert_eq!(coerce(&specs[3], &json!("slow")), Ok(json!("slow")));
        assert!(coerce(&specs[3], &json!("medium")).is_err());
    }

    #[test]
    fn resolving_fills_defaults_and_drops_stale_values() {
        let mut stored = Map::new();
        stored.insert("interval".into(), json!(99)); // out of range now
        stored.insert("mode".into(), json!("slow"));
        stored.insert("removed".into(), json!(1));
        let resolved = resolve(&specs(), &stored);
        assert_eq!(
            Value::Object(resolved),
            json!({ "allowWrite": false, "interval": 30, "name": "", "mode": "slow" })
        );
    }

    #[test]
    fn bad_declarations_are_refused() {
        let declare = |spec: Value| validate_specs(&serde_json::from_value::<Vec<SettingSpec>>(json!([spec])).expect("parse"));
        let title = json!({ "zh-CN": "x", "en": "x" });
        assert!(declare(json!({ "key": "a b", "type": "boolean", "title": title })).is_err());
        assert!(declare(json!({ "key": "a", "type": "select", "title": title })).is_err());
        assert!(declare(json!({ "key": "a", "type": "number", "title": title, "max": 3, "default": 9 })).is_err());
        assert!(declare(json!({ "key": "a", "type": "boolean", "title": { "zh-CN": "x", "en": "" } })).is_err());
        let twice = serde_json::from_value::<Vec<SettingSpec>>(json!([
            { "key": "a", "type": "boolean", "title": title },
            { "key": "a", "type": "string", "title": title }
        ]))
        .expect("parse");
        assert!(validate_specs(&twice).is_err());
    }

    #[test]
    fn info_items_are_limited() {
        let label = json!({ "zh-CN": "地址", "en": "Address" });
        let items = parse_info(&json!({ "items": [{ "label": label, "value": "http://127.0.0.1:1/v1", "copy": true }] })).expect("valid");
        assert_eq!(items.len(), 1);
        assert!(parse_info(&json!({})).expect("empty clears").is_empty());
        assert!(parse_info(&json!({ "items": [{ "label": label, "value": "x".repeat(501) }] })).is_err());
        assert!(parse_info(&json!({ "items": [{ "label": "plain", "value": "x" }] })).is_err());
        let many: Vec<Value> = (0..11).map(|_| json!({ "label": label, "value": "x" })).collect();
        assert!(parse_info(&json!({ "items": many })).is_err());
    }
}

mod builtin_tests {
    use std::path::PathBuf;

    use super::super::builtin::{manifests, LOCAL_API_ALLOW_WRITE, LOCAL_API_ID};
    use super::super::manifest::{parse_manifest, PluginRuntime};
    use super::super::store::PluginsState;
    use super::super::registry::migrate_local_api;
    use super::super::InstalledPlugin;

    fn installed() -> Vec<InstalledPlugin> {
        manifests("0.2.14")
            .into_iter()
            .map(|(id, manifest)| InstalledPlugin { folder: id.to_string(), dir: PathBuf::new(), manifest, builtin: true })
            .collect()
    }

    #[test]
    fn the_local_api_manifest_is_valid() {
        let plugins = installed();
        let manifest = plugins[0].manifest.as_ref().expect("valid built-in manifest");
        assert_eq!(manifest.id, LOCAL_API_ID);
        assert_eq!(manifest.runtime, PluginRuntime::Builtin);
        assert!(manifest.permissions.contains(&"agent-status:write".to_string()));
    }

    #[test]
    fn plugins_from_disk_cannot_claim_builtin() {
        let text = r#"{ "id": "dev.sneaky", "name": { "zh-CN": "x", "en": "x" }, "version": "1", "apiVersion": 1, "runtime": { "type": "builtin" } }"#;
        assert!(parse_manifest(text, "dev.sneaky", "0.2.14").expect_err("refused").contains("builtin"));
    }

    #[test]
    fn the_old_local_api_switches_carry_over_once() {
        let plugins = installed();

        let mut state = PluginsState::default();
        assert!(migrate_local_api(&mut state, &plugins, Some((true, true))));
        let grant = &state.plugins[LOCAL_API_ID];
        assert!(grant.enabled);
        assert_eq!(grant.granted_permissions.len(), 5);
        assert_eq!(grant.settings[LOCAL_API_ALLOW_WRITE], true);
        // Already migrated (or set by the user): left alone.
        assert!(!migrate_local_api(&mut state, &plugins, Some((false, false))));
        assert!(state.plugins[LOCAL_API_ID].enabled);

        let mut never_used = PluginsState::default();
        assert!(!migrate_local_api(&mut never_used, &plugins, Some((false, false))));
        assert!(never_used.plugins.is_empty());
        assert!(!migrate_local_api(&mut never_used, &plugins, None));

        let mut read_only = PluginsState::default();
        assert!(migrate_local_api(&mut read_only, &plugins, Some((false, true))));
        assert!(!read_only.plugins[LOCAL_API_ID].enabled);
        assert!(read_only.plugins[LOCAL_API_ID].granted_permissions.is_empty());
    }
}

#[test]
fn notifications_are_checked_and_clamped() {
    use super::notify::parse_notification;
    let plain = parse_notification(&json!({ "title": "  Done  " })).expect("valid");
    assert_eq!((plain.title.as_str(), plain.body.as_str(), plain.duration_ms), ("Done", "", 5000));
    assert!(plain.actions.is_empty());
    let full = parse_notification(&json!({
        "title": "Break", "body": "5 minutes", "durationMs": 60000,
        "actions": [{ "id": "skip", "title": "Skip" }, { "id": "snooze-5", "title": "Later" }]
    }))
    .expect("valid");
    assert_eq!(full.duration_ms, 15000);
    assert_eq!(full.actions.len(), 2);
    assert_eq!(parse_notification(&json!({ "title": "x", "durationMs": 10 })).expect("valid").duration_ms, 2000);

    let reason = |params: Value| parse_notification(&params).expect_err("invalid");
    assert!(reason(json!({})).contains("title"));
    assert!(reason(json!({ "title": " " })).contains("empty"));
    assert!(reason(json!({ "title": "x".repeat(81) })).contains("80"));
    assert!(reason(json!({ "title": "x", "body": 3 })).contains("body"));
    assert!(reason(json!({ "title": "x", "durationMs": "long" })).contains("durationMs"));
    assert!(reason(json!({ "title": "x", "actions": [{ "id": "a b", "title": "A" }] })).contains("a b"));
    assert!(reason(json!({ "title": "x", "actions": [{ "id": "a", "title": "A" }, { "id": "a", "title": "B" }] })).contains("unique"));
    let three = json!([{ "id": "a", "title": "A" }, { "id": "b", "title": "B" }, { "id": "c", "title": "C" }]);
    assert!(reason(json!({ "title": "x", "actions": three })).contains("at most 2"));
}

#[test]
fn notifications_are_limited_per_minute() {
    use super::notify::{take_slot, RATE_LIMIT};
    use std::{collections::VecDeque, time::{Duration, Instant}};
    let start = Instant::now();
    let mut times = VecDeque::new();
    for _ in 0..RATE_LIMIT {
        assert!(take_slot(&mut times, start));
    }
    assert!(!take_slot(&mut times, start + Duration::from_secs(59)));
    assert!(take_slot(&mut times, start + Duration::from_secs(60)));
}

#[test]
fn storage_keeps_values_within_the_limits() {
    use super::storage::{answer_storage, set_value, MAX_TOTAL_BYTES, MAX_VALUE_BYTES};
    let mut values = serde_json::Map::new();
    set_value(&mut values, "a".into(), json!({ "n": 1 })).expect("small");
    assert!(set_value(&mut values, "big".into(), json!("x".repeat(MAX_VALUE_BYTES))).is_err());
    let chunk = json!("x".repeat(MAX_VALUE_BYTES - 100));
    let mut stored = 0;
    while set_value(&mut values, format!("k{stored}"), chunk.clone()).is_ok() {
        stored += 1;
    }
    assert!(Value::Object(values.clone()).to_string().len() <= MAX_TOTAL_BYTES);
    assert!(!values.contains_key(&format!("k{stored}")));
    // Replacing a value with one that does not fit keeps the old one.
    assert!(set_value(&mut values, "a".into(), chunk).is_err());
    assert_eq!(values["a"], json!({ "n": 1 }));

    let dir = std::env::temp_dir().join(format!("focusd-storage-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let call = |method: &str, params: Value| answer_storage(&dir, method, &params);
    assert_eq!(call("storage.get", json!({ "key": "x" })).expect("get"), json!({ "value": null }));
    call("storage.set", json!({ "key": "x", "value": [1, 2] })).expect("set");
    assert_eq!(call("storage.get", json!({ "key": "x" })).expect("get"), json!({ "value": [1, 2] }));
    assert_eq!(call("storage.keys", Value::Null).expect("keys"), json!({ "keys": ["x"] }));
    assert_eq!(call("storage.delete", json!({ "key": "x" })).expect("delete"), json!({ "deleted": true }));
    assert_eq!(call("storage.set", json!({ "key": "" , "value": 1 })).expect_err("empty key").0, 400);
    assert_eq!(call("storage.set", json!({ "key": "y" })).expect_err("no value").0, 400);
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn keybindings_are_checked_for_version_2_and_dropped_for_version_1() {
    let commands = |keybinding: &str| {
        json!({ "commands": [{ "id": "go", "title": { "zh-CN": "开始", "en": "Go" }, "keybinding": keybinding, "when": "island.expanded && !todos.hasActive" }] })
    };
    let v2 = parse(json!({ "apiVersion": 2, "contributes": commands("ctrl + alt + p") })).expect("valid");
    let command = &v2.contributes.commands[0];
    assert_eq!(command.keybinding(), Some("Ctrl+Alt+P"));
    assert_eq!(command.when(), Some("island.expanded && !todos.hasActive"));
    let v1 = parse(json!({ "apiVersion": 1, "contributes": commands("not a key") })).expect("v1 ignores keybindings");
    assert_eq!(v1.contributes.commands[0].keybinding(), None);
    assert!(parse(json!({ "apiVersion": 2, "contributes": commands("P") })).expect_err("no modifier").contains("keybinding"));
    let bad_when = json!({ "commands": [{ "id": "go", "title": { "zh-CN": "开始", "en": "Go" }, "when": "a; b" }] });
    assert!(parse(json!({ "apiVersion": 2, "contributes": bad_when })).expect_err("bad when").contains("when"));
}

#[test]
fn todo_menus_must_name_own_commands_and_are_dropped_for_version_1() {
    let contributes = |menu: Value| {
        json!({ "commands": [{ "id": "go", "title": { "zh-CN": "开始", "en": "Go" } }], "menus": { "todo/context": menu } })
    };
    let v2 = parse(json!({ "apiVersion": 2, "contributes": contributes(json!([{ "command": "go" }])) })).expect("valid");
    assert_eq!(v2.contributes.menus.todo_context.len(), 1);
    let v1 = parse(json!({ "apiVersion": 1, "contributes": contributes(json!([{ "command": "missing" }])) })).expect("v1 ignores menus");
    assert!(v1.contributes.menus.todo_context.is_empty());
    let unknown = parse(json!({ "apiVersion": 2, "contributes": contributes(json!([{ "command": "missing" }])) }));
    assert!(unknown.expect_err("unknown command").contains("missing"));
    let twice = parse(json!({ "apiVersion": 2, "contributes": contributes(json!([{ "command": "go" }, { "command": "go" }])) }));
    assert!(twice.expect_err("duplicate").contains("twice"));
}

mod sensitive_tests {
    use super::super::sensitive::{decide, is_sensitive, outcome, Answer, Decision, Outcome, SensitiveChoice};
    use super::super::store::PluginsState;

    #[test]
    fn remembered_answers_decide_and_unknown_ones_ask() {
        assert_eq!(decide(Some(SensitiveChoice::Allowed), false), Decision::Allow);
        assert_eq!(decide(Some(SensitiveChoice::Denied), true), Decision::Deny);
        assert_eq!(decide(None, true), Decision::Allow);
        assert_eq!(decide(None, false), Decision::Ask);
    }

    #[test]
    fn answers_are_remembered_except_allow_once_and_no_answer() {
        assert_eq!(outcome(Some(Answer::Allow)), Outcome { allowed: true, remember: Some(SensitiveChoice::Allowed), this_run: false });
        assert_eq!(outcome(Some(Answer::Deny)), Outcome { allowed: false, remember: Some(SensitiveChoice::Denied), this_run: false });
        assert_eq!(outcome(Some(Answer::AllowOnce)), Outcome { allowed: true, remember: None, this_run: true });
        // Timing out denies this call only; the next one asks again.
        assert_eq!(outcome(None), Outcome { allowed: false, remember: None, this_run: false });
        assert_eq!(Answer::parse("once"), Some(Answer::AllowOnce));
        assert_eq!(Answer::parse("yes"), None);
    }

    #[test]
    fn only_the_data_permissions_are_sensitive() {
        assert!(is_sensitive("clipboard:read") && is_sensitive("shelf:write"));
        assert!(!is_sensitive("todos:read") && !is_sensitive("media:control"));
    }

    #[test]
    fn plugins_json_without_answers_still_reads_and_new_answers_round_trip() {
        let old: PluginsState = serde_json::from_str(r#"{"allowThirdParty":true,"plugins":{"a.b":{"enabled":true,"grantedPermissions":["todos:read"]}}}"#).expect("old file");
        assert!(old.plugins["a.b"].sensitive.is_empty());
        assert!(!serde_json::to_string(&old).expect("json").contains("sensitive"));
        let mut state = old.clone();
        state.plugins.get_mut("a.b").expect("grant").sensitive.insert("clipboard:read".into(), SensitiveChoice::Denied);
        let text = serde_json::to_string(&state).expect("json");
        assert!(text.contains(r#""sensitive":{"clipboard:read":"denied"}"#), "{text}");
        assert_eq!(serde_json::from_str::<PluginsState>(&text).expect("read back"), state);
    }
}

#[test]
fn messages_are_listed_newest_first_with_undated_ones_last() {
    let mut items = vec![json!({ "id": "old", "receivedAt": 1 }), json!({ "id": "none", "receivedAt": null }), json!({ "id": "new", "receivedAt": 9 })];
    super::feeds::sort_messages(&mut items);
    assert_eq!(items.iter().map(|item| item["id"].as_str().unwrap_or("")).collect::<Vec<_>>(), vec!["new", "old", "none"]);
}

#[test]
fn views_and_status_items_are_checked_for_version_2_and_dropped_for_version_1() {
    let contributes = |views: Value, status: Value| json!({ "views": views, "statusItems": status });
    let board = json!({ "id": "board", "title": { "zh-CN": "看板", "en": "Board" }, "icon": "kanban", "template": "list" });
    let v2 = parse(json!({ "apiVersion": 2, "contributes": contributes(json!([board]), json!([{ "id": "timer", "priority": 10 }])) })).expect("valid");
    assert_eq!(v2.contributes.views[0].template, super::view_specs::ViewTemplate::List);
    assert_eq!(v2.contributes.status_items[0].priority, 10);
    let no_icon = json!({ "id": "x", "title": { "zh-CN": "x", "en": "x" }, "template": "status" });
    assert_eq!(parse(json!({ "apiVersion": 2, "contributes": contributes(json!([no_icon]), json!([])) })).expect("default icon").contributes.views[0].icon, "puzzle");
    let v1 = parse(json!({ "apiVersion": 1, "contributes": contributes(json!(5), json!([{ "id": "?" }])) })).expect("v1 ignores views");
    assert!(v1.contributes.views.is_empty() && v1.contributes.status_items.is_empty());

    let reason = |views: Value, status: Value| parse(json!({ "apiVersion": 2, "contributes": contributes(views, status) })).expect_err("invalid");
    let mut svg = board.clone();
    svg["icon"] = json!("<svg/>");
    assert!(reason(json!([svg]), json!([])).contains("icon"));
    assert!(reason(json!([board.clone(), board.clone()]), json!([])).contains("unique"));
    let mut third = board.clone();
    third["id"] = json!("c");
    let mut second = board.clone();
    second["id"] = json!("b");
    assert!(reason(json!([board.clone(), second, third]), json!([])).contains("at most 2"));
    let mut bad_template = board.clone();
    bad_template["template"] = json!("webview");
    assert!(reason(json!([bad_template]), json!([])).contains("webview"));
    assert!(reason(json!([]), json!([{ "id": "t", "priority": 101 }])).contains("priority"));
    assert!(reason(json!([]), json!([{ "id": "a b" }])).contains("a b"));
}

#[test]
fn view_icons_match_the_manifest_schema() {
    let schema: Value = serde_json::from_str(include_str!("../../../plugins/schema/manifest.schema.json")).expect("schema");
    let icons = &schema["properties"]["contributes"]["properties"]["views"]["items"]["properties"]["icon"]["enum"];
    assert_eq!(*icons, json!(super::view_specs::VIEW_ICONS.to_vec()));
}
