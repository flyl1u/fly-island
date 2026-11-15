use super::{
    http,
    model::{Account, QueryResult, QuotaTier, Secrets, UsageData},
    plan_parsers::*,
};
use reqwest::Client;
use serde_json::Value;

pub fn amount(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(parse_f64)
}

fn balance(remaining: Option<f64>, unit: &str) -> QueryResult {
    QueryResult {
        data: vec![UsageData {
            remaining,
            unit: Some(unit.into()),
            is_valid: Some(true),
            ..Default::default()
        }],
        ..Default::default()
    }
}

pub fn parse_basic(
    template: &str,
    body: &Value,
    quota_per_unit: f64,
) -> Result<QueryResult, String> {
    http::check_business(body)?;
    match template {
        "newapi" => {
            let data = body.get("data").ok_or("Missing NewAPI data")?;
            let remaining = amount(data, "quota").map(|n| n / quota_per_unit);
            let used = amount(data, "used_quota").map(|n| n / quota_per_unit);
            Ok(QueryResult {
                data: vec![UsageData {
                    remaining,
                    used,
                    total: remaining.zip(used).map(|(a, b)| a + b),
                    unit: Some("USD".into()),
                    plan_name: data
                        .get("group")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    ..Default::default()
                }],
                ..Default::default()
            })
        }
        "sub2api" => {
            let quota = body.get("quota").unwrap_or(&Value::Null);
            let remaining = amount(body, "remaining");
            let total = amount(quota, "limit").filter(|n| *n > 0.0);
            Ok(QueryResult {
                data: vec![UsageData {
                    remaining: remaining.filter(|n| *n != -1.0),
                    unlimited: remaining == Some(-1.0),
                    used: total.and_then(|_| amount(quota, "used")),
                    total,
                    unit: body
                        .get("unit")
                        .or_else(|| quota.get("unit"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .or(Some("USD".into())),
                    plan_name: body
                        .get("planName")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    is_valid: body.get("isValid").and_then(Value::as_bool),
                    invalid_message: (body.get("isValid").and_then(Value::as_bool) == Some(false))
                        .then(|| "Provider reported invalid credentials or plan".into()),
                }],
                ..Default::default()
            })
        }
        _ => Ok(balance(
            amount(body, "balance"),
            body.get("unit").and_then(Value::as_str).unwrap_or("USD"),
        )),
    }
}

pub async fn basic(client: &Client, a: &Account, s: &Secrets) -> Result<QueryResult, String> {
    let base = a.base_url.trim_end_matches('/');
    let (url, token, headers) = match a.template.as_str() {
        "newapi" => {
            if a.user_id.is_empty() {
                return Err("NewAPI requires a user ID and dashboard access token".into());
            }
            (
                format!("{}/api/user/self", http::root(base)?),
                &s.access_token,
                vec![("New-Api-User", a.user_id.as_str())],
            )
        }
        "sub2api" => (
            format!("{}/v1/usage", base.strip_suffix("/v1").unwrap_or(base)),
            &s.api_key,
            vec![],
        ),
        _ => (format!("{base}/user/balance"), &s.api_key, vec![]),
    };
    parse_basic(
        &a.template,
        &http::get(client, url, token, true, &headers).await?,
        a.quota_per_unit,
    )
}

pub async fn official(client: &Client, a: &Account, s: &Secrets) -> Result<QueryResult, String> {
    let host = http::host(&a.base_url)?;
    let (kind, url, bearer, unit) = match host.as_str() {
        "api.deepseek.com" => (
            "deepseek",
            "https://api.deepseek.com/user/balance",
            true,
            "CNY",
        ),
        "api.stepfun.com" | "api.stepfun.ai" => (
            "stepfun",
            "https://api.stepfun.com/v1/accounts",
            true,
            "CNY",
        ),
        "api.siliconflow.cn" => (
            "siliconflow",
            "https://api.siliconflow.cn/v1/user/info",
            true,
            "CNY",
        ),
        "api.siliconflow.com" => (
            "siliconflow",
            "https://api.siliconflow.com/v1/user/info",
            true,
            "USD",
        ),
        "openrouter.ai" => (
            "openrouter",
            "https://openrouter.ai/api/v1/credits",
            true,
            "USD",
        ),
        "api.novita.ai" => (
            "novita",
            "https://api.novita.ai/v3/user/balance",
            true,
            "USD",
        ),
        "open.bigmodel.cn" => (
            "zhipu",
            "https://open.bigmodel.cn/api/biz/account/query-customer-account-report",
            false,
            "CNY",
        ),
        "api.z.ai" => (
            "zhipu",
            "https://api.z.ai/api/biz/account/query-customer-account-report",
            false,
            "USD",
        ),
        _ => {
            return Err(
                "Unknown official balance provider; use a custom template for this endpoint".into(),
            )
        }
    };
    let body = http::get(client, url.into(), &s.api_key, bearer, &[]).await?;
    parse_official(kind, &body, unit)
}

pub fn parse_official(kind: &str, body: &Value, unit: &str) -> Result<QueryResult, String> {
    http::check_business(body)?;
    let data = body.get("data").unwrap_or(body);
    match kind {
        "deepseek" => {
            let infos = body
                .get("balance_infos")
                .and_then(Value::as_array)
                .ok_or("Missing DeepSeek balance_infos")?;
            Ok(QueryResult {
                data: infos
                    .iter()
                    .map(|d| UsageData {
                        remaining: amount(d, "total_balance"),
                        unit: d
                            .get("currency")
                            .and_then(Value::as_str)
                            .map(str::to_string),
                        is_valid: Some(true),
                        ..Default::default()
                    })
                    .collect(),
                ..Default::default()
            })
        }
        "stepfun" => Ok(balance(amount(body, "balance"), unit)),
        "siliconflow" => Ok(balance(amount(data, "totalBalance"), unit)),
        "novita" => Ok(balance(
            amount(body, "availableBalance").map(|n| n / 10000.0),
            unit,
        )),
        "openrouter" => {
            let total = amount(data, "total_credits").ok_or("Missing total_credits")?;
            let used = amount(data, "total_usage").ok_or("Missing total_usage")?;
            Ok(QueryResult {
                data: vec![UsageData {
                    remaining: Some(total - used),
                    total: Some(total),
                    used: Some(used),
                    unit: Some(unit.into()),
                    ..Default::default()
                }],
                ..Default::default()
            })
        }
        "zhipu" => Ok(balance(
            amount(data, "availableBalance").or_else(|| amount(data, "balance")),
            unit,
        )),
        _ => Err("Unknown official response format".into()),
    }
}

fn percentage(name: &str, utilization: f64, resets_at: Option<String>) -> QuotaTier {
    QuotaTier {
        name: name.into(),
        utilization,
        resets_at,
        used_value_usd: None,
        max_value_usd: None,
    }
}

pub fn parse_plan(provider: &str, body: &Value) -> Result<QueryResult, String> {
    http::check_business(body)?;
    let mut result = QueryResult::default();
    result.tiers = match provider {
        "zhipu" | "zhipu_team" => {
            let data = body.get("data").ok_or("Missing Zhipu data")?;
            result.plan_name = data
                .get("level")
                .and_then(Value::as_str)
                .map(str::to_string);
            parse_zhipu_token_tiers(data)
        }
        "minimax" => parse_minimax_tiers(body),
        "opencode_go" => parse_opencode_go_tiers(body),
        "kimi" => {
            let mut tiers = vec![];
            let windows = body
                .get("limits")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|v| v.get("detail"))
                .map(|v| ("five_hour", v))
                .chain(body.get("usage").map(|v| ("weekly_limit", v)));
            for (name, window) in windows {
                if let (Some(limit), Some(remaining)) =
                    (amount(window, "limit"), amount(window, "remaining"))
                {
                    if limit > 0.0 {
                        tiers.push(percentage(
                            name,
                            (limit - remaining) / limit * 100.0,
                            window.get("resetTime").and_then(extract_reset_time),
                        ));
                    }
                }
            }
            tiers
        }
        "zenmux" => {
            let data = body.get("data").ok_or("Missing ZenMux data")?;
            result.plan_name = data
                .pointer("/plan/tier")
                .and_then(Value::as_str)
                .map(str::to_string);
            [
                ("quota_5_hour", "five_hour"),
                ("quota_7_day", "weekly_limit"),
            ]
            .iter()
            .filter_map(|(key, name)| {
                let w = data.get(key)?;
                Some(QuotaTier {
                    name: (*name).into(),
                    utilization: amount(w, "usage_percentage")? * 100.0,
                    resets_at: w.get("resets_at").and_then(extract_reset_time),
                    used_value_usd: amount(w, "used_value_usd"),
                    max_value_usd: amount(w, "max_value_usd"),
                })
            })
            .collect()
        }
        _ => return Err("Unknown Token Plan response".into()),
    };
    Ok(result)
}

pub async fn plan(client: &Client, a: &Account, s: &Secrets) -> Result<QueryResult, String> {
    let host = http::host(&a.base_url)?;
    let (url, bearer, headers) = match a.provider.as_str() {
        "kimi" => {
            let base = if host == "api.kimi.ai" {
                "https://api.kimi.ai"
            } else {
                "https://api.kimi.com"
            };
            (format!("{base}/coding/v1/usages"), true, vec![])
        }
        "zhipu" | "zhipu_team" => {
            let origin = if a.provider == "zhipu" && host == "api.z.ai" {
                "https://api.z.ai"
            } else {
                "https://open.bigmodel.cn"
            };
            let mut headers = vec![("Accept-Language", "en-US,en")];
            let suffix = if a.provider == "zhipu_team" {
                if a.organization_id.is_empty() || a.project_id.is_empty() {
                    return Err("Zhipu Team requires organization ID and project ID".into());
                }
                headers.extend([
                    ("bigmodel-organization", a.organization_id.as_str()),
                    ("bigmodel-project", a.project_id.as_str()),
                ]);
                "?type=2"
            } else {
                ""
            };
            (
                format!("{origin}/api/monitor/usage/quota/limit{suffix}"),
                false,
                headers,
            )
        }
        "minimax" => (
            format!(
                "https://{}/v1/api/openplatform/coding_plan/remains",
                if host == "api.minimax.io" {
                    "api.minimax.io"
                } else {
                    "api.minimaxi.com"
                }
            ),
            true,
            vec![],
        ),
        "zenmux" => (a.base_url.clone(), true, vec![]),
        "opencode_go" => ("https://opencode.ai/zen/go/v1/usage".into(), true, vec![]),
        "volcengine" => return super::volcengine::query(client, a, s).await,
        "command_code" => return command_code(client, s).await,
        _ => return Err("Choose a Token Plan provider".into()),
    };
    let body = http::get(client, url, &s.api_key, bearer, &headers).await?;
    if a.provider == "zhipu" && zhipu_has_no_plan(&body) {
        return official(client, a, s).await;
    }
    parse_plan(&a.provider, &body)
}

pub fn zhipu_has_no_plan(body: &Value) -> bool {
    let message = body
        .get("msg")
        .or_else(|| body.get("message"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_lowercase();
    body.get("success").and_then(Value::as_bool) == Some(false)
        && message.contains("coding plan")
        && [
            "不存在",
            "未订阅",
            "未购买",
            "没有",
            "not found",
            "not have",
            "doesn't have",
            "no coding plan",
            "not subscribed",
        ]
        .iter()
        .any(|word| message.contains(word))
}

async fn command_code(client: &Client, s: &Secrets) -> Result<QueryResult, String> {
    let get = |path: &str| format!("https://api.commandcode.ai{path}");
    let who = http::get(client, get("/alpha/whoami?limits=1"), &s.api_key, true, &[]).await?;
    http::check_business(&who)?;
    let org = who.pointer("/org/id").and_then(Value::as_str);
    let mut url = http::validate_url(&get("/alpha/billing/credits"))?;
    if let Some(org) = org {
        url.query_pairs_mut().append_pair("orgId", org);
    }
    let credits = http::get(client, url.to_string(), &s.api_key, true, &[]).await?;
    url.set_path("/alpha/billing/subscriptions");
    let subscription = http::get(client, url.to_string(), &s.api_key, true, &[]).await?;
    url.set_path("/alpha/usage/summary");
    if let Some(since) = subscription
        .pointer("/data/currentPeriodStart")
        .and_then(Value::as_str)
    {
        url.query_pairs_mut().append_pair("since", since);
    }
    let summary = http::get(client, url.to_string(), &s.api_key, true, &[]).await?;
    parse_command(&credits, &subscription, &summary)
}

pub fn parse_command(
    credits: &Value,
    subscription: &Value,
    summary: &Value,
) -> Result<QueryResult, String> {
    for body in [credits, subscription, summary] {
        http::check_business(body)?;
    }
    let c = credits
        .get("credits")
        .ok_or("Missing Command Code credits")?;
    let mut remaining = 0.0;
    for key in ["monthlyCredits", "purchasedCredits", "freeCredits"] {
        remaining += amount(c, key)
            .ok_or("Missing Command Code credit amount")?
            .max(0.0);
    }
    let used = amount(summary, "totalCost")
        .ok_or("Missing Command Code totalCost")?
        .max(0.0);
    let mut tiers = vec![];
    if let Some(w) = credits
        .get("windowLimits")
        .or_else(|| c.get("windowLimits"))
    {
        if w.get("limited").and_then(Value::as_bool) == Some(true) {
            for (key, name) in [("fiveHour", "five_hour"), ("weekly", "weekly_limit")] {
                if let Some(t) = command_code_window_tier(w.get(key), name) {
                    tiers.push(t);
                }
            }
        }
    }
    if remaining + used > 0.0 {
        tiers.push(percentage(
            "monthly",
            used / (remaining + used) * 100.0,
            subscription
                .pointer("/data/currentPeriodEnd")
                .and_then(extract_reset_time),
        ));
    }
    Ok(QueryResult {
        data: vec![UsageData {
            remaining: Some(remaining),
            used: Some(used),
            total: Some(remaining + used),
            unit: Some("USD".into()),
            ..Default::default()
        }],
        tiers,
        plan_name: subscription
            .pointer("/data/planId")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}
