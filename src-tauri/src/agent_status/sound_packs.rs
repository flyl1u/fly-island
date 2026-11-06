//! Sound packs for agent events. Each imported pack is a folder under the app data
//! directory, `sound-packs/<id>/`, holding `pack.json` and one file per event named
//! `<event>.<ext>`. The Sounds page reads the folder the user picks and sends the files here.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{ipc::Response, AppHandle, Manager};

const PACKS_DIR: &str = "sound-packs";
const MANIFEST: &str = "pack.json";
/// Mirrors AGENT_SOUND_EVENTS in src/features/agent-status/sounds/events.ts.
const EVENTS: [&str; 6] = ["start", "complete", "error", "approval", "question", "ack"];
const EXTENSIONS: [&str; 5] = ["wav", "mp3", "ogg", "m4a", "flac"];
/// Short notification sounds; anything larger is not one.
const MAX_FILE_BYTES: usize = 4 * 1024 * 1024;
const MAX_TEXT_CHARS: usize = 120;

/// Mirrors SoundPack in src/features/agent-status/sounds/api.ts.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoundPack {
    pub id: String,
    pub name: String,
    pub author: String,
    pub license: String,
    /// Event to the file name inside the pack's folder.
    pub sounds: BTreeMap<String, String>,
}

/// Mirrors SoundPackImport in src/features/agent-status/sounds/api.ts.
#[derive(Deserialize)]
pub struct SoundPackImport {
    name: String,
    author: String,
    license: String,
    files: Vec<SoundPackFile>,
}

#[derive(Deserialize)]
pub struct SoundPackFile {
    event: String,
    /// The original file name; only its extension is kept.
    name: String,
    bytes: Vec<u8>,
}

fn packs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(PACKS_DIR))
        .map_err(|error| format!("找不到应用数据目录：{error}"))
}

fn clean_text(value: &str) -> String {
    value.trim().chars().filter(|c| !c.is_control()).take(MAX_TEXT_CHARS).collect()
}

/// Ids are what `pack_id` makes: lowercase letters, digits and dashes.
pub(crate) fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// A new pack's id: its name in ASCII, plus the time so two packs with one name stay apart.
pub(crate) fn pack_id(name: &str, now_ms: u128) -> String {
    let mut slug = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
        if slug.len() >= 32 {
            break;
        }
    }
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "pack" } else { slug };
    format!("{slug}-{now_ms:x}")
}

/// The lowercase extension of a sound file name, when it is one the island plays.
pub(crate) fn sound_extension(name: &str) -> Option<String> {
    let extension = Path::new(name).extension()?.to_str()?.to_ascii_lowercase();
    EXTENSIONS.contains(&extension.as_str()).then_some(extension)
}

/// A file to write into a pack's folder: its stored name and contents.
type PackFile = (String, Vec<u8>);

/// Checks an import and turns it into the pack to save and the files to write.
pub(crate) fn plan_import(pack: SoundPackImport, id: String) -> Result<(SoundPack, Vec<PackFile>), String> {
    let mut sounds = BTreeMap::new();
    let mut files = Vec::new();
    for file in pack.files {
        if !EVENTS.contains(&file.event.as_str()) || sounds.contains_key(&file.event) {
            continue;
        }
        let extension = sound_extension(&file.name).ok_or_else(|| format!("不支持的音效格式：{}", file.name))?;
        if file.bytes.is_empty() || file.bytes.len() > MAX_FILE_BYTES {
            return Err(format!("音效文件太大或是空的：{}（最大 4 MB）", file.name));
        }
        let stored = format!("{}.{extension}", file.event);
        sounds.insert(file.event, stored.clone());
        files.push((stored, file.bytes));
    }
    if sounds.is_empty() {
        return Err("这个文件夹里没有能用的音效。".into());
    }
    let name = clean_text(&pack.name);
    let pack = SoundPack {
        id,
        name: if name.is_empty() { "音效包".into() } else { name },
        author: clean_text(&pack.author),
        license: clean_text(&pack.license),
        sounds,
    };
    Ok((pack, files))
}

fn read_pack(dir: &Path) -> Option<SoundPack> {
    let pack: SoundPack = serde_json::from_slice(&fs::read(dir.join(MANIFEST)).ok()?).ok()?;
    let folder_id = dir.file_name()?.to_str()?;
    (pack.id == folder_id && is_valid_id(&pack.id)).then_some(pack)
}

/// The imported sound packs, by name.
#[tauri::command]
pub async fn list_sound_packs(app: AppHandle) -> Result<Vec<SoundPack>, String> {
    let dir = packs_dir(&app)?;
    let Ok(entries) = fs::read_dir(&dir) else { return Ok(Vec::new()) };
    let mut packs: Vec<SoundPack> = entries.flatten().filter_map(|entry| read_pack(&entry.path())).collect();
    packs.sort_by_key(|pack| pack.name.to_lowercase());
    Ok(packs)
}

