use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub template: String,
    #[serde(default)]
    pub provider: String,
    pub base_url: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub organization_id: String,
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub access_key_id: String,
    #[serde(default = "default_region")]
    pub region: String,
    pub timeout_seconds: u64,
    pub interval_minutes: u64,
    pub quota_per_unit: f64,
    pub enabled: bool,
}

fn default_region() -> String {
    "cn-beijing".into()
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Secrets {
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub secret_access_key: String,
    #[serde(default)]
    pub code: String,
    #[serde(default)]
    pub clear_code: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageData {
    pub plan_name: Option<String>,
    pub remaining: Option<f64>,
    pub total: Option<f64>,
    pub used: Option<f64>,
    pub unit: Option<String>,
    pub is_valid: Option<bool>,
    pub invalid_message: Option<String>,
    #[serde(default)]
    pub unlimited: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaTier {
    pub name: String,
    pub utilization: f64,
    pub resets_at: Option<String>,
    pub used_value_usd: Option<f64>,
    pub max_value_usd: Option<f64>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    #[serde(default)]
    pub data: Vec<UsageData>,
    #[serde(default)]
    pub tiers: Vec<QuotaTier>,
    pub plan_name: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountState {
    pub account: Account,
    pub has_credentials: bool,
    pub code_configured: bool,
    pub result: Option<QueryResult>,
    pub updated_at: Option<i64>,
    pub attempted_at: Option<i64>,
    pub refreshing: bool,
    pub error: Option<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Configuration {
    pub enabled: bool,
    pub accounts: Vec<Account>,
}

#[derive(Clone, Serialize)]
pub struct Snapshot {
    pub revision: u64,
    pub enabled: bool,
    pub accounts: Vec<AccountState>,
}

#[derive(Deserialize)]
pub struct ImportEntry {
    pub account: Account,
    pub secrets: Secrets,
}

#[derive(Default, Deserialize)]
pub struct RequestConfig {
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub body: Option<serde_json::Value>,
}

fn default_method() -> String {
    "GET".into()
}

pub const TIER_FIVE_HOUR: &str = "five_hour";
pub const TIER_WEEKLY_LIMIT: &str = "weekly_limit";
pub const TIER_MONTHLY: &str = "monthly";

pub fn validate_account(a: &Account) -> Result<(), String> {
    if a.id.is_empty()
        || a.id.len() > 80
        || !a.id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err("Invalid account ID".into());
    }
    if a.name.trim().is_empty() || a.name.chars().count() > 100 {
        return Err("Account name is required (max 100 characters)".into());
    }
    if ![
        "custom",
        "general",
        "newapi",
        "sub2api",
        "token_plan",
        "official",
    ]
    .contains(&a.template.as_str())
    {
        return Err("Unknown balance template".into());
    }
    if !(1..=120).contains(&a.timeout_seconds) || a.interval_minutes > 1440 {
        return Err(
            "Timeout must be 1–120 seconds; refresh interval must be 0–1440 minutes".into(),
        );
    }
    if !a.quota_per_unit.is_finite() || a.quota_per_unit <= 0.0 {
        return Err("Quota conversion must be positive".into());
    }
    if a.base_url.len() > 2048 {
        return Err("Base URL is too long".into());
    }
    if !a.base_url.is_empty() {
        super::http::validate_url(&a.base_url)?;
    }
    if a.template != "custom" && a.base_url.is_empty() {
        return Err("Base URL is required".into());
    }
    if a.template == "token_plan"
        && ![
            "kimi",
            "zhipu",
            "zhipu_team",
            "minimax",
            "zenmux",
            "volcengine",
            "opencode_go",
            "command_code",
        ]
        .contains(&a.provider.as_str())
    {
        return Err("Choose a Token Plan provider".into());
    }
    Ok(())
}

pub fn validate_result(result: QueryResult) -> Result<QueryResult, String> {
    if result.data.is_empty() && result.tiers.is_empty() {
        return Err("Response contains no balance or quota data".into());
    }
    if result.data.len() + result.tiers.len() > 100 {
        return Err("Too many balance records".into());
    }
    for d in &result.data {
        if [d.remaining, d.total, d.used]
            .into_iter()
            .flatten()
            .any(|n| !n.is_finite())
        {
            return Err("Response contains an invalid amount".into());
        }
        if d.remaining.is_none()
            && d.total.is_none()
            && d.used.is_none()
            && !d.unlimited
            && d.is_valid != Some(false)
        {
            return Err("Missing balance fields in response".into());
        }
    }
    if result.tiers.iter().any(|t| {
        !t.utilization.is_finite()
            || [t.used_value_usd, t.max_value_usd]
                .into_iter()
                .flatten()
                .any(|n| !n.is_finite())
    }) {
        return Err("Response contains an invalid quota".into());
    }
    Ok(result)
}
