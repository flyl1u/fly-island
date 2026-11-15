// Signing adapted from cc-switch (MIT); see THIRD_PARTY_LICENSES/cc-switch.txt.
use super::{
    http,
    model::{Account, QueryResult, RequestConfig, Secrets},
    plan_parsers::{parse_afp_tiers, parse_coding_plan_tiers},
};
use sha2::{Digest, Sha256};

const VOLCENGINE_OPENAPI_HOST: &str = "open.volcengineapi.com";
const VOLCENGINE_API_VERSION: &str = "2024-01-01";
const VOLCENGINE_SERVICE: &str = "ark";
const VOLCENGINE_CONTENT_TYPE: &str = "application/json; charset=utf-8";
const VOLCENGINE_SIGNED_HEADERS: &str = "host;x-date;x-content-sha256;content-type";

fn volc_hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let key = if key.len() > 64 {
        Sha256::digest(key).to_vec()
    } else {
        key.to_vec()
    };
    let mut inner = [0x36u8; 64];
    let mut outer = [0x5cu8; 64];
    for (index, byte) in key.iter().enumerate() {
        inner[index] ^= byte;
        outer[index] ^= byte;
    }
    let mut hash = Sha256::new();
    hash.update(inner);
    hash.update(data);
    let mut output = Sha256::new();
    output.update(outer);
    output.update(hash.finalize());
    output.finalize().to_vec()
}

fn volc_sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(data))
}

fn volc_uri_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => {
                use std::fmt::Write;
                let _ = write!(out, "%{byte:02X}");
            }
        }
    }
    out
}

