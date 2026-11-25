use std::{collections::BTreeMap, path::PathBuf, sync::{Arc, Mutex, PoisonError}};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::Emitter;
use super::{manifest::Manifest, packages::{self, IndexEntry}, process::{self, Worker}, protocol::Contributions, storage::{self, Installed, Registry}};

pub const EVENT: &str = "plugins-changed";
const DEFAULT_INDEX: &str = "https://github.com/flyl1u/fly-island/releases/download/plugins-channel/plugins-index.json";

#[derive(Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Live { pub status: String, #[serde(flatten)] pub data: Contributions }

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot { pub registry: Registry, pub live: BTreeMap<String, Live> }

pub struct Host {
    enabled: bool,
    approved: Option<Vec<String>>,
    device_battery: Mutex<Option<Arc<crate::device_battery::DevicePackage>>>,
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
        Ok(Self { enabled, approved: None, device_battery: Mutex::new(None), root, registry: Mutex::new(registry), workers: Mutex::new(Default::default()), live: Arc::new(Mutex::new(Default::default())), operation: tokio::sync::Mutex::new(()), app })
    }

    pub fn market(root: PathBuf, app: Option<tauri::AppHandle>) -> Result<Self, String> {
        let mut host = Self::new(root, app, true)?;
        host.approved = Some(serde_json::from_str(include_str!("../../../plugins/market-packages.json")).map_err(|error| error.to_string())?);
        Ok(host)
    }

    pub fn allows_development(&self) -> bool { self.enabled && self.approved.is_none() }

    fn allows(&self, id: &str) -> bool {
        self.enabled && self.approved.as_ref().is_none_or(|ids| ids.iter().any(|approved| approved == id))
    }

    pub fn public_snapshot(&self) -> Snapshot {
        let mut snapshot = self.snapshot();
        snapshot.registry.installed.retain(|id, plugin| {
            self.allows(id) && (!plugin.development || self.allows_development())
        });
        if !self.allows_development() {
            snapshot.registry.developer_mode = false;
            snapshot.registry.index_url.clear();
        }
        snapshot.live.retain(|id, _| snapshot.registry.installed.contains_key(id));
        snapshot
    }

    pub fn snapshot(&self) -> Snapshot {
        let registry = self.registry.lock().unwrap_or_else(PoisonError::into_inner).clone();
        let mut live = self.live.lock().unwrap_or_else(PoisonError::into_inner).clone();
        if let Some((headline, note)) = self.app.as_ref().and_then(crate::eye_care::failure_notice) {
            if let Some(panel) = live.get_mut("eye-care").and_then(|value| value.data.panel.as_mut()) {
                panel.headline = headline.into();
                panel.note = Some(note.into());
            }
        }
        Snapshot { registry, live }
    }

    pub fn notify(&self) { if let Some(app) = &self.app { let _ = app.emit(EVENT, ()); } }

    fn installed_for_runtime(&self, id: &str) -> Result<Installed, String> {
        if !self.allows(id) { return Err("Plugin is unavailable in this build".into()); }
        let registry = self.registry.lock().map_err(|error| error.to_string())?;
        let p = registry.installed.get(id).ok_or("Plugin not installed")?;
        if !p.enabled || (p.development && (!self.allows_development() || !registry.developer_mode)) {
            return Err("Plugin is disabled".into());
        }
        Ok(p.clone())
    }

    pub fn start(&self, id: &str) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        let p = self.installed_for_runtime(id)?;
        let actual = Manifest::read(&p.directory.join("fly-island-plugin.json"))?;
        if !p.development && p.directory != self.root.join("plugins").join(id) { return Err("Unsafe plugin directory".into()); }
        if actual.id != id || serde_json::to_value(&actual).map_err(|e| e.to_string())? != serde_json::to_value(&p.manifest).map_err(|e| e.to_string())? {
            return Err("Plugin manifest changed; reload or reinstall it".into());
        }
        if id == "device-battery" && !p.development {
            let package = crate::device_battery::DevicePackage::new(self.device_battery_directory(&p)?)?;
            *self.device_battery.lock().map_err(|error| error.to_string())? = Some(Arc::new(package));
            self.live.lock().map_err(|error| error.to_string())?.insert(id.into(), Live { status: "running".into(), data: Contributions::default() });
            self.notify();
            return Ok(());
        }
        let mut settings = storage::runtime_settings(&p)?;
        let hosted_breaks = crate::eye_care::supports_host_windows(&p.manifest);
        if hosted_breaks { settings["_host-eye-care-windows"] = json!(true); }
        let break_language_english = settings["language"] == "en";
        let break_session = if hosted_breaks { self.app.as_ref().and_then(crate::eye_care::begin_session) } else { None };
        let live = self.live.clone();
        let app = self.app.clone();
        let key = id.to_owned();
        let publish = Arc::new(move |data, status: &str| {
            let rest = if hosted_breaks { crate::eye_care::from_publish(&data, status, break_language_english) } else { None };
            // A plugin that publishes the same snapshot again (a countdown that the host
            // ticks itself, an unchanged reading) is not news: no event, no re-render.
            let changed = {
                let mut current = live.lock().unwrap_or_else(PoisonError::into_inner);
                let next = Live { status: status.into(), data };
                let changed = current.get(&key).is_none_or(|live| *live != next);
                current.insert(key.clone(), next);
                changed
            };
            if changed {
                if let Some(app) = &app {
                    if let Some(session) = break_session { crate::eye_care::publish(app, session, rest); }
                    let _ = app.emit(EVENT, ());
                }
            }
        });
        let worker = Worker::start(p.directory, p.manifest, settings, self.root.join("plugin-logs").join(format!("{id}.log")), publish);
        self.workers.lock().map_err(|e| e.to_string())?.insert(id.into(), worker);
        Ok(())
    }

    pub(crate) fn device_battery(&self) -> Result<Arc<crate::device_battery::DevicePackage>, String> {
        self.device_battery.lock().map_err(|error| error.to_string())?.clone().ok_or("Device battery is disabled".into())
    }

    fn device_battery_directory(&self, plugin: &Installed) -> Result<PathBuf, String> {
        let expected = self.root.join("plugins").join("device-battery");
        if plugin.development || plugin.directory != expected || plugin.manifest.runtime.command != "device-battery-bridge.exe" {
            return Err("Device battery requires the market package".into());
        }
        let directory = expected.canonicalize().map_err(|_| "Device battery package is missing")?;
        let packages = self.root.join("plugins").canonicalize().map_err(|_| "Plugin directory is missing")?;
        if directory.parent() != Some(packages.as_path()) {
            return Err("Unsafe device battery installation path".into());
        }
        Ok(directory)
    }

    pub fn stop(&self, id: &str) {
        if id == "device-battery" {
            let package = self.device_battery.lock().unwrap_or_else(PoisonError::into_inner).take();
            if let Some(package) = package { package.stop(); }
        }
        if id == "eye-care" { if let Some(app) = &self.app { crate::eye_care::end_session(app); } }
        let worker = self.workers.lock().unwrap_or_else(PoisonError::into_inner).remove(id);
        drop(worker);
        self.live.lock().unwrap_or_else(PoisonError::into_inner).remove(id);
        self.notify();
    }

    pub fn shutdown(&self) {
        self.stop("device-battery");
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
        if !self.allows_development() { return (DEFAULT_INDEX.into(), false); }
        let r = self.registry.lock().unwrap_or_else(PoisonError::into_inner);
        if let Ok(url) = std::env::var("FLY_ISLAND_PLUGINS_INDEX") { return (url, true); }
        if r.developer_mode && !r.index_url.is_empty() { (r.index_url.clone(), true) } else { (DEFAULT_INDEX.into(), false) }
    }

    fn failure(&self, id: Option<&str>, code: &str, detail: &str) -> String {
        let scope = id.filter(|id| super::manifest::valid_id(id)).unwrap_or("index");
        process::log_catalog(&self.root.join("plugin-logs/catalog.log"), scope, code, detail, &[]);
        code.into()
    }

    async fn catalog_entries(&self, url: &str, local: bool) -> Result<Vec<IndexEntry>, String> {
        let bytes = packages::download(url, local, packages::INDEX_LIMIT).await
            .map_err(|error| self.failure(None, "plugin_index_unavailable", &error))?;
        packages::parse_index(&bytes).map_err(|error| self.failure(None, "plugin_index_incompatible", &error))
    }

    pub async fn catalog(&self) -> Result<Vec<IndexEntry>, String> {
        if !self.enabled { return Ok(Vec::new()); }
        let (url, local) = self.source();
        Ok(self.catalog_entries(&url, local).await?.into_iter()
            .filter(|entry| self.allows(&entry.id) && entry.compatible()).collect())
    }

    pub async fn install(&self, id: &str) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        if !self.allows(id) { return Err("Plugin is unavailable in this build".into()); }
        let (url, local) = self.source();
        let entry = self.catalog_entries(&url, local).await?.into_iter().find(|entry| entry.id == id)
            .ok_or_else(|| self.failure(Some(id), "plugin_not_listed", "Package is missing from the index"))?;
        if !entry.compatible() {
            return Err(self.failure(Some(id), "plugin_index_incompatible", &format!("Requires Fly Island {}", entry.min_app_version)));
        }
        let bytes = packages::download(&entry.url, local, packages::PACKAGE_LIMIT).await
            .map_err(|error| self.failure(Some(id), "plugin_package_download_failed", &error))?;
        packages::verify(&bytes, &entry)
            .map_err(|error| self.failure(Some(id), "plugin_package_integrity_failed", &error))?;
        let staging = self.root.join("plugins").join(format!(".staging-{id}"));
        let extracted = (|| {
            if staging.exists() { std::fs::remove_dir_all(&staging).map_err(|error| error.to_string())?; }
            std::fs::create_dir_all(&staging).map_err(|error| error.to_string())?;
            packages::extract(&bytes, &staging, &entry)
        })();
        let manifest = match extracted {
            Ok(m) => m,
            Err(error) => {
                let _ = std::fs::remove_dir_all(&staging);
                return Err(self.failure(Some(id), "plugin_package_invalid", &error));
            }
        };
        let mut next = self.snapshot().registry;
        let old = next.installed.get(id).cloned();
        let enabled = old.as_ref().is_some_and(|p| p.enabled);
        let directory = self.root.join("plugins").join(id);
        let backup = self.root.join("plugins").join(format!(".backup-{id}"));
        if backup.exists() { std::fs::remove_dir_all(&backup).map_err(|error| self.failure(Some(id), "plugin_install_failed", &error.to_string()))?; }
        self.stop(id);
        if directory.exists() {
            if let Err(error) = std::fs::rename(&directory, &backup) {
                if enabled { let _ = self.start(id); }
                return Err(self.failure(Some(id), "plugin_install_failed", &error.to_string()));
            }
        }
        let apply = (|| {
            std::fs::rename(&staging, &directory).map_err(|e| e.to_string())?;
            let settings = storage::upgrade_settings(old.as_ref(), &manifest);
            let mut installed = Installed { manifest, enabled, directory: directory.clone(), development: false, settings };
            super::transfer::restore_install(&self.root, &mut installed);
            next.installed.insert(id.into(), installed);
            self.persist(next)
        })();
        if let Err(error) = apply {
            let _ = std::fs::remove_dir_all(&directory);
            if backup.exists() { let _ = std::fs::rename(&backup, &directory); }
            if enabled { let _ = self.start(id); }
            return Err(self.failure(Some(id), "plugin_install_failed", &error));
        }
        if backup.exists() { let _ = std::fs::remove_dir_all(backup); }
        if self.snapshot().registry.installed.get(id).is_some_and(|p| p.enabled) {
            self.start(id).map_err(|error| self.failure(Some(id), "plugin_start_failed", &error))?;
        }
        Ok(())
    }

    pub fn enable(&self, id: &str, enabled: bool) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        if !self.allows(id) { return Err("Plugin is unavailable in this build".into()); }
        let mut next = self.snapshot().registry;
        let p = next.installed.get_mut(id).ok_or("Plugin not installed")?;
        if p.development && (!next.developer_mode || !self.allows_development()) { return Err("Developer mode is disabled".into()); }
        p.enabled = enabled;
        self.stop(id);
        self.persist(next)?;
        if enabled {
            if let Err(error) = self.start(id) {
                let mut rollback = self.snapshot().registry;
                if let Some(p) = rollback.installed.get_mut(id) { p.enabled = false; }
                self.persist(rollback)?;
                return Err(self.failure(Some(id), "plugin_start_failed", &error));
            }
        }
        Ok(())
    }

    pub fn uninstall(&self, id: &str) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        if !self.allows(id) { return Err("Plugin is unavailable in this build".into()); }
        let mut next = self.snapshot().registry;
        let p = next.installed.remove(id).ok_or("Plugin not installed")?;
        if p.development && !self.allows_development() { return Err("Development plugins are disabled".into()); }
        let expected = self.root.join("plugins").join(id);
        if !p.development && p.directory != expected { return Err("Unsafe plugin installation path".into()); }
        self.stop(id);
        // Finish outstanding actions first, then disconnect only the integration this plugin wrote.
        if !p.development && id == "minimax" && p.manifest.runtime.command == "minimax.exe" && expected.join("minimax.exe").is_file() {
            if let Err(error) = super::process::disconnect_minimax(&expected) {
                if p.enabled { let _ = self.start(id); }
                return Err(error);
            }
        }
        for s in &p.manifest.settings { if s.kind == "secret" { storage::set_secret(id, &s.key, "")?; } }
        if !p.development {
            if let Err(error) = std::fs::remove_dir_all(expected) {
                if p.enabled { let _ = self.start(id); }
                return Err(error.to_string());
            }
        }
        self.persist(next)?;
        super::transfer::forget(&self.root, id)
    }

    pub fn setting(&self, id: &str, key: &str, value: Value) -> Result<(), String> {
        if !self.enabled { return Ok(()); }
        if !self.allows(id) { return Err("Plugin is unavailable in this build".into()); }
        let mut next = self.snapshot().registry;
        let p = next.installed.get_mut(id).ok_or("Plugin not installed")?;
        if p.development && !self.allows_development() { return Err("Development plugins are disabled".into()); }
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
        let p = self.installed_for_runtime(id)?;
        let live = self.snapshot();
        let declared = p.manifest.actions.iter().any(|a| a.id == action)
            || live.live.get(id).is_some_and(|l| l.data.sessions.iter().any(|s| s.action.as_deref() == Some(action)) || l.data.notifications.iter().any(|n| n.action.as_deref() == Some(action)));
        if !declared { return Err("Unknown plugin action".into()); }
        let reply = self.workers.lock().map_err(|e| e.to_string())?.get(id).ok_or("Plugin is stopped")?.request("action", json!({"id":action}))?;
        reply.recv_timeout(std::time::Duration::from_secs(16)).map_err(|_| "Plugin action timeout".to_owned())?
    }
}
