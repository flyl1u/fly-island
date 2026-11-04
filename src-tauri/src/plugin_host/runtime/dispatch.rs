//! Answers a plugin's JSON-RPC requests: checks the permission each method
//! needs and hands the call to the part of the island that owns the data.

use serde_json::{json, Value};

use super::{current_entry, lock, Context};
use crate::plugin_host::{manifest::HOST_API_VERSION, permissions::method_permission, rpc, settings::parse_info};
use crate::{agent_status, local_api};

pub(super) fn initialize_params(context: &Context) -> Value {
    let spec = &context.spec;
    json!({
        "apiVersion": HOST_API_VERSION,
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
