//! Applies the user's choices in `plugins.json`: saves them, and starts the
//! plugins that are allowed to run and stops the rest.

use serde_json::{Map, Value};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use super::{
    activation::Activation,
    app_version, builtin, host, keybindings, lifecycle, lock,
    manifest::{launch_command, PluginRuntime},
    permissions::missing_permissions,
    revocations,
    runtime::{LaunchSpec, RuntimeStatus, Supervisor},
    settings,
    store::{save_state, PluginsState},
    InstalledPlugin, PluginHost,
};
use crate::agent_status;

/// Starts and stops built-in plugins like sync_processes does for processes;
/// they do not need "allow third-party plugins".
fn sync_builtins(host: &PluginHost) {
    let mut wanted: HashMap<String, Map<String, Value>> = HashMap::new();
    {
        let state = lock(&host.state);
        for plugin in lock(&host.installed).iter().filter(|plugin| plugin.builtin) {
            let Ok(manifest) = &plugin.manifest else { continue };
            let Some(grant) = state.plugins.get(&manifest.id) else { continue };
            if grant.enabled && missing_permissions(&manifest.permissions, &grant.granted_permissions).is_empty() {
                wanted.insert(manifest.id.clone(), settings::resolve(&manifest.contributes.settings, &grant.settings));
            }
        }
    }
    let mut running = lock(&host.builtins_running);
    let stopping: Vec<String> = running.iter().filter(|id| !wanted.contains_key(*id)).cloned().collect();
    for id in stopping {
        running.remove(&id);
        let result = builtin::stop(&id);
        let mut runtimes = lock(&host.runtimes);
        let entry = runtimes.entry(id).or_default();
        entry.status = RuntimeStatus::Stopped;
        entry.error = result.err();
        entry.info.clear();
    }
    for (id, settings) in wanted {
        if running.contains(&id) {
            continue;
        }
        let started = builtin::start(&id, &settings);
        let mut runtimes = lock(&host.runtimes);
        let entry = runtimes.entry(id.clone()).or_default();
        match started {
            Ok(info) => {
                running.insert(id);
                entry.status = RuntimeStatus::Running;
                entry.error = None;
                entry.info = info;
            }
            Err(error) => {
                entry.status = RuntimeStatus::Crashed;
                entry.error = Some(error);
                entry.info.clear();
            }
        }
    }
}

