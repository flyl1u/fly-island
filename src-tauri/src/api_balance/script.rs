use super::{
    http,
    model::{Account, QueryResult, RequestConfig, Secrets, UsageData},
};
use rquickjs::{Context, Runtime};
use serde_json::Value;
use std::time::{Duration, Instant};

fn substitute(code: &str, account: &Account, secrets: &Secrets) -> Result<String, String> {
    let mut result = code.to_string();
    for (key, value) in [
        ("baseUrl", account.base_url.as_str()),
        ("apiKey", secrets.api_key.as_str()),
        ("accessToken", secrets.access_token.as_str()),
        ("userId", account.user_id.as_str()),
    ] {
        if code.contains(&format!("{{{{{key}}}}}")) && value.is_empty() {
            return Err(format!("Missing script variable: {key}"));
        }
        // Unicode escapes cannot terminate single, double or template strings.
        let escaped: String = value
            .encode_utf16()
            .map(|c| format!("\\u{c:04x}"))
            .collect();
        result = result.replace(&format!("{{{{{key}}}}}"), &escaped);
    }
    Ok(result)
}

fn evaluate(code: &str, stage: &str, response: Option<&Value>) -> Result<Value, String> {
    if code.len() > 65536 {
        return Err("Custom script exceeds 64 KiB".into());
    }
    let runtime = Runtime::new().map_err(|_| "Unable to start script runtime".to_string())?;
    runtime.set_memory_limit(16 * 1024 * 1024);
    runtime.set_max_stack_size(256 * 1024);
    let deadline = Instant::now() + Duration::from_millis(500);
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() > deadline)));
    let context =
        Context::full(&runtime).map_err(|_| "Unable to create script context".to_string())?;
    let expression = if stage == "request" {
        "config.request".to_string()
    } else {
        format!("config.extractor({})", response.unwrap_or(&Value::Null))
    };
    let script = format!(
        "JSON.stringify((function(){{ 'use strict'; const config = ({}); return {}; }})())",
        code.trim().trim_end_matches(';'),
        expression
    );
    let output = context
        .with(|ctx| ctx.eval::<String, _>(script))
        .map_err(|_| {
            "Script failed: check syntax, request/extractor, execution time and memory limits"
                .to_string()
        })?;
    serde_json::from_str(&output).map_err(|_| "Script did not return JSON data".into())
}

pub fn parse_extracted(value: Value) -> Result<QueryResult, String> {
    let values = if let Value::Array(items) = value {
        items
    } else {
        vec![value]
    };
    let mut data = Vec::new();
    for value in values {
        for field in ["remaining", "used", "total"] {
            if value
                .get(field)
                .is_some_and(|n| !n.is_null() && !n.is_number())
            {
                return Err(format!("Invalid script amount: {field}"));
            }
        }
        let mut row: UsageData =
            serde_json::from_value(value).map_err(|_| "Invalid extractor result".to_string())?;
        if row.is_valid == Some(false) {
            row.invalid_message = Some("Provider reported invalid credentials or plan".into());
        }
        data.push(row);
    }
    super::model::validate_result(QueryResult {
        data,
        ..Default::default()
    })
}

pub async fn query(
    client: &reqwest::Client,
    account: &Account,
    secrets: &Secrets,
) -> Result<QueryResult, String> {
    if secrets.code.trim().is_empty() {
        return Err("Custom request / extractor script is required".into());
    }
    let code = substitute(&secrets.code, account, secrets)?;
    let request: RequestConfig = serde_json::from_value(evaluate(&code, "request", None)?)
        .map_err(|_| "Script request must contain url, method and string headers".to_string())?;
    let request_url = http::validate_url(&request.url)?;
    if account.template != "custom"
        && http::validate_url(&account.base_url)?.origin() != request_url.origin()
    {
        return Err("Preset scripts must query the configured Base URL origin".into());
    }
    let response = http::send(client, request).await?;
    parse_extracted(evaluate(&code, "extractor", Some(&response))?)
}

pub fn validate_code(code: &str) -> Result<(), String> {
    if code.len() > 65536 {
        return Err("Custom script exceeds 64 KiB".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extractor_checks_fields_and_preserves_zero() {
        assert_eq!(
            parse_extracted(json!({"remaining":0})).unwrap().data[0].remaining,
            Some(0.0)
        );
        assert!(parse_extracted(json!({})).is_err());
        assert!(parse_extracted(json!({"remaining":null})).is_err());
        assert!(parse_extracted(json!({"remaining":"x"})).is_err());
    }

    #[test]
    fn scripts_are_bounded_and_have_no_host_access() {
        assert!(evaluate("({request:(function(){while(true){}})()})", "request", None).is_err());
        assert!(evaluate("({request:require('fs')})", "request", None).is_err());
        assert!(evaluate("broken syntax", "request", None).is_err());
        let output = evaluate(
            "({extractor:r=>({remaining:r.balance})})",
            "extractor",
            Some(&json!({"balance":12.5})),
        )
        .unwrap();
        assert_eq!(output["remaining"], 12.5);
    }

    #[test]
    fn variables_cannot_escape_javascript_strings() {
        let account:Account=serde_json::from_value(json!({"id":"test","name":"test","template":"custom","baseUrl":"https://example.com","timeoutSeconds":10,"intervalMinutes":0,"quotaPerUnit":1,"enabled":false})).unwrap();
        let secrets = Secrets {
            api_key: "'\"`\\\n${(()=>{throw 1})()}中文".into(),
            ..Default::default()
        };
        for expression in ["'{{apiKey}}'", "\"{{apiKey}}\"", "`{{apiKey}}`"] {
            let code = substitute(
                &format!("({{request:{{value:{expression}}}}})"),
                &account,
                &secrets,
            )
            .unwrap();
            assert_eq!(
                evaluate(&code, "request", None).unwrap()["value"],
                secrets.api_key
            );
        }
        assert!(substitute("'{{accessToken}}'", &account, &secrets)
            .unwrap_err()
            .contains("accessToken"));
        assert!(parse_extracted(json!({"remaining":1,"total":null})).is_ok());
    }
}
