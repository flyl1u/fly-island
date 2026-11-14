use super::{
    credentials,
    model::{Account, AccountState, Configuration, ImportEntry, QueryResult, Secrets, Snapshot},
    query,
};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock},
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT: &str = "api-balance-changed";
static SERVICE: OnceLock<Arc<Service>> = OnceLock::new();

struct State {
    config: Configuration,
    accounts: HashMap<String, AccountState>,
    due: HashMap<String, Instant>,
    jobs: HashMap<String, u64>,
    revision: u64,
    sequence: u64,
    stopped: bool,
}

pub struct Service {
    app: AppHandle,
    path: PathBuf,
    state: Mutex<State>,
    writes: Mutex<()>,
    changed: Condvar,
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn view(state: &State) -> Snapshot {
    Snapshot {
        revision: state.sequence,
        enabled: state.config.enabled,
        accounts: state
            .config
            .accounts
            .iter()
            .filter_map(|a| state.accounts.get(&a.id).cloned())
            .collect(),
    }
}

fn row(account: Account, secrets: &Secrets) -> AccountState {
    AccountState {
        account,
        has_credentials: !secrets.api_key.is_empty()
            || !secrets.access_token.is_empty()
            || !secrets.secret_access_key.is_empty(),
        code_configured: !secrets.code.is_empty(),
        result: None,
        updated_at: None,
        attempted_at: None,
        refreshing: false,
        error: None,
        warning: None,
    }
}

pub fn get() -> Result<Arc<Service>, String> {
    SERVICE
        .get()
        .cloned()
        .ok_or_else(|| "Balance service is unavailable".into())
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("api-balance.json");
    let config: Configuration = match fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "Unable to read API balance configuration".to_string())?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Configuration::default(),
        Err(_) => return Err("Unable to read API balance configuration".into()),
    };
    if config.accounts.len() > 50 {
        return Err("Too many API balance accounts".into());
    }
    let mut accounts = HashMap::new();
    let mut due = HashMap::new();
    for a in &config.accounts {
        super::model::validate_account(a)?;
        let mut state = row(a.clone(), &Secrets::default());
        match credentials::read(&a.id) {
            Ok(s) => {
                state.has_credentials = !s.api_key.is_empty()
                    || !s.access_token.is_empty()
                    || !s.secret_access_key.is_empty();
                state.code_configured = !s.code.is_empty();
            }
            Err(e) => state.error = Some(e),
        }
        accounts.insert(a.id.clone(), state);
        due.insert(a.id.clone(), Instant::now());
    }
    let service = Arc::new(Service {
        app: app.clone(),
        path,
        state: Mutex::new(State {
            config,
            accounts,
            due,
            jobs: HashMap::new(),
            revision: 0,
            sequence: 0,
            stopped: false,
        }),
        writes: Mutex::new(()),
        changed: Condvar::new(),
    });
    if SERVICE.set(service.clone()).is_ok() {
        thread::spawn(move || service.schedule());
    }
    Ok(())
}

pub fn shutdown() {
    if let Some(s) = SERVICE.get() {
        locked(&s.state).stopped = true;
        s.changed.notify_all();
    }
}

impl Service {
    pub fn snapshot(&self) -> Snapshot {
        view(&locked(&self.state))
    }

    fn publish(&self) {
        let _ = self.app.emit(EVENT, self.snapshot());
        self.changed.notify_all();
    }