/// Copies a sound pack into the app data directory and returns it.
#[tauri::command]
pub async fn import_sound_pack(app: AppHandle, pack: SoundPackImport) -> Result<SoundPack, String> {
    let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or_default();
    let id = pack_id(&pack.name, now_ms);
    let (pack, files) = plan_import(pack, id)?;
    let dir = packs_dir(&app)?;
    // Written next to its final place and renamed, so a half-written pack never lists.
    let staging = dir.join(format!("{}.importing", pack.id));
    let write = || -> Result<(), String> {
        fs::create_dir_all(&staging).map_err(|error| format!("无法创建 {}：{error}", staging.display()))?;
        for (name, bytes) in &files {
            fs::write(staging.join(name), bytes).map_err(|error| format!("无法写入音效 {name}：{error}"))?;
        }
        let manifest = serde_json::to_vec_pretty(&pack).map_err(|error| error.to_string())?;
        fs::write(staging.join(MANIFEST), manifest).map_err(|error| format!("无法写入 {MANIFEST}：{error}"))?;
        fs::rename(&staging, dir.join(&pack.id)).map_err(|error| format!("无法保存音效包：{error}"))
    };
    if let Err(error) = write() {
        let _ = fs::remove_dir_all(&staging);
        return Err(error);
    }
    Ok(pack)
}

/// Deletes an imported sound pack.
#[tauri::command]
pub async fn remove_sound_pack(app: AppHandle, id: String) -> Result<(), String> {
    if !is_valid_id(&id) {
        return Err("音效包 id 无效。".into());
    }
    let dir = packs_dir(&app)?.join(&id);
    if read_pack(&dir).is_none() {
        return Err("找不到这个音效包。".into());
    }
    fs::remove_dir_all(&dir).map_err(|error| format!("无法删除音效包：{error}"))
}

/// One sound file of an imported pack, as raw bytes. Only files the pack's manifest lists are served.
#[tauri::command]
pub async fn read_sound_pack_file(app: AppHandle, id: String, file: String) -> Result<Response, String> {
    if !is_valid_id(&id) {
        return Err("音效包 id 无效。".into());
    }
    let dir = packs_dir(&app)?.join(&id);
    let pack = read_pack(&dir).ok_or("找不到这个音效包。")?;
    if !pack.sounds.values().any(|listed| listed == &file) {
        return Err("音效包里没有这个文件。".into());
    }
    fs::read(dir.join(&file))
        .map(Response::new)
        .map_err(|error| format!("无法读取音效 {file}：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(event: &str, name: &str, len: usize) -> SoundPackFile {
        SoundPackFile { event: event.into(), name: name.into(), bytes: vec![1; len] }
    }

    #[test]
    fn ids_are_ascii_slugs_with_the_time() {
        assert_eq!(pack_id("Vibe 8-bit 录音", 255), "vibe-8-bit-ff");
        assert_eq!(pack_id("录音", 16), "pack-10");
        assert!(is_valid_id(&pack_id("A B", 1)));
        assert!(!is_valid_id("../x") && !is_valid_id("") && !is_valid_id("A"));
    }

    #[test]
    fn imports_keep_known_events_and_name_files_by_event() {
        let import = SoundPackImport {
            name: "  Pack\n".into(),
            author: "me".into(),
            license: "CC0-1.0".into(),
            files: vec![
                file("complete", "02-Task-Complete.WAV", 10),
                file("complete", "other.wav", 10),
                file("idle", "07-idle.wav", 10),
                file("question", "ask.mp3", 10),
            ],
        };
        let (pack, files) = plan_import(import, "pack-1".into()).expect("plan");
        assert_eq!(pack.name, "Pack");
        assert_eq!(pack.sounds.get("complete").map(String::as_str), Some("complete.wav"));
        assert_eq!(pack.sounds.get("question").map(String::as_str), Some("question.mp3"));
        assert_eq!(pack.sounds.len(), 2);
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn imports_refuse_unknown_formats_large_files_and_empty_packs() {
        let pack = |files| SoundPackImport { name: "p".into(), author: String::new(), license: String::new(), files };
        assert!(plan_import(pack(vec![file("start", "a.exe", 10)]), "p-1".into()).is_err());
        assert!(plan_import(pack(vec![file("start", "a.wav", MAX_FILE_BYTES + 1)]), "p-1".into()).is_err());
        assert!(plan_import(pack(vec![file("idle", "a.wav", 10)]), "p-1".into()).is_err());
    }
}
