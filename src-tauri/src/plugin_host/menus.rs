//! `contributes.menus`: plugin commands the island lists in its own right-click
//! menus (API version 2). Picking an entry sends the plugin `command` with
//! `args` describing what was right-clicked:
//!
//! - `todo/context`: a todo, `{ todoId }`
//! - `clipboard/context`: a text entry of the clipboard history, `{ item }` as
//!   in `clipboard.history`
//! - `shelf/context`: a file shelf entry, `{ item }` as in `shelf.list`
//! - `message/context`: a QQ notification or mail, `{ item }` as in `messages.list`
//!
//! The island window only says which entry; Rust looks it up, so a plugin gets
//! exactly the entry the user picked. Picking it is the user's consent, so the
//! read permission of that data is not needed for this one entry.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{feeds, host, lifecycle, lock, manifest::LocalizedText, PluginHost};
use crate::{clipboard_history, file_shelf};

pub(super) const TODO_CONTEXT: &str = "todo/context";
pub(super) const CLIPBOARD_CONTEXT: &str = "clipboard/context";
pub(super) const SHELF_CONTEXT: &str = "shelf/context";
pub(super) const MESSAGE_CONTEXT: &str = "message/context";
const MENUS: [&str; 4] = [TODO_CONTEXT, CLIPBOARD_CONTEXT, SHELF_CONTEXT, MESSAGE_CONTEXT];
const MAX_MENU_ITEMS: usize = 4;
const MAX_ITEM_ID_CHARS: usize = 128;

/// Mirrored by the `menus` field documented in plugins/schema/manifest.schema.json.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct PluginMenus {
    #[serde(rename = "todo/context", default, skip_serializing_if = "Vec::is_empty")]
    pub todo_context: Vec<MenuItem>,
    #[serde(rename = "clipboard/context", default, skip_serializing_if = "Vec::is_empty")]
    pub clipboard_context: Vec<MenuItem>,
    #[serde(rename = "shelf/context", default, skip_serializing_if = "Vec::is_empty")]
    pub shelf_context: Vec<MenuItem>,
    #[serde(rename = "message/context", default, skip_serializing_if = "Vec::is_empty")]
    pub message_context: Vec<MenuItem>,
}

impl PluginMenus {
    pub(super) fn items(&self, menu: &str) -> &[MenuItem] {
        match menu {
            TODO_CONTEXT => &self.todo_context,
            CLIPBOARD_CONTEXT => &self.clipboard_context,
            SHELF_CONTEXT => &self.shelf_context,
            MESSAGE_CONTEXT => &self.message_context,
            _ => &[],
        }
    }
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
    for menu in MENUS {
        let items = menus.items(menu);
        if items.len() > MAX_MENU_ITEMS {
            return Err(format!("The \"{menu}\" menu can list at most {MAX_MENU_ITEMS} commands."));
        }
        for (index, item) in items.iter().enumerate() {
            if !command_ids.contains(&item.command.as_str()) {
                return Err(format!("The \"{menu}\" menu names \"{}\", which is not one of the plugin's commands.", item.command));
            }
            if items[..index].iter().any(|earlier| earlier.command == item.command) {
                return Err(format!("The \"{menu}\" menu lists \"{}\" twice.", item.command));
            }
        }
    }
    Ok(())
}

fn known_menu(menu: &str) -> Result<(), String> {
    if MENUS.contains(&menu) {
        Ok(())
    } else {
        Err(format!("Unknown plugin menu \"{menu}\"."))
    }
}

/// What running plugins add to `menu`, in plugin order.
pub(super) fn entries(menu: &str) -> Result<Vec<PluginMenuEntry>, String> {
    known_menu(menu)?;
    let host = host()?;
    // Plugins that may run: picking an entry starts an on-demand one.
    let running = lifecycle::runnable_ids();
    let entries = lock(&host.installed)
        .iter()
        .filter(|plugin| running.contains(&plugin.folder))
        .filter_map(|plugin| plugin.manifest.as_ref().ok())
        .flat_map(|manifest| {
            manifest.contributes.menus.items(menu).iter().filter_map(|item| {
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

/// Checks `item_id` for `menu`: the todo menu's whole `args` right away, None
/// for menus whose entry is looked up (`menu_args`). Kept apart so tests need
/// not link the clipboard, shelf and message readers.
pub(super) fn check_item(menu: &str, item_id: &str) -> Result<Option<Value>, String> {
    known_menu(menu)?;
    if item_id.is_empty() || item_id.chars().count() > MAX_ITEM_ID_CHARS {
        return Err("The item id is empty or too long.".into());
    }
    Ok((menu == TODO_CONTEXT).then(|| json!({ "todoId": item_id })))
}

/// The `args` a plugin gets for `item_id` in `menu`, looked up where the data lives.
fn menu_args(menu: &str, item_id: &str) -> Result<Value, String> {
    if let Some(args) = check_item(menu, item_id)? {
        return Ok(args);
    }
    let gone = || "The item is no longer there.".to_string();
    let find = |list: Value| list["items"].as_array().and_then(|items| items.iter().find(|item| item["id"] == item_id).cloned());
    let item = match menu {
        CLIPBOARD_CONTEXT => clipboard_history::plugin_item(item_id),
        SHELF_CONTEXT => file_shelf::plugin_shelf_list().ok().and_then(find),
        MESSAGE_CONTEXT => feeds::messages_list().ok().and_then(find),
        _ => return Err(format!("Unknown plugin menu \"{menu}\".")),
    };
    item.map(|item| json!({ "item": item })).ok_or_else(gone)
}

/// Sends the plugin `command` with `{ id, args }` for the entry `item_id` of `menu`, if `menu` lists it.
pub(super) fn run(id: &str, menu: &str, command: &str, item_id: &str) -> Result<(), String> {
    known_menu(menu)?;
    let host = host()?;
    if !lists(host, id, menu, command) {
        return Err("Unknown plugin menu command.".into());
    }
    let args = menu_args(menu, item_id)?;
    lifecycle::deliver(id, format!("onCommand:{command}"), "command", json!({ "id": command, "args": args }))
}

fn lists(host: &PluginHost, id: &str, menu: &str, command: &str) -> bool {
    lock(&host.installed).iter().any(|plugin| {
        plugin.folder == id
            && plugin
                .manifest
                .as_ref()
                .is_ok_and(|manifest| manifest.contributes.menus.items(menu).iter().any(|item| item.command == command))
    })
}
