mod alerts;
mod credentials;
mod http;
mod model;
mod plan_parsers;
mod providers;
mod query;
mod script;
mod service;
mod volcengine;

use model::{Account, ImportEntry, QueryResult, Secrets, Snapshot};
pub use service::{init, shutdown};

#[tauri::command]
pub fn get_api_balance_state() -> Result<Snapshot, String> {
    Ok(service::get()?.snapshot())
}

#[tauri::command]
pub async fn set_api_balance_enabled(enabled: bool) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || service::get()?.enable(enabled))
        .await
        .map_err(|_| "Unable to update balance plugin".to_string())?
}

#[tauri::command]
pub async fn save_api_balance_account(
    account: Account,
    secrets: Secrets,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || service::get()?.save(account, secrets))
        .await
        .map_err(|_| "Unable to save balance account".to_string())?
}

#[tauri::command]
pub async fn remove_api_balance_account(id: String) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || service::get()?.remove(&id))
        .await
        .map_err(|_| "Unable to remove balance account".to_string())?
}

#[tauri::command]
pub async fn read_api_balance_script(id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || service::get()?.script(&id))
        .await
        .map_err(|_| "Unable to read custom script".to_string())?
}

#[tauri::command]
pub async fn import_api_balance_accounts(entries: Vec<ImportEntry>) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || service::get()?.import(entries))
        .await
        .map_err(|_| "Unable to import balance accounts".to_string())?
}

#[tauri::command]
pub async fn refresh_api_balance(id: String) -> Result<Snapshot, String> {
    service::get()?.refresh(id).await
}

#[tauri::command]
pub async fn test_api_balance(account: Account, secrets: Secrets) -> Result<QueryResult, String> {
    service::test(account, secrets).await
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*)=>{
        $next!([$($done)*
            crate::api_balance::get_api_balance_state,
            crate::api_balance::set_api_balance_enabled,
            crate::api_balance::save_api_balance_account,
            crate::api_balance::remove_api_balance_account,
            crate::api_balance::read_api_balance_script,
            crate::api_balance::import_api_balance_accounts,
            crate::api_balance::refresh_api_balance,
            crate::api_balance::test_api_balance,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod transport_tests;
