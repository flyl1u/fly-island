//! Translation services. Every provider speaks the OpenAI-compatible chat completions
//! API, so they differ only in base URL, model and stored key.

use reqwest::Url;

pub(super) struct Provider {
    /// Stable id shared with the frontend; also the Windows credential user name.
    pub(super) id: &'static str,
    /// Name used in error messages, which the translation window shows as they are.
    pub(super) name: &'static str,
    /// `None` for the custom provider, whose base URL comes from the user.
    base_url: Option<&'static str>,
    /// `None` where the user has to name a model from the provider's catalogue.
    default_model: Option<&'static str>,
}

// Mirrored by TRANSLATION_PROVIDERS in src/windows/translation/providers.ts.
const PROVIDERS: &[Provider] = &[
    Provider {
        id: "deepseek",
        name: "DeepSeek",
        base_url: Some("https://api.deepseek.com"),
        default_model: Some("deepseek-flash"),
    },
    Provider {
        id: "volcengine",
        name: "火山方舟",
        base_url: Some("https://ark.cn-beijing.volces.com/api/v3"),
        default_model: None,
    },
    Provider {
        id: "dashscope",
        name: "通义千问",
        base_url: Some("https://dashscope.aliyuncs.com/compatible-mode/v1"),
        default_model: None,
    },
    Provider {
        id: "moonshot",
        name: "Kimi",
        base_url: Some("https://api.moonshot.cn/v1"),
        default_model: None,
    },
    Provider {
        id: "openai",
        name: "OpenAI",
        base_url: Some("https://api.openai.com/v1"),
        default_model: None,
    },
    Provider {
        id: "custom",
        name: "自定义接口",
        base_url: None,
        default_model: None,
    },
];

/// The provider older versions used for everything; requests without one go here.
pub(super) const DEFAULT_PROVIDER_ID: &str = "deepseek";

const MAX_BASE_URL_LENGTH: usize = 500;
const MAX_MODEL_LENGTH: usize = 200;

pub(super) fn find_provider(id: Option<&str>) -> Result<&'static Provider, String> {
    let id = id.unwrap_or(DEFAULT_PROVIDER_ID);
    PROVIDERS
        .iter()
        .find(|provider| provider.id == id)
        .ok_or_else(|| format!("不支持的翻译服务：{id}"))
}

/// The chat completions URL: the preset base URL, or a checked custom one.
pub(super) fn completions_url(
    provider: &Provider,
    custom_base_url: Option<&str>,
) -> Result<Url, String> {
    let base = match provider.base_url {
        Some(base) => base.to_string(),
        None => validate_custom_base_url(custom_base_url.unwrap_or_default())?,
    };
    let base = base.trim_end_matches('/');
    let endpoint = if base.ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{base}/chat/completions")
    };
    Url::parse(&endpoint).map_err(|error| format!("接口地址无效：{error}"))
}

/// Keys travel in the request, so only HTTPS is accepted, plus plain HTTP to this
/// machine for locally hosted models.
fn validate_custom_base_url(raw: &str) -> Result<String, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("请填写自定义接口地址。".to_string());
    }
    if raw.len() > MAX_BASE_URL_LENGTH {
        return Err("接口地址过长。".to_string());
    }
    let url =
        Url::parse(raw).map_err(|_| "接口地址无效，请填写完整的 https:// 地址。".to_string())?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("接口地址中不能包含用户名或密码，密钥请填在密钥栏。".to_string());
    }
    let is_local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    match url.scheme() {
        "https" => {}
        "http" if is_local => {}
        _ => return Err("接口地址必须使用 https（本机地址可用 http）。".to_string()),
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("接口地址不能带查询参数。".to_string());
    }
    Ok(url.to_string())
}

pub(super) fn resolve_model(provider: &Provider, model: Option<&str>) -> Result<String, String> {
    let model = model.map(str::trim).filter(|model| !model.is_empty());
    match model.or(provider.default_model) {
        Some(model) if model.chars().count() <= MAX_MODEL_LENGTH => Ok(model.to_string()),
        Some(_) => Err("模型名称过长。".to_string()),
        None => Err(format!("请先在翻译设置中填写{}的模型名称。", provider.name)),
    }
}

