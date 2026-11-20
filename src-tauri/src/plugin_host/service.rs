use std::{collections::BTreeMap, path::PathBuf, sync::{Arc, Mutex, PoisonError}};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::Emitter;
use super::{manifest::Manifest, packages::IndexEntry, process::Worker, protocol::Contributions, storage::{self, Installed, Registry}};

pub const EVENT: &str = "plugins-changed";
const DEFAULT_INDEX: &str = "https://github.com/flyl1u/fly-island/releases/latest/download/plugins-index.json";

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Live { pub status: String, #[serde(flatten)] pub data: Contributions }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot { pub registry: Registry, pub live: BTreeMap<String, Live> }

pub struct Host {
    enabled: bool,
    pub root: PathBuf,
    pub registry: Mutex<Registry>,
    pub workers: Mutex<BTreeMap<String, Worker>>,
    pub live: Arc<Mutex<BTreeMap<String, Live>>>,
    pub operation: tokio::sync::Mutex<()>,
    app: Option<tauri::AppHandle>,
}

impl Host {
    pub fn new(root: PathBuf, app: Option<tauri::AppHandle>, enabled: bool) -> Result<Self, String> {
        let registry = if enabled {
            std::fs::create_dir_all(root.join("plugins")).map_err(|e| e.to_string())?;
            std::fs::create_dir_all(root.join("plugin-logs")).map_err(|e| e.to_string())?;
            storage::load(&root)
        } else { Registry::default() };
        Ok(Self { enabled, root, registry: Mutex::new(registry), workers: Mutex::new(Default::default()), live: Arc::new(Mutex::new(Default::default())), operation: tokio::sync::Mutex::new(()), app })
    }

    pub fn enabled(&self) -> bool { self.enabled }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot { registry: self.registry.lock().unwrap_or_else(PoisonError::into_inner).clone(), live: self.live.lock().unwrap_or_else(PoisonError::into_inner).clone() }
    }

    pub fn notify(&self) { if let Some(app) = &self.app { let _ = app.emit(EVENT, ()); } }

    pub fn start(&self, id: &str) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        let p = self.registry.lock().map_err(|e| e.to_string())?.installed.get(id).cloned().ok_or("Plugin not installed")?;
        let actual = Manifest::read(&p.directory.join("fly-island-plugin.json"))?;
        if !p.development && p.directory != self.root.join("plugins").join(id) { return Err("Unsafe plugin directory".into()); }
        if actual.id != id || serde_json::to_value(&actual).map_err(|e| e.to_string())? != serde_json::to_value(&p.manifest).map_err(|e| e.to_string())? {
            return Err("Plugin manifest changed; reload or reinstall it".into());
        }
        let settings = storage::runtime_settings(&p)?;
        let live = self.live.clone();
        let app = self.app.clone();
        let key = id.to_owned();
        let publish = Arc::new(move |data, status: &str| {
            live.lock().unwrap_or_else(PoisonError::into_inner).insert(key.clone(), Live { status: status.into(), data });
            if let Some(app) = &app { let _ = app.emit(EVENT, ()); }
        });
        let worker = Worker::start(p.directory, p.manifest, settings, self.root.join("plugin-logs").join(format!("{id}.log")), publish);
        self.workers.lock().map_err(|e| e.to_string())?.insert(id.into(), worker);
        Ok(())
    }

    pub fn stop(&self, id: &str) {
        let worker = self.workers.lock().unwrap_or_else(PoisonError::into_inner).remove(id);
        drop(worker);
        self.live.lock().unwrap_or_else(PoisonError::into_inner).remove(id);
        self.notify();
    }

    pub fn shutdown(&self) {
        let workers = std::mem::take(&mut *self.workers.lock().unwrap_or_else(PoisonError::into_inner));
        // Begin every grace period together; slow plugins must not add 3 seconds each on exit.
        for worker in workers.values() { worker.stop(); }
        drop(workers);
        self.live.lock().unwrap_or_else(PoisonError::into_inner).clear();
    }

    pub fn persist(&self, next: Registry) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        storage::save(&self.root, &next)?;
        *self.registry.lock().map_err(|e| e.to_string())? = next;
        self.notify();
        Ok(())
    }

    pub fn source(&self) -> (String, bool) {
        let r = self.registry.lock().unwrap_or_else(PoisonError::into_inner);
        if let Ok(url) = std::env::var("FOCUSD_PLUGINS_INDEX") { return (url, true); }
        if r.developer_mode && !r.index_url.is_empty() { (r.index_url.clone(), true) } else { (DEFAULT_INDEX.into(), false) }
    }

    pub async fn catalog(&self) -> Result<Vec<IndexEntry>, String> {
        if !self.enabled { return Ok(Vec::new()); }
        let (url, local) = self.source();
        let result = async { super::packages::parse_index(&super::packages::download(&url, local, super::packages::INDEX_LIMIT).await?) }.await;
        if let Err(error) = &result {
            let detail = format!("plugin index: {error}\n");
            eprint!("{detail}");
            super::process::log_stderr(detail.as_bytes(), &self.root.join("plugin-logs/catalog.log"), &[]);
        }
        result.map_err(|_| "plugin_index_unavailable".into())
    }

    pub async fn install(&self, id: &str) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        let entry = self.catalog().await?.into_iter().find(|e| e.id == id).ok_or("Plugin is not in the index")?;
        let bytes = super::packages::download(&entry.url, self.source().1, super::packages::PACKAGE_LIMIT).await?;
        let staging = self.root.join("plugins").join(format!(".staging-{id}"));
        if staging.exists() { std::fs::remove_dir_all(&staging).map_err(|e| e.to_string())?; }
        std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
        let manifest = match super::packages::extract(&bytes, &staging, &entry) {
            Ok(m) => m,
            Err(e) => { let _ = std::fs::remove_dir_all(&staging); return Err(e); }
        };
        let mut next = self.snapshot().registry;
        let old = next.installed.get(id).cloned();
        let enabled = old.as_ref().is_some_and(|p| p.enabled);
        let directory = self.root.join("plugins").join(id);
        let backup = self.root.join("plugins").join(format!(".backup-{id}"));
        if backup.exists() { std::fs::remove_dir_all(&backup).map_err(|e| e.to_string())?; }
        self.stop(id);
        if directory.exists() { std::fs::rename(&directory, &backup).map_err(|e| e.to_string())?; }
        let apply = (|| {
            std::fs::rename(&staging, &directory).map_err(|e| e.to_string())?;
            let mut settings = old.as_ref().map(|p| p.settings.clone()).unwrap_or_default();
            settings.retain(|key, value| manifest.settings.iter().any(|s| &s.key == key && s.kind != "secret" && s.accepts(value)));
            let mut installed = Installed { manifest, enabled, directory: directory.clone(), development: false, settings };
            super::transfer::restore_install(&self.root, &mut installed);
            next.installed.insert(id.into(), installed);
            self.persist(next)
        })();
        if let Err(error) = apply {
            let _ = std::fs::remove_dir_all(&directory);
            if backup.exists() { let _ = std::fs::rename(&backup, &directory); }
            if enabled { let _ = self.start(id); }
            return Err(error);
        }
        if backup.exists() { let _ = std::fs::remove_dir_all(backup); }
        if self.snapshot().registry.installed.get(id).is_some_and(|p| p.enabled) { self.start(id)?; }
        Ok(())
    }

    pub fn enable(&self, id: &str, enabled: bool) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        let mut next = self.snapshot().registry;
        let p = next.installed.get_mut(id).ok_or("Plugin not installed")?;
        if p.development && !next.developer_mode { return Err("Developer mode is disabled".into()); }
        p.enabled = enabled;
        self.stop(id);
        self.persist(next)?;
        if enabled {
            if let Err(error) = self.start(id) {
                let mut rollback = self.snapshot().registry;
                if let Some(p) = rollback.installed.get_mut(id) { p.enabled = false; }
                self.persist(rollback)?;
                return Err(error);
            }
        }
        Ok(())
    }

    pub fn uninstall(&self, id: &str) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        let mut next = self.snapshot().registry;
        let p = next.installed.remove(id).ok_or("Plugin not installed")?;
        self.stop(id);
        for s in &p.manifest.settings { if s.kind == "secret" { storage::set_secret(id, &s.key, "")?; } }
        if !p.development {
            let expected = self.root.join("plugins").join(id);
            if p.directory != expected { return Err("Unsafe plugin installation path".into()); }
            std::fs::remove_dir_all(expected).map_err(|e| e.to_string())?;
        }
        self.persist(next)?;
        super::transfer::forget(&self.root, id)
    }

    pub fn setting(&self, id: &str, key: &str, value: Value) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        let mut next = self.snapshot().registry;
        let p = next.installed.get_mut(id).ok_or("Plugin not installed")?;
        let s = p.manifest.settings.iter().find(|s| s.key == key).ok_or("Unknown plugin setting")?;
        if !s.accepts(&value) { return Err("Invalid plugin setting value".into()); }
        if s.kind == "secret" { storage::set_secret(id, key, value.as_str().ok_or("Invalid secret")?)?; }
        else { p.settings.insert(key.into(), value); }
        let enabled = p.enabled;
        self.stop(id);
        self.persist(next)?;
        if enabled { self.start(id)?; }
        Ok(())
    }

    pub fn action(&self, id: &str, action: &str) -> Result<Value, String> {
        if !self.enabled { return Ok(Value::Null); }
        let live = self.snapshot();
        let p = live.registry.installed.get(id).ok_or("Plugin not installed")?;
        let declared = p.manifest.actions.iter().any(|a| a.id == action)
            || live.live.get(id).is_some_and(|l| l.data.sessions.iter().any(|s| s.action.as_deref() == Some(action)) || l.data.notifications.iter().any(|n| n.action.as_deref() == Some(action)));
        if !declared { return Err("Unknown plugin action".into()); }
        let reply = self.workers.lock().map_err(|e| e.to_string())?.get(id).ok_or("Plugin is stopped")?.request("action", json!({"id":action}))?;
        reply.recv_timeout(std::time::Duration::from_secs(16)).map_err(|_| "Plugin action timeout".to_owned())?
    }
}
