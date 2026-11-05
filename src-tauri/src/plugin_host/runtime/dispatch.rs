//! Answers a plugin's JSON-RPC requests: checks the permission each method
//! needs and hands the call to the part of the island that owns the data.

use serde_json::{json, Value};

use super::{current_entry, lock, set_keep_alive, Context};
use crate::plugin_host::{
    events::{event_permission, MAX_SUBSCRIBE},
    dev, feeds, notify, sensitive, storage, views, webviews,
    permissions::{method_permission, CAPABILITIES},
    rpc,
    settings::parse_info,
};
use crate::{agent_status, clipboard_history, file_shelf, local_api, media_control};

pub(super) fn initialize_params(context: &Context) -> Value {
    let spec = &context.spec;
    let mut params = json!({
        "apiVersion": spec.api_version,
        // Every capability so far needs API version 2.
        "capabilities": if spec.api_version >= 2 { &CAPABILITIES[..] } else { &[] },
        "appVersion": spec.app_version,
        "pluginId": spec.plugin_id,
        "dataDir": spec.data_dir.display().to_string(),
        "permissions": spec.granted,
        "settings": *lock(&context.settings),
    });
    if spec.api_version >= 2 {
        // Why this process was started: onStartup, onCommand:<id>, onSchedule:<minutes>, ...
        params["activationEvent"] = json!(spec.activation_event);
    }
    if !spec.experimental_apis.is_empty() {
        // Development plugins only: which of the experimental APIs they listed the island has.
        params["experimentalApis"] = json!(dev::granted_experimental(&spec.experimental_apis));
    }
    params
}

pub(super) fn answer_request(context: &Context, id: &Value, method: &str, params: Value) -> String {
    // Methods about the plugin itself need no permission.
    match method {
        "host.info" => return rpc::result_line(id, initialize_params(context)),
        "settings.get" => return rpc::result_line(id, Value::Object(lock(&context.settings).clone())),
        "ui.setInfo" => {
            return match parse_info(&params) {
                Ok(items) => {
                    let mut table = lock(&context.table);
                    if let Some(info) = current_entry(context, &mut table) {
                        info.info = items;
                    }
                    rpc::result_line(id, json!({}))
                }
                Err(message) => rpc::error_line(id, rpc::HOST_ERROR, &message, Some(json!({ "status": 400 }))),
            };
        }
        // Version 1 plugins keep getting "unknown method" for these.
        "events.subscribe" | "events.unsubscribe" if context.spec.api_version >= 2 => {
            return change_subscriptions(context, id, method == "events.subscribe", &params);
        }
        "host.keepAlive" if context.spec.api_version >= 2 => {
            return answer(id, keep_alive(context, &params));
        }
        "view.update" | "view.patch" | "status.update" if context.spec.api_version >= 2 => {
            return answer(id, views::answer(&context.app, &context.spec.plugin_id, method, &params));
        }
        "webview.postMessage" if context.spec.api_version >= 2 => {
            return answer(id, webviews::post_from_plugin(&context.app, &context.spec.plugin_id, &params));
        }
        "storage.get" | "storage.set" | "storage.delete" | "storage.keys" if context.spec.api_version >= 2 => {
            return answer(id, storage::answer_storage(&context.spec.data_dir, method, &params));
        }
        _ => {}
    }
    let Some((name, permission)) = method_permission(method) else {
        return rpc::error_line(id, rpc::METHOD_NOT_FOUND, &format!("Unknown method \"{method}\"."), None);
    };
    if !context.spec.granted.iter().any(|granted| granted == permission) {
        let message = format!("The plugin was not given the \"{permission}\" permission.");
        return rpc::error_line(id, rpc::PERMISSION_DENIED, &message, None);
    }
    if sensitive::is_sensitive(permission) && !sensitive::check(&context.app, &context.spec.plugin_id, permission) {
        let message = format!("The user did not allow the \"{permission}\" permission.");
        return rpc::error_line(id, rpc::PERMISSION_DENIED, &message, None);
    }
    let owner = &context.spec.plugin_id;
    let result = match name {
        "agentStatus.report" => agent_status::report_external_status(owner, &context.spec.display_name, &params),
        "agentStatus.clear" => agent_status::clear_external_status(owner, &params),
        "island.notify" => notify::show(&context.app, owner, &params),
        "secrets.get" | "secrets.set" | "secrets.delete" => storage::answer_secret(owner, name, &params),
        "clipboard.history" => clipboard_history::plugin_history(&params),
        "messages.list" => feeds::messages_list(),
        "media.nowPlaying" => media_control::plugin_now_playing(),
        "media.playPause" | "media.next" | "media.previous" => media_control::plugin_media_command(name),
        "shelf.list" => file_shelf::plugin_shelf_list(),
        "shelf.add" => file_shelf::plugin_shelf_add(&context.app, &params),
        "shelf.remove" => file_shelf::plugin_shelf_remove(&context.app, &params),
        _ => local_api::call_island(&context.app, name, params),
    };
    answer(id, result)
}

