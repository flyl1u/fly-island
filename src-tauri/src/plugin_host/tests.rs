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
fn bad_manifests_say_why() {
    let reason = |overrides: Value| parse(overrides).expect_err("invalid");
    assert!(reason(json!({ "id": "Dev.Example" })).contains("lowercase"));
    assert!(reason(json!({ "id": "dev.other" })).contains("folder"));
    assert!(reason(json!({ "apiVersion": 2 })).contains("version 2"));
    assert!(reason(json!({ "minAppVersion": "0.3.0" })).contains("0.3.0"));
    assert!(reason(json!({ "name": { "zh-CN": "同步", "en": " " } })).contains("name"));
    assert!(reason(json!({ "permissions": ["clipboard:read"] })).contains("clipboard:read"));
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
    const PACKAGE: &[u8] = include_bytes!("../../../plugins/packages/dev.focusd.todo-digest-1.1.0.zip");

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

        let tampered = INDEX.replace("\"version\": \"1.1.0\"", "\"version\": \"1.1.1\"");
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
        let good = index["plugins"][0].clone();
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
