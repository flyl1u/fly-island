//! Answers a plugin's JSON-RPC requests: checks the permission each method
//! needs and hands the call to the part of the island that owns the data.

use serde_json::{json, Value};

use super::{current_entry, lock, Context};
use crate::plugin_host::{
    events::{event_permission, MAX_SUBSCRIBE},
    permissions::{method_permission, CAPABILITIES},
    rpc,
    settings::parse_info,
};
use crate::{agent_status, local_api};

pub(super) fn initialize_params(context: &Context) -> Value {
    let spec = &context.spec;
    json!({
        "apiVersion": spec.api_version,
        // Every capability so far needs API version 2.
        "capabilities": if spec.api_version >= 2 { &CAPABILITIES[..] } else { &[] },
        "appVersion": spec.app_version,
        "pluginId": spec.plugin_id,
        "dataDir": spec.data_dir.display().to_string(),
        "permissions": spec.granted,
        "settings": *lock(&context.settings),
    })
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
        _ => {}
    }
    let Some((name, permission)) = method_permission(method) else {
        return rpc::error_line(id, rpc::METHOD_NOT_FOUND, &format!("Unknown method \"{method}\"."), None);
    };
    if !context.spec.granted.iter().any(|granted| granted == permission) {
        let message = format!("The plugin was not given the \"{permission}\" permission.");
        return rpc::error_line(id, rpc::PERMISSION_DENIED, &message, None);
    }
    let owner = &context.spec.plugin_id;
    let answer = match name {
        "agentStatus.report" => agent_status::report_external_status(owner, &context.spec.display_name, &params),
        "agentStatus.clear" => agent_status::clear_external_status(owner, &params),
        _ => local_api::call_island(&context.app, name, params),
    };
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
        }
        names.push(name);
    }
    let mut subscriptions = lock(&context.subscriptions);
    for name in names {
        if subscribe {
            subscriptions.insert(name);
        } else {
            subscriptions.remove(name);
        }
    }
    rpc::result_line(id, json!({ "events": *subscriptions }))
}
