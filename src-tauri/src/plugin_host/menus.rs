//! `contributes.menus`: plugin commands the island lists in its own menus
//! (API version 2). The only menu so far is `todo/context`, the right-click
//! menu of a todo; picking an entry sends the plugin `command` with
//! `args.todoId`.

use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{host, lock, manifest::LocalizedText, PluginHost};

pub(super) const TODO_CONTEXT: &str = "todo/context";
const MAX_MENU_ITEMS: usize = 4;
const MAX_TODO_ID_CHARS: usize = 128;

/// Mirrored by the `menus` field documented in plugins/schema/manifest.schema.json.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct PluginMenus {
    #[serde(rename = "todo/context", default, skip_serializing_if = "Vec::is_empty")]
    pub todo_context: Vec<MenuItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct MenuItem {
    /// The id of one of the plugin's `contributes.commands`.
    pub command: String,
}

/// One entry of an island menu. Mirrored by `PluginMenuEntry` in src/features/plugins/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginMenuEntry {
    plugin_id: String,
    plugin_name: LocalizedText,
    command: String,
    title: LocalizedText,
}

/// Checks a manifest's menus against its commands; version 1 plugins never had
/// menus, so theirs are dropped to keep version 1 behaviour.
pub(super) fn check(menus: &mut PluginMenus, command_ids: &[&str], api_version: u32) -> Result<(), String> {
    if api_version < 2 {
        *menus = PluginMenus::default();
        return Ok(());
    }
    let items = &menus.todo_context;
    if items.len() > MAX_MENU_ITEMS {
        return Err(format!("The \"{TODO_CONTEXT}\" menu can list at most {MAX_MENU_ITEMS} commands."));
    }
    for (index, item) in items.iter().enumerate() {
        if !command_ids.contains(&item.command.as_str()) {
            return Err(format!("The \"{TODO_CONTEXT}\" menu names \"{}\", which is not one of the plugin's commands.", item.command));
        }
        if items[..index].iter().any(|earlier| earlier.command == item.command) {
            return Err(format!("The \"{TODO_CONTEXT}\" menu lists \"{}\" twice.", item.command));
        }
    }
    Ok(())
}

fn known_menu(menu: &str) -> Result<(), String> {
    if menu == TODO_CONTEXT {
        Ok(())
    } else {
        Err(format!("Unknown plugin menu \"{menu}\"."))
    }
}

/// What running plugins add to `menu`, in plugin order.
pub(super) fn entries(menu: &str) -> Result<Vec<PluginMenuEntry>, String> {
    known_menu(menu)?;
    let host = host()?;
    let running: Vec<String> = lock(&host.supervisors).keys().cloned().collect();
    let entries = lock(&host.installed)
        .iter()
        .filter(|plugin| running.contains(&plugin.folder))
        .filter_map(|plugin| plugin.manifest.as_ref().ok())
        .flat_map(|manifest| {
            manifest.contributes.menus.todo_context.iter().filter_map(|item| {
                let command = manifest.contributes.commands.iter().find(|command| command.id() == item.command)?;
                Some(PluginMenuEntry {
                    plugin_id: manifest.id.clone(),
                    plugin_name: manifest.name.clone(),
                    command: item.command.clone(),
                    title: command.title().clone(),
                })
            })
        })
        .collect();
    Ok(entries)
}

/// Sends the plugin `command` with `{ id, args: { todoId } }`, if `menu` lists it.
pub(super) fn run(id: &str, menu: &str, command: &str, todo_id: &str) -> Result<(), String> {
    known_menu(menu)?;
    if todo_id.is_empty() || todo_id.chars().count() > MAX_TODO_ID_CHARS {
        return Err("The todo id is empty or too long.".into());
    }
    let host = host()?;
    if !lists(host, id, command) {
        return Err("Unknown plugin menu command.".into());
    }
    let supervisors = lock(&host.supervisors);
    let supervisor = supervisors.get(id).ok_or("The plugin is not running.")?;
    supervisor.notify("command", json!({ "id": command, "args": { "todoId": todo_id } }))
}

fn lists(host: &PluginHost, id: &str, command: &str) -> bool {
    lock(&host.installed).iter().any(|plugin| {
        plugin.folder == id
            && plugin
                .manifest
                .as_ref()
                .is_ok_and(|manifest| manifest.contributes.menus.todo_context.iter().any(|item| item.command == command))
    })
}