/// The translation in a chat completions response, or why there is none.
pub(super) fn parse_completion(
    provider: &Provider,
    result: &serde_json::Value,
) -> Result<String, String> {
    let name = provider.name;
    let choice = result
        .get("choices")
        .and_then(|choices| choices.get(0))
        .ok_or_else(|| format!("{name} 未返回译文。"))?;
    // Some compatible services omit finish_reason; only a reported cut-off is an error.
    match choice.get("finish_reason").and_then(|value| value.as_str()) {
        None | Some("stop") => {}
        Some("length") => return Err(format!("{name} 未完成翻译，请重试或缩短文本。")),
        Some(reason) => return Err(format!("{name} 未完成翻译（{reason}）。")),
    }
    let output = choice
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
        .unwrap_or_default()
        .trim();
    if output.is_empty() {
        return Err(format!("{name} 未返回译文。"));
    }
    Ok(output.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn provider(id: &str) -> &'static Provider {
        find_provider(Some(id)).unwrap()
    }

    #[test]
    fn requests_without_a_provider_keep_using_deepseek() {
        let deepseek = find_provider(None).unwrap();
        assert_eq!(deepseek.id, "deepseek");
        assert_eq!(
            completions_url(deepseek, None).unwrap().as_str(),
            "https://api.deepseek.com/chat/completions"
        );
        assert_eq!(resolve_model(deepseek, None).unwrap(), "deepseek-flash");
        assert_eq!(
            resolve_model(deepseek, Some("  ")).unwrap(),
            "deepseek-flash"
        );
        assert!(find_provider(Some("baidu")).is_err());
    }

    #[test]
    fn presets_ignore_a_custom_base_url_and_providers_without_a_default_need_a_model() {
        let ark = provider("volcengine");
        assert_eq!(
            completions_url(ark, Some("https://attacker.example"))
                .unwrap()
                .as_str(),
            "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
        );
        assert!(resolve_model(ark, None).is_err());
        assert_eq!(resolve_model(ark, Some(" doubao-x ")).unwrap(), "doubao-x");
        assert!(resolve_model(ark, Some(&"m".repeat(201))).is_err());
    }

    #[test]
    fn custom_base_urls_must_be_https_or_local_http_without_secrets() {
        let custom = provider("custom");
        let url = |raw: &str| completions_url(custom, Some(raw)).map(|url| url.to_string());
        assert_eq!(
            url("https://api.example.com/v1/").unwrap(),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            url("https://api.example.com/v1/chat/completions").unwrap(),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            url("http://localhost:11434/v1").unwrap(),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_eq!(
            url("http://127.0.0.1:8080").unwrap(),
            "http://127.0.0.1:8080/chat/completions"
        );
        assert!(url("http://api.example.com/v1").is_err());
        assert!(url("https://user:pass@api.example.com/v1").is_err());
        assert!(url("https://api.example.com/v1?key=1").is_err());
        assert!(url("ftp://api.example.com").is_err());
        assert!(url("api.example.com").is_err());
        assert!(url("").is_err());
        assert!(completions_url(custom, None).is_err());
    }

    #[test]
    fn completions_accept_stop_or_a_missing_reason_and_reject_cut_offs() {
        let deepseek = provider("deepseek");
        let reply = |reason: serde_json::Value, content: &str| json!({ "choices": [{ "finish_reason": reason, "message": { "content": content } }] });
        assert_eq!(
            parse_completion(deepseek, &reply(json!("stop"), " Hello ")).unwrap(),
            "Hello"
        );
        assert_eq!(
            parse_completion(deepseek, &reply(json!(null), "Hi")).unwrap(),
            "Hi"
        );
        assert!(parse_completion(deepseek, &reply(json!("length"), "Hal")).is_err());
        assert!(parse_completion(deepseek, &reply(json!("content_filter"), "")).is_err());
        assert!(parse_completion(deepseek, &reply(json!("stop"), "  ")).is_err());
        assert!(parse_completion(deepseek, &json!({ "choices": [] })).is_err());
    }
}
