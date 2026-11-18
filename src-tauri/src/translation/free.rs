//! Keyless translation services for a word or a short passage, without setting up a
//! language model: Google Translate's public web endpoint and the MyMemory API.
//! Neither needs an account; both can be unreachable on some networks, so every failure
//! names the service and suggests another.

use super::provider::{Provider, ProviderKind};
use reqwest::{Client, Url};
use std::time::Duration;

const GOOGLE_ENDPOINT: &str = "https://translate.googleapis.com/translate_a/single";
const MYMEMORY_ENDPOINT: &str = "https://api.mymemory.translated.net/get";
/// MyMemory refuses a query longer than 500 characters; longer text goes in pieces.
const MYMEMORY_CHUNK: usize = 480;

/// Translates `text` into `target` ("en" or "zh") with a keyless provider.
pub(super) async fn translate(provider: &Provider, text: &str, target: &str) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| format!("无法创建翻译请求：{error}"))?;
    match provider.kind {
        ProviderKind::Google => google(&client, provider.name, text, target).await,
        ProviderKind::MyMemory => {
            let mut output = String::new();
            for piece in split_chunks(text, MYMEMORY_CHUNK) {
                output.push_str(&mymemory(&client, provider.name, &piece, target).await?);
            }
            Ok(output.trim().to_string())
        }
        ProviderKind::Chat => Err(format!("{} 需要 API 密钥。", provider.name)),
    }
}

fn network_error(name: &str, error: &reqwest::Error) -> String {
    if error.is_timeout() || error.is_connect() {
        format!("无法连接 {name}，当前网络可能无法访问该服务，请稍后重试或换一个翻译服务。")
    } else {
        format!("{name} 请求失败：{error}")
    }
}

async fn google(client: &Client, name: &str, text: &str, target: &str) -> Result<String, String> {
    let target = if target == "en" { "en" } else { "zh-CN" };
    let url = Url::parse_with_params(GOOGLE_ENDPOINT, [("client", "gtx"), ("sl", "auto"), ("tl", target), ("dt", "t")])
        .map_err(|error| error.to_string())?;
    // Sent as a form body: a long text would not fit in the query string. Url encodes it
    // the way a form would (reqwest is built without its form feature).
    let body = Url::parse_with_params("http://localhost/", [("q", text)])
        .map_err(|error| error.to_string())?
        .query()
        .unwrap_or_default()
        .to_string();
    let response = client
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await
        .map_err(|error| network_error(name, &error))?;
    if !response.status().is_success() {
        return Err(format!("{name} 返回 HTTP {}，可能请求过于频繁，请稍后重试。", response.status()));
    }
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("无法读取 {name} 结果：{error}"))?;
    parse_google(name, &value)
}

/// The response is `[[["译文", "原文", …], …], …]`: one entry per sentence.
fn parse_google(name: &str, value: &serde_json::Value) -> Result<String, String> {
    let output: String = value
        .get(0)
        .and_then(|segments| segments.as_array())
        .map(|segments| segments.iter().filter_map(|segment| segment.get(0)?.as_str()).collect())
        .unwrap_or_default();
    let output = output.trim();
    if output.is_empty() {
        return Err(format!("{name} 未返回译文。"));
    }
    Ok(output.to_string())
}

async fn mymemory(client: &Client, name: &str, text: &str, target: &str) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(text.to_string());
    }
    // MyMemory needs the source language; it is whichever of the two the target is not.
    let pair = if target == "en" { "zh-CN|en" } else { "en|zh-CN" };
    let url = Url::parse_with_params(MYMEMORY_ENDPOINT, [("q", text), ("langpair", pair)])
        .map_err(|error| error.to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| network_error(name, &error))?;
    if !response.status().is_success() {
        return Err(format!("{name} 返回 HTTP {}，请稍后重试。", response.status()));
    }
    let value: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("无法读取 {name} 结果：{error}"))?;
    parse_mymemory(name, &value).map(|translated| {
        // Keeps the line breaks between pieces.
        let trailing: String = text.chars().rev().take_while(|c| c.is_whitespace()).collect();
        format!("{translated}{}", trailing.chars().rev().collect::<String>())
    })
}

fn parse_mymemory(name: &str, value: &serde_json::Value) -> Result<String, String> {
    if value.get("quotaFinished").and_then(|quota| quota.as_bool()) == Some(true) {
        return Err(format!("{name} 今日免费额度已用完，请明天再试或换一个翻译服务。"));
    }
    let status = value.get("responseStatus");
    let ok = status.and_then(|s| s.as_i64()) == Some(200) || status.and_then(|s| s.as_str()) == Some("200");
    let translated = value
        .get("responseData")
        .and_then(|data| data.get("translatedText"))
        .and_then(|text| text.as_str())
        .unwrap_or_default()
        .trim();
    if !ok || translated.is_empty() {
        let details = value.get("responseDetails").and_then(|d| d.as_str()).unwrap_or_default();
        return Err(if details.is_empty() { format!("{name} 未返回译文。") } else { format!("{name} 未返回译文：{details}") });
    }
    Ok(translated.to_string())
}

/// Splits `text` into pieces of at most `limit` characters, preferring line ends, then
/// sentence ends, then spaces, so each piece still reads as a whole.
fn split_chunks(text: &str, limit: usize) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut rest: Vec<char> = text.chars().collect();
    while rest.len() > limit {
        let window = &rest[..limit];
        let cut = [|c: char| c == '\n', |c: char| ".!?。！？；;".contains(c), |c: char| c.is_whitespace() || "，,".contains(c)]
            .iter()
            .find_map(|is_break| window.iter().rposition(|&c| is_break(c)).filter(|&at| at > limit / 4))
            .map_or(limit, |at| at + 1);
        pieces.push(rest[..cut].iter().collect());
        rest.drain(..cut);
    }
    if !rest.is_empty() {
        pieces.push(rest.into_iter().collect());
    }
    pieces
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn google_joins_sentences_and_reports_an_empty_answer() {
        let reply = json!([[["你好。\n", "Hello.\n"], ["再见。", "Bye."]], null, "en"]);
        assert_eq!(parse_google("Google", &reply).unwrap(), "你好。\n再见。");
        assert!(parse_google("Google", &json!([[]])).is_err());
        assert!(parse_google("Google", &json!(null)).is_err());
    }

    #[test]
    fn mymemory_accepts_status_200_and_reports_quota_and_errors() {
        let ok = json!({ "responseData": { "translatedText": "你好" }, "responseStatus": 200 });
        assert_eq!(parse_mymemory("MyMemory", &ok).unwrap(), "你好");
        let quota = json!({ "quotaFinished": true, "responseStatus": 429 });
        assert!(parse_mymemory("MyMemory", &quota).unwrap_err().contains("额度"));
        let too_long = json!({ "responseData": { "translatedText": "QUERY LENGTH LIMIT" }, "responseStatus": "403", "responseDetails": "QUERY LENGTH LIMIT" });
        assert!(parse_mymemory("MyMemory", &too_long).is_err());
    }

    #[test]
    fn long_text_splits_at_natural_breaks_within_the_limit() {
        let text = format!("{}\n{}", "a".repeat(300), "b. ".repeat(200));
        let pieces = split_chunks(&text, 480);
        assert!(pieces.iter().all(|piece| piece.chars().count() <= 480));
        assert_eq!(pieces.concat(), text);
        assert!(pieces[0].ends_with('\n'));
        assert_eq!(split_chunks("short", 480), vec!["short".to_string()]);
        let unbroken = "x".repeat(1000);
        assert_eq!(split_chunks(&unbroken, 480).concat(), unbroken);
    }
}