    fn persist(&self, config: &Configuration) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(config).map_err(|e| e.to_string())?;
        let parent = self
            .path
            .parent()
            .ok_or("Missing configuration directory")?;
        fs::create_dir_all(parent)
            .map_err(|_| "Unable to create balance settings directory".to_string())?;
        let temporary = self.path.with_extension("json.tmp");
        fs::write(&temporary, bytes).map_err(|_| "Unable to write balance settings".to_string())?;
        fs::rename(&temporary, &self.path).map_err(|_| "Unable to save balance settings".into())
    }

    pub fn enable(&self, enabled: bool) -> Result<Snapshot, String> {
        let _guard = locked(&self.writes);
        let mut state = locked(&self.state);
        let mut config = state.config.clone();
        config.enabled = enabled;
        self.persist(&config)?;
        state.config = config;
        state.revision += 1;
        state.sequence += 1;
        if enabled {
            for at in state.due.values_mut() {
                *at = Instant::now();
            }
        }
        drop(state);
        self.publish();
        Ok(self.snapshot())
    }

    pub fn save(&self, account: Account, new: Secrets) -> Result<Snapshot, String> {
        super::model::validate_account(&account)?;
        let _guard = locked(&self.writes);
        let mut config = locked(&self.state).config.clone();
        let existing = config.accounts.iter().position(|a| a.id == account.id);
        if existing.is_none() && config.accounts.len() >= 50 {
            return Err("Maximum 50 balance accounts".into());
        }
        let old = credentials::read(&account.id)?;
        let secrets = credentials::merge(old.clone(), new)?;
        credentials::save(&account.id, &secrets)?;
        if let Some(i) = existing {
            config.accounts[i] = account.clone();
        } else {
            config.accounts.push(account.clone());
        }
        if let Err(error) = self.persist(&config) {
            return match credentials::save(&account.id, &old) {
                Ok(()) => Err(error),
                Err(_) => Err(format!("{error}; unable to restore account credentials")),
            };
        }
        let mut state = locked(&self.state);
        state.config = config;
        state.revision += 1;
        state.sequence += 1;
        let mut next = row(account.clone(), &secrets);
        next.refreshing = state.jobs.contains_key(&account.id);
        state.accounts.insert(account.id.clone(), next);
        state.due.insert(account.id.clone(), Instant::now());
        drop(state);
        self.publish();
        Ok(self.snapshot())
    }

    pub fn import(&self, entries: Vec<ImportEntry>) -> Result<Snapshot, String> {
        let _guard = locked(&self.writes);
        let mut config = locked(&self.state).config.clone();
        if entries.is_empty() || entries.len() + config.accounts.len() > 50 {
            return Err("Import must contain 1–50 accounts within the account limit".into());
        }
        let mut seen = std::collections::HashSet::new();
        let mut prepared = Vec::new();
        for e in &entries {
            super::model::validate_account(&e.account)?;
            let secrets = credentials::merge(Secrets::default(), e.secrets.clone())?;
            if e.account.enabled
                || !seen.insert(e.account.id.clone())
                || config.accounts.iter().any(|a| a.id == e.account.id)
            {
                return Err("Imported accounts must have unique new IDs and be disabled".into());
            }
            prepared.push((e.account.clone(), secrets));
        }
        let mut written = Vec::new();
        let saved = (|| {
            for (account, secrets) in &prepared {
                credentials::save(&account.id, secrets)?;
                written.push(account.id.clone());
                config.accounts.push(account.clone());
            }
            self.persist(&config)
        })();
        if let Err(error) = saved {
            let mut cleaned = true;
            for id in written {
                if credentials::delete(&id).is_err() {
                    cleaned = false;
                }
            }
            return Err(if cleaned {
                error
            } else {
                format!("{error}; some imported credentials could not be cleaned up")
            });
        }
        let mut state = locked(&self.state);
        state.config = config;
        state.revision += 1;
        state.sequence += 1;
        for (account, secrets) in prepared {
            state.due.insert(account.id.clone(), Instant::now());
            state
                .accounts
                .insert(account.id.clone(), row(account, &secrets));
        }
        drop(state);
        self.publish();
        Ok(self.snapshot())
    }

    pub fn remove(&self, id: &str) -> Result<Snapshot, String> {
        let _guard = locked(&self.writes);
        let mut state = locked(&self.state);
        if !state.accounts.contains_key(id) {
            return Err("Account was not found".into());
        }
        let old = credentials::read(id)?;
        let mut config = state.config.clone();
        config.accounts.retain(|a| a.id != id);
        let removed = credentials::delete(id).and_then(|()| self.persist(&config));
        if let Err(error) = removed {
            return match credentials::save(id, &old) {
                Ok(()) => Err(error),
                Err(_) => Err(format!("{error}; unable to restore account credentials")),
            };
        }
        state.config = config;
        state.accounts.remove(id);
        state.due.remove(id);
        state.revision += 1;
        state.sequence += 1;
        drop(state);
        self.publish();
        Ok(self.snapshot())
    }

    pub fn script(&self, id: &str) -> Result<String, String> {
        if !locked(&self.state).accounts.contains_key(id) {
            return Err("Account was not found".into());
        }
        Ok(credentials::read(id)?.code)
    }

    fn begin(&self, id: &str) -> Result<(Account, u64), String> {
        let mut state = locked(&self.state);
        if !state.config.enabled {
            return Err("Enable the API balance plugin first".into());
        }
        if state.jobs.contains_key(id) {
            return Err("Account refresh is already running".into());
        }
        let generation = state.revision;
        let a = state.accounts.get_mut(id).ok_or("Account was not found")?;
        a.refreshing = true;
        a.attempted_at = Some(chrono::Utc::now().timestamp_millis());
        let account = a.account.clone();
        state.jobs.insert(id.into(), generation);
        state.sequence += 1;
        state.due.insert(
            id.into(),
            Instant::now() + Duration::from_secs(account.interval_minutes.max(1) * 60),
        );
        drop(state);
        self.publish();
        Ok((account, generation))
    }

    pub async fn refresh(self: Arc<Self>, id: String) -> Result<Snapshot, String> {
        let (account, generation) = self.begin(&id)?;
        let secret_id = id.clone();
        let secrets = tauri::async_runtime::spawn_blocking(move || credentials::read(&secret_id))
            .await
            .map_err(|_| "Credential task failed".to_string())
            .and_then(|v| v);
        let result = match secrets {
            Ok(secrets) => query::run(account, secrets).await,
            Err(error) => Err(error),
        };
        let mut state = locked(&self.state);
        state.jobs.remove(&id);
        state.sequence += 1;
        let current = state.revision == generation && state.config.enabled;
        if let Some(row) = state.accounts.get_mut(&id) {
            row.refreshing = false;
            if current {
                match result {
                    Ok(result) => {
                        row.warning = super::alerts::evaluate(
                            &row.account,
                            &result,
                            row.warning.as_ref(),
                            chrono::Utc::now().timestamp_millis(),
                        );
                        row.result = Some(result);
                        row.updated_at = Some(chrono::Utc::now().timestamp_millis());
                        row.error = None;
                    }
                    Err(error) => row.error = Some(error),
                }
            }
        }
        drop(state);
        self.publish();
        Ok(self.snapshot())
    }

    fn schedule(self: Arc<Self>) {
        loop {
            let mut state = locked(&self.state);
            if state.stopped {
                return;
            }
            let due: Vec<_> = if state.config.enabled {
                state
                    .config
                    .accounts
                    .iter()
                    .filter(|a| {
                        a.enabled && a.interval_minutes > 0 && !state.jobs.contains_key(&a.id)
                    })
                    .filter_map(|a| state.due.get(&a.id).map(|at| (a.id.clone(), *at)))
                    .collect()
            } else {
                vec![]
            };
            let now = Instant::now();
            if let Some((id, _)) = due.iter().find(|(_, at)| *at <= now) {
                let id = id.clone();
                state.due.insert(id.clone(), now + Duration::from_secs(60));
                drop(state);
                let service = self.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = service.refresh(id).await;
                });
                continue;
            }
            let delay = due
                .iter()
                .map(|(_, at)| at.saturating_duration_since(now))
                .min()
                .unwrap_or(Duration::from_secs(86400));
            let _unused = self
                .changed
                .wait_timeout(state, delay)
                .unwrap_or_else(std::sync::PoisonError::into_inner);
        }
    }
}

pub async fn test(account: Account, secrets: Secrets) -> Result<QueryResult, String> {
    super::model::validate_account(&account)?;
    let id = account.id.clone();
    let existing = if get()?
        .snapshot()
        .accounts
        .iter()
        .any(|a| a.account.id == id)
    {
        tauri::async_runtime::spawn_blocking(move || credentials::read(&id))
            .await
            .map_err(|_| "Unable to read credentials".to_string())??
    } else {
        Secrets::default()
    };
    query::run(account, credentials::merge(existing, secrets)?).await
}
