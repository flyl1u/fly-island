use super::{
    http,
    model::{self, Account, QueryResult, Secrets},
    providers, script,
};
use std::time::Duration;

pub async fn run(account: Account, secrets: Secrets) -> Result<QueryResult, String> {
    model::validate_account(&account)?;
    let client = http::client(&account)?;
    let query = async {
        let result = match account.template.as_str() {
            "custom" => script::query(&client, &account, &secrets).await?,
            "general" | "newapi" | "sub2api" if !secrets.code.trim().is_empty() => {
                script::query(&client, &account, &secrets).await?
            }
            "general" | "newapi" | "sub2api" => {
                providers::basic(&client, &account, &secrets).await?
            }
            "token_plan" => providers::plan(&client, &account, &secrets).await?,
            "official" => providers::official(&client, &account, &secrets).await?,
            _ => return Err("Unknown template".into()),
        };
        model::validate_result(result)
    };
    tokio::time::timeout(Duration::from_secs(account.timeout_seconds), query)
        .await
        .map_err(|_| "Query timed out".to_string())?
        .map_err(|message| http::redact(&message, &secrets))
}