fn volcengine_canonical_query(action: &str, region: &str) -> String {
    let mut pairs = [
        ("Action", action),
        ("Region", region),
        ("Version", VOLCENGINE_API_VERSION),
    ];
    pairs.sort_by(|a, b| a.0.cmp(b.0));
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", volc_uri_encode(k), volc_uri_encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

fn volcengine_sign(
    access_key_id: &str,
    secret_access_key: &str,
    region: &str,
    canonical_query: &str,
    body: &[u8],
    now: chrono::DateTime<chrono::Utc>,
) -> (String, String, String) {
    let x_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let short_date = now.format("%Y%m%d").to_string();
    let x_content_sha256 = volc_sha256_hex(body);

    // 固定顺序 canonical headers（火山特有，**不排序**）。
    let canonical_headers = format!(
        "host:{VOLCENGINE_OPENAPI_HOST}\nx-date:{x_date}\nx-content-sha256:{x_content_sha256}\ncontent-type:{VOLCENGINE_CONTENT_TYPE}\n"
    );
    let canonical_request = format!(
        "POST\n/\n{canonical_query}\n{canonical_headers}\n{VOLCENGINE_SIGNED_HEADERS}\n{x_content_sha256}"
    );

    let credential_scope = format!("{short_date}/{region}/{VOLCENGINE_SERVICE}/request");
    let string_to_sign = format!(
        "HMAC-SHA256\n{x_date}\n{credential_scope}\n{}",
        volc_sha256_hex(canonical_request.as_bytes())
    );

    // 签名密钥派生：kDate=HMAC(SK, date)（SK **不加** AWS4 前缀），终止串 `request`。
    let k_date = volc_hmac_sha256(secret_access_key.as_bytes(), short_date.as_bytes());
    let k_region = volc_hmac_sha256(&k_date, region.as_bytes());
    let k_service = volc_hmac_sha256(&k_region, VOLCENGINE_SERVICE.as_bytes());
    let k_signing = volc_hmac_sha256(&k_service, b"request");
    let signature: String = volc_hmac_sha256(&k_signing, string_to_sign.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();

    let authorization = format!(
        "HMAC-SHA256 Credential={access_key_id}/{credential_scope}, SignedHeaders={VOLCENGINE_SIGNED_HEADERS}, Signature={signature}"
    );
    (authorization, x_date, x_content_sha256)
}

pub async fn query(
    client: &reqwest::Client,
    account: &Account,
    secrets: &Secrets,
) -> Result<QueryResult, String> {
    if account.access_key_id.is_empty() || secrets.secret_access_key.is_empty() {
        return Err(
            "Volcengine requires account AccessKey ID + SecretAccessKey, not the inference API key"
                .into(),
        );
    }
    let region = if account.region.is_empty() {
        "cn-beijing"
    } else {
        &account.region
    };
    for action in ["GetAFPUsage", "GetCodingPlanUsage"] {
        let query = volcengine_canonical_query(action, region);
        let (authorization, date, content_hash) = volcengine_sign(
            &account.access_key_id,
            &secrets.secret_access_key,
            region,
            &query,
            b"",
            chrono::Utc::now(),
        );
        let mut request = RequestConfig {
            url: format!("https://{VOLCENGINE_OPENAPI_HOST}/?{query}"),
            method: "POST".into(),
            ..Default::default()
        };
        request.headers.extend([
            ("Authorization".into(), authorization),
            ("X-Date".into(), date),
            ("X-Content-Sha256".into(), content_hash),
            ("Content-Type".into(), VOLCENGINE_CONTENT_TYPE.into()),
        ]);
        let body = http::send(client, request).await?;
        if let Some(error) = body
            .pointer("/ResponseMetadata/Error")
            .or_else(|| body.get("Error"))
        {
            let code = error
                .get("Code")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            if action == "GetCodingPlanUsage" || !no_plan_error(code) {
                return Err(format!(
                    "Volcengine API error: {}",
                    code.chars().take(100).collect::<String>()
                ));
            }
            continue;
        }
        let result = body.get("Result").unwrap_or(&body);
        let tiers = if action == "GetAFPUsage" {
            parse_afp_tiers(result)
        } else {
            parse_coding_plan_tiers(result)
        };
        if !tiers.is_empty() {
            return Ok(QueryResult {
                tiers,
                plan_name: Some(
                    if action == "GetAFPUsage" {
                        "Agent Plan"
                    } else {
                        "Coding Plan"
                    }
                    .into(),
                ),
                ..Default::default()
            });
        }
        if action == "GetAFPUsage"
            && !["AFPFiveHour", "AFPWeekly", "AFPMonthly"]
                .iter()
                .any(|key| {
                    result
                        .get(key)
                        .and_then(|v| v.get("Quota"))
                        .and_then(super::plan_parsers::parse_f64)
                        == Some(0.0)
                })
        {
            return Err("Unrecognized Volcengine Agent Plan quota response".into());
        }
    }
    Err("No active Volcengine Agent Plan / Coding Plan or unrecognized quota response".into())
}

fn no_plan_error(code: &str) -> bool {
    let code = code.to_ascii_lowercase();
    [
        "not subscribed",
        "notsubscribed",
        "subscriptionnotfound",
        "nosubscription",
        "plannotfound",
        "noactiveplan",
    ]
    .iter()
    .any(|word| code.contains(word))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hmac_matches_rfc4231() {
        let actual: String = volc_hmac_sha256(&[0x0b; 20], b"Hi There")
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(
            actual,
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }
    #[test]
    fn query_and_signature_are_deterministic() {
        let query = volcengine_canonical_query("GetAFPUsage", "cn-beijing");
        assert_eq!(
            query,
            "Action=GetAFPUsage&Region=cn-beijing&Version=2024-01-01"
        );
        let now = chrono::DateTime::from_timestamp(1700000000, 0).unwrap();
        let (auth, date, hash) =
            volcengine_sign("test-ak", "test-sk", "cn-beijing", &query, b"", now);
        assert!(auth.contains("Credential=test-ak/20231114/cn-beijing/ark/request"));
        assert!(auth.contains("SignedHeaders=host;x-date;x-content-sha256;content-type"));
        assert_eq!(date, "20231114T221320Z");
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
