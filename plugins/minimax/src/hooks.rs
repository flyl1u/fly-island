use fly_island_plugin_sdk::{json, read_json, Value};
use serde::Deserialize;
use std::{
    fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

const RECORD: &str = "Fly Island MiniMax: record";
const COMPLETE: &str = "Fly Island MiniMax: clear completed tool";
const CLEAR: &str = "Fly Island MiniMax: clear session";
const EVENTS: [(&str, &str, &str); 4] = [
    ("PermissionRequest", RECORD, "record"),
    ("PostToolUse", COMPLETE, "post"),
    ("Stop", CLEAR, "clear"),
    ("UserPromptSubmit", CLEAR, "clear"),
];
const SCRIPT: &str = include_str!("../hooks/approval-marker.ps1");
const MAX_CONFIG: u64 = 256 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Approval {
    pub session_id: String,
    pub tool: String,
    pub at: i64,
}

#[derive(Deserialize)]
struct Approvals {
    approvals: Vec<Approval>,
}

fn marker_directory() -> Option<PathBuf> {
    Some(PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("fly-island-minimax"))
}

pub(super) fn approval_marks() -> Vec<Approval> {
    marker_directory()
        .and_then(|directory| read_json(&directory.join("approvals.json"), 64 * 1024).ok())
        .and_then(|body| serde_json::from_value::<Approvals>(body).ok())
        .map_or_else(Vec::new, |data| data.approvals)
}

fn hooks_path() -> Option<PathBuf> {
    Some(super::home()?.join(".minimax").join("hooks.json"))
}

pub(super) fn install() -> Result<(), String> {
    let config = hooks_path().ok_or("MiniMax Code config folder is unavailable")?;
    let directory = marker_directory().ok_or("Local application data is unavailable")?;
    let script = directory.join("approval-marker.ps1");
    let system =
        PathBuf::from(std::env::var_os("SystemRoot").ok_or("Windows folder is unavailable")?)
            .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    if [script.as_path(), system.as_path()]
        .iter()
        .any(|p| p.to_string_lossy().contains(['%', '!', '\"', '\r', '\n']))
    {
        return Err("The approval hook path contains unsupported characters".into());
    }
    let original = contents(&config)?;
    let mut body = decode(original.as_deref())?;
    if body["enabled"] == false {
        return Err("Enable hooks in MiniMax Code before connecting".into());
    }
    let hooks = body
        .as_object_mut()
        .ok_or("Expected a JSON object")?
        .entry("hooks")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or("Invalid hooks object")?;
    for (event, name, mode) in EVENTS {
        let groups = hooks
            .entry(event)
            .or_insert_with(|| json!([]))
            .as_array_mut()
            .ok_or("Invalid hook group")?;
        let command = format!(
            "\"{}\" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"{}\" -Mode {mode}",
            system.display(),
            script.display()
        );
        let handler = json!({ "type": "command", "name": name, "command": command, "commandWindows": command, "timeout": 5 });
        if let Some(existing) = groups
            .iter_mut()
            .filter_map(|group| group.get_mut("hooks").and_then(Value::as_array_mut))
            .flatten()
            .find(|item| owned(item, name, &script))
        {
            *existing = handler;
        } else {
            groups.push(json!({ "hooks": [handler] }));
        }
    }
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    write_atomic(&script, SCRIPT.trim_start_matches('\u{feff}').as_bytes())?;
    write_config(&config, original.as_deref(), &body)
}

pub(super) fn remove() -> Result<(), String> {
    let (Some(config), Some(directory)) = (hooks_path(), marker_directory()) else {
        return Ok(());
    };
    let Some(original) = contents(&config)? else {
        return Ok(());
    };
    let mut body = decode(Some(&original))?;
    let script = directory.join("approval-marker.ps1");
    if drop_owned(&mut body, &script) {
        write_config(&config, Some(&original), &body)?;
        let _ = fs::remove_file(directory.join("approvals.json"));
    }
    Ok(())
}

fn owned(item: &Value, name: &str, script: &Path) -> bool {
    item["name"] == name
        && item["commandWindows"]
            .as_str()
            .is_some_and(|command| command.contains(&format!("-File \"{}\"", script.display())))
}

fn drop_owned(body: &mut Value, script: &Path) -> bool {
    let Some(hooks) = body.get_mut("hooks").and_then(Value::as_object_mut) else {
        return false;
    };
    let mut changed = false;
    for (event, name, _) in EVENTS {
        let Some(groups) = hooks.get_mut(event).and_then(Value::as_array_mut) else {
            continue;
        };
        let mut changed_event = false;
        groups.retain_mut(|group| {
            let simple_group = group.as_object().is_some_and(|fields| fields.len() == 1);
            let Some(items) = group.get_mut("hooks").and_then(Value::as_array_mut) else {
                return true;
            };
            let before = items.len();
            items.retain(|item| !owned(item, name, script));
            let removed = items.len() != before;
            changed_event |= removed;
            !removed || !items.is_empty() || !simple_group
        });
        if changed_event && groups.is_empty() {
            hooks.remove(event);
        }
        changed |= changed_event;
    }
    changed
}

fn contents(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let mut bytes = Vec::new();
    file.take(MAX_CONFIG + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_CONFIG {
        return Err("MiniMax hooks file is too large".into());
    }
    Ok(Some(bytes))
}

fn decode(bytes: Option<&[u8]>) -> Result<Value, String> {
    match bytes {
        Some(bytes) => {
            serde_json::from_slice(bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes))
                .map_err(|_| "Invalid MiniMax hooks JSON".into())
        }
        None => Ok(json!({ "enabled": true, "hooks": {} })),
    }
}

fn write_config(path: &Path, before: Option<&[u8]>, body: &Value) -> Result<(), String> {
    if contents(path)?.as_deref() != before {
        return Err("MiniMax hooks changed. Try again.".into());
    }
    write_atomic(
        path,
        &serde_json::to_vec_pretty(body).map_err(|error| error.to_string())?,
    )
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid output path")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temp.write_all(bytes).map_err(|error| error.to_string())?;
    temp.persist(path).map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removal_preserves_unrelated_hooks_and_empty_matchers() {
        let script = Path::new("C:/Fly Island/approval-marker.ps1");
        let mut config = json!({"enabled": false, "hooks": {
            "PermissionRequest": [
                {"hooks": [{"name": RECORD, "commandWindows": "custom"}]},
                {"hooks": [{"name": RECORD, "commandWindows": "powershell -File \"C:/Fly Island/approval-marker.ps1\" -Mode record"}]},
                {"matcher": "Read", "hooks": []}
            ]
        }});
        assert!(drop_owned(&mut config, script));
        assert!(!drop_owned(&mut config, script));
        assert_eq!(config["enabled"], false);
        assert_eq!(
            config["hooks"]["PermissionRequest"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }
}
