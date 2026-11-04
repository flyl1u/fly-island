use serde_json::{json, Value};
use std::{ffi::OsString, path::Path};

use super::manifest::{launch_command, parse_manifest, version_at_least, PluginRuntime};
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