fn answer(id: &Value, answer: Result<Value, (u16, String)>) -> String {
    match answer {
        Ok(result) => rpc::result_line(id, result),
        Err((status, message)) => rpc::error_line(id, rpc::HOST_ERROR, &message, Some(json!({ "status": status }))),
    }
}

/// `events.subscribe` / `events.unsubscribe` with `{ events: [name] }`. Every
/// name is checked before any is applied; answers `{ events }`, the plugin's
/// subscriptions afterwards.
fn change_subscriptions(context: &Context, id: &Value, subscribe: bool, params: &Value) -> String {
    let bad_params = |message: &str| rpc::error_line(id, rpc::HOST_ERROR, message, Some(json!({ "status": 400 })));
    let Some(requested) = params.get("events").and_then(Value::as_array) else {
        return bad_params("Expected { events: [string] }.");
    };
    if requested.len() > MAX_SUBSCRIBE {
        return bad_params(&format!("At most {MAX_SUBSCRIBE} events at once."));
    }
    let mut names = Vec::with_capacity(requested.len());
    for value in requested {
        let Some(text) = value.as_str() else {
            return bad_params("Event names must be strings.");
        };
        let Some((name, permission)) = event_permission(text) else {
            return bad_params(&format!("Unknown event \"{text}\"."));
        };
        if let Some(permission) = permission.filter(|_| subscribe) {
            if !context.spec.granted.iter().any(|granted| granted == permission) {
                let message = format!("The \"{name}\" event needs the \"{permission}\" permission.");
                return rpc::error_line(id, rpc::PERMISSION_DENIED, &message, None);
            }
            if sensitive::is_sensitive(permission) && !sensitive::check(&context.app, &context.spec.plugin_id, permission) {
                let message = format!("The user did not allow the \"{permission}\" permission.");
                return rpc::error_line(id, rpc::PERMISSION_DENIED, &message, None);
            }
        }
        names.push(name);
    }
    let answer = {
        let mut subscriptions = lock(&context.subscriptions);
        for name in names.iter().copied() {
            if subscribe {
                subscriptions.insert(name);
            } else {
                subscriptions.remove(name);
            }
        }
        rpc::result_line(id, json!({ "events": *subscriptions }))
    };
    // After the subscription is in place, so the watcher sees it.
    if subscribe && names.contains(&"media.changed") {
        feeds::watch_media();
    }
    answer
}

/// `host.keepAlive { reason }`: an on-demand plugin asks not to be stopped when
/// idle (the settings page shows why); `reason: null` lets it be stopped again.
fn keep_alive(context: &Context, params: &Value) -> Result<Value, (u16, String)> {
    let reason = match params.get("reason") {
        None | Some(Value::Null) => None,
        Some(Value::String(text)) if (1..=100).contains(&text.trim().chars().count()) => Some(text.trim().to_string()),
        Some(_) => return Err((400, "\"reason\" must be 1-100 characters, or null to let the plugin stop when idle.".into())),
    };
    set_keep_alive(context, reason);
    Ok(json!({}))
}