/// Starts plugins that should run and stops the rest. A plugin may run when
/// third-party plugins are allowed, it is on, it has a process, and every
/// permission it asks for was granted; it runs when it is eager or one of its
/// activation events started it (lifecycle.rs).
pub(super) fn sync_processes() -> Result<(), String> {
    // One sync at a time: it runs from the lifecycle tick, activation threads
    // and commands, and a sync that decided what to run before another one
    // started an on-demand plugin would stop that plugin again.
    static SYNC: Mutex<()> = Mutex::new(());
    let _one_at_a_time = lock(&SYNC);
    let host = host()?;
    let mut candidates: Vec<(Activation, LaunchSpec)> = Vec::new();
    {
        let state = lock(&host.state);
        for plugin in lock(&host.installed).iter() {
            let Ok(manifest) = &plugin.manifest else { continue };
            let PluginRuntime::Process { command, args } = &manifest.runtime else { continue };
            // Development plugins (dev.rs) are on, with every permission they ask for.
            let grant = state.plugins.get(&manifest.id).cloned();
            // A version taken off the market (revocations.rs) never runs.
            let revoked = revocations::find(&state.revoked, &manifest.id, &manifest.version).is_some();
            let allowed = plugin.dev
                || !revoked
                    && grant.as_ref().is_some_and(|grant| {
                        state.allow_third_party && grant.enabled && missing_permissions(&manifest.permissions, &grant.granted_permissions).is_empty()
                    });
            if !allowed {
                continue;
            }
            let saved_settings = grant.map(|grant| grant.settings).unwrap_or_default();
            let launch = launch_command(&plugin.dir, command, args);
            let (program, args) = match launch {
                Ok(launch) => launch,
                Err(error) => {
                    lock(&host.runtimes).entry(manifest.id.clone()).or_default().error = Some(error);
                    continue;
                }
            };
            candidates.push((
                manifest.activation.clone(),
                LaunchSpec {
                    plugin_id: manifest.id.clone(),
                    program,
                    args,
                    dir: plugin.dir.clone(),
                    data_dir: host.data_dir.join(&manifest.id),
                    api_version: manifest.api_version,
                    granted: manifest.permissions.clone(),
                    optional: manifest.optional_permissions.clone(),
                    app_version: app_version(&host.app),
                    display_name: manifest.name.en().to_string(),
                    settings: settings::resolve(&manifest.contributes.settings, &saved_settings),
                    activation_event: String::new(),
                    dev: plugin.dev,
                    experimental_apis: manifest.experimental_apis.clone(),
                },
            ));
        }
    }
    lifecycle::set_runnable(candidates.iter().map(|(activation, spec)| (spec.plugin_id.clone(), activation.clone())).collect());
    let mut wanted: HashMap<String, LaunchSpec> = HashMap::new();
    for (activation, mut spec) in candidates {
        match lifecycle::should_run(&spec.plugin_id, &activation) {
            Some(reason) => {
                spec.activation_event = reason;
                wanted.insert(spec.plugin_id.clone(), spec);
            }
            None => {
                // Waits for an activation event; shown as idle, not stopped.
                let mut runtimes = lock(&host.runtimes);
                let entry = runtimes.entry(spec.plugin_id).or_default();
                if entry.status == RuntimeStatus::Stopped {
                    entry.status = RuntimeStatus::Idle;
                }
            }
        }
    }

    let stopping: Vec<Supervisor> = {
        let mut supervisors = lock(&host.supervisors);
        let gone: Vec<String> = supervisors.keys().filter(|id| !wanted.contains_key(*id)).cloned().collect();
        gone.iter().filter_map(|id| supervisors.remove(id)).collect()
    };
    for supervisor in stopping {
        let id = supervisor.plugin_id().to_string();
        supervisor.stop();
        agent_status::clear_external_owner(&id);
    }

    let mut supervisors = lock(&host.supervisors);
    for (id, spec) in wanted {
        if supervisors.contains_key(&id) {
            continue;
        }
        match Supervisor::start(host.app.clone(), spec, Arc::clone(&host.runtimes)) {
            Ok(supervisor) => {
                supervisors.insert(id, supervisor);
            }
            Err(error) => lock(&host.runtimes).entry(id).or_default().error = Some(error),
        }
    }
    drop(supervisors);
    sync_builtins(host);
    keybindings::refresh();
    Ok(())
}

/// Stops one plugin (if running) and drops the agent statuses it reported.
pub(super) fn stop_plugin(id: &str) -> Result<(), String> {
    let supervisor = lock(&host()?.supervisors).remove(id);
    if let Some(supervisor) = supervisor {
        supervisor.stop();
    }
    agent_status::clear_external_owner(id);
    Ok(())
}

/// Stops every running plugin so the next sync starts them with fresh files.
pub(super) fn stop_all() -> Result<(), String> {
    let stopping: Vec<Supervisor> = lock(&host()?.supervisors).drain().map(|(_, supervisor)| supervisor).collect();
    for supervisor in stopping {
        let id = supervisor.plugin_id().to_string();
        supervisor.stop();
        agent_status::clear_external_owner(&id);
    }
    Ok(())
}

pub(super) fn update_state(change: impl FnOnce(&mut PluginsState, &[InstalledPlugin]) -> Result<(), String>) -> Result<(), String> {
    let host = host()?;
    let installed = lock(&host.installed);
    let mut state = lock(&host.state);
    let mut next = state.clone();
    change(&mut next, &installed)?;
    save_state(&host.state_path, &next)?;
    *state = next;
    Ok(())
}
