use super::*;
use serde_json::{json, Value};
use std::{fs, path::Path};

fn sample() -> Value {
    json!({ "app": "fly-island", "formatVersion": 1, "exportedAt": "2026-11-19T00:00:00Z", "appVersion": "3.2.8",
        "localStorage": { "fly-island-future": "raw" },
        "files": { "launchAtStartup": false, "agents": { "codex": false, "claudeCode": false, "replyMarker": false },
            "plugins": { "developerMode": false, "indexUrl": "", "installed": [] },
            "clipboard": { "settings": { "enabled": true, "captureImages": true, "maxItems": 30 }, "history": null },
            "data": { "file-shelf.json": { "items": [] } }, "assets": {} } })
}

#[test]
fn identity_and_structure_are_validated_before_writing() {
    assert!(Backup::parse(&serde_json::to_vec(&sample()).unwrap()).is_ok());
    assert!(Backup::parse(b"broken").err().unwrap().contains("invalidJson"));
    for (field, value, error) in [("app", json!("other"), "wrongApp"), ("formatVersion", json!(2), "unsupportedVersion"),
        ("localStorage", json!({ "key": false }), "invalidStructure"), ("files", json!({}), "invalidStructure")] {
        let mut sample = sample();
        sample[field] = value;
        assert!(Backup::parse(&serde_json::to_vec(&sample).unwrap()).err().unwrap().contains(error));
    }
    for key in ["fly-island-position", "fly-island-position-reset", "fly-island-panel-preview", "foreign"] { assert!(!format::storage_key(key)); }
    assert!(format::storage_key("fly-island-future"));
}

#[test]
fn data_file_allowlist_does_not_accept_runtime_secrets_or_coordinates() {
    for name in ["agent-status.json", "agent-approval.json", "clipboard-location.json", "settings-window.json", "../outside.json", "plugins-state.json"] {
        let mut sample = sample();
        sample["files"]["data"][name] = json!({});
        assert!(Backup::parse(&serde_json::to_vec(&sample).unwrap()).is_err());
    }
    let mut sample = sample();
    sample["files"]["assets"]["sound-packs/../outside.exe"] = json!("ZGF0YQ==");
    assert!(Backup::parse(&serde_json::to_vec(&sample).unwrap()).is_err());
}

#[test]
fn portable_sounds_require_listed_files_and_matching_manifest_id() {
    use base64::Engine as _;
    let encoded = |bytes| base64::engine::general_purpose::STANDARD.encode(bytes);
    let manifest = json!({ "id": "pack-1", "name": "Chime", "author": "", "license": "CC0", "sounds": { "complete": "complete.wav" } });
    let mut assets = BTreeMap::from([
        ("sound-packs/pack-1/pack.json".into(), encoded(serde_json::to_vec(&manifest).unwrap())),
        ("sound-packs/pack-1/complete.wav".into(), encoded(b"audio".to_vec())),
    ]);
    assert!(assets::validate(&assets).is_ok());
    assets.insert("sound-packs/pack-1/start.wav".into(), encoded(b"extra".to_vec()));
    assert!(assets::validate(&assets).is_err());
}

#[test]
fn plan_preserves_device_files_and_current_clipboard_without_opt_in() {
    let directory = std::env::temp_dir().join(format!("fly-config-transfer-{}-plan", std::process::id()));
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join("settings-window.json"), "device").unwrap();
    let backup = Backup::parse(&serde_json::to_vec(&sample()).unwrap()).unwrap();
    let (plan, missing) = backup.files.plan(&directory).unwrap();
    assert!(!plan.contains_key(&directory.join("settings-window.json")));
    assert!(!plan.contains_key(&directory.join("clipboard-location.json")));
    assert!(plan.contains_key(&directory.join("plugins-restore.json")));
    assert!(missing.is_empty());
    assert_eq!(fs::read_to_string(directory.join("settings-window.json")).unwrap(), "device");
    fs::remove_dir_all(directory).unwrap();
}

#[test]
fn atomic_write_replaces_and_removes_only_the_chosen_file() {
    let directory = std::env::temp_dir().join(format!("fly-config-transfer-{}-write", std::process::id()));
    fs::create_dir_all(&directory).unwrap();
    let path = directory.join("backup.json");
    transaction::write(&path, Some(b"old")).unwrap();
    transaction::write(&path, Some(b"new")).unwrap();
    assert_eq!(transaction::read_limited(&path, 3).unwrap(), b"new");
    assert!(transaction::read_limited(&path, 2).is_err());
    transaction::write(&path, None).unwrap();
    assert!(!Path::new(&path).exists());
    fs::remove_dir_all(directory).unwrap();
}
