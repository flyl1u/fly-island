use super::*;

#[test]
#[ignore = "Uses the configured DeepSeek credential for one small translation diagnostic"]
fn configured_deepseek_translation_probe() {
    tauri::async_runtime::block_on(async {
        let provider = find_provider(Some("deepseek")).expect("provider");
        let secret = read_secret(provider).unwrap().expect("configured credential");
        let original = reqwest::Client::builder().timeout(Duration::from_secs(30)).build().unwrap()
            .post(completions_url(provider, None).unwrap()).bearer_auth(&secret)
            .json(&serde_json::json!({"model":"DeepSeek-V4.1-Flash", "stream":false,
                "messages":[{"role":"user","content":"Translate Hello into Chinese."}]}))
            .send().await.unwrap();
        let status = original.status();
        if !status.is_success() {
            let body = original.text().await.unwrap();
            println!("Original configured name: {}", chat::response_error("DeepSeek", "DeepSeek-V4.1-Flash", status, &body, &secret));
        } else { println!("Original configured name accepted by provider: {status}"); }
        let model = resolve_model(provider, Some("DeepSeek-V4.1-Flash")).expect("model");
        let output = translate_text("Hello".into(), "en-zh".into(), Some("deepseek".into()), None,
            Some("DeepSeek-V4.1-Flash".into())).await.expect("configured translation");
        assert!(!output.is_empty());
        println!("Configured display name maps to {model}; translation={output}");
    });
}
