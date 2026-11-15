use super::{model::*, query};
use serde_json::json;
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

fn mock(
    status: &str,
    body: &str,
    delay: Duration,
) -> (String, mpsc::Receiver<String>, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    listener.set_nonblocking(true).unwrap();
    let (tx, rx) = mpsc::channel();
    let response=format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
    let handle = thread::spawn(move || {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(5) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .unwrap();
                    let mut request = Vec::new();
                    let mut buffer = [0; 4096];
                    while let Ok(count) = stream.read(&mut buffer) {
                        if count == 0 {
                            break;
                        }
                        request.extend_from_slice(&buffer[..count]);
                        if request.windows(4).any(|w| w == b"\r\n\r\n") {
                            break;
                        }
                    }
                    tx.send(String::from_utf8_lossy(&request).to_string())
                        .unwrap();
                    thread::sleep(delay);
                    let _ = stream.write_all(response.as_bytes());
                    break;
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(5))
                }
                Err(e) => panic!("mock accept: {e}"),
            }
        }
    });
    (url, rx, handle)
}

fn account(base_url: &str, template: &str) -> Account {
    serde_json::from_value(json!({"id":"transport-test","name":"Test","template":template,"baseUrl":base_url,"userId":"42","timeoutSeconds":2,"intervalMinutes":0,"quotaPerUnit":500000,"enabled":false})).unwrap()
}

#[test]
fn newapi_uses_dashboard_token_and_user_header() {
    let (url, request, server) = mock(
        "200 OK",
        r#"{"success":true,"data":{"quota":500000,"used_quota":0}}"#,
        Duration::ZERO,
    );
    let secrets = Secrets {
        access_token: "dashboard-token".into(),
        api_key: "wrong-inference-key".into(),
        ..Default::default()
    };
    let result = tauri::async_runtime::block_on(query::run(
        account(&format!("{url}/v1"), "newapi"),
        secrets,
    ))
    .unwrap();
    let request = request
        .recv_timeout(Duration::from_secs(3))
        .unwrap()
        .to_lowercase();
    assert!(request.starts_with("get /api/user/self "));
    assert!(request.contains("authorization: bearer dashboard-token"));
    assert!(request.contains("new-api-user: 42"));
    assert!(!request.contains("wrong-inference"));
    assert_eq!(result.data[0].remaining, Some(1.0));
    server.join().unwrap();
}

#[test]
fn sub2api_normalizes_v1_and_preserves_unlimited() {
    for suffix in ["", "/v1", "/v1/"] {
        let (url, request, server) = mock("200 OK", r#"{"remaining":-1}"#, Duration::ZERO);
        let secrets = Secrets {
            api_key: "test-key".into(),
            ..Default::default()
        };
        let result = tauri::async_runtime::block_on(query::run(
            account(&format!("{url}{suffix}"), "sub2api"),
            secrets,
        ))
        .unwrap();
        assert!(result.data[0].unlimited);
        assert!(request.recv().unwrap().starts_with("GET /v1/usage "));
        server.join().unwrap();
    }
}

#[test]
fn transport_errors_are_distinct_and_do_not_include_credentials() {
    for (status, body, expected) in [
        ("401 Unauthorized", "{}", "HTTP 401"),
        ("403 Forbidden", "{}", "HTTP 403"),
        ("429 Too Many Requests", "{}", "HTTP 429"),
        ("302 Found", "{}", "HTTP 302"),
        ("200 OK", "<html>login</html>", "not valid JSON"),
        (
            "200 OK",
            r#"{"success":false,"message":"secret-test"}"#,
            "business error",
        ),
        ("200 OK", "{}", "Missing balance"),
    ] {
        let (url, _request, server) = mock(status, body, Duration::ZERO);
        let secrets = Secrets {
            api_key: "secret-test".into(),
            ..Default::default()
        };
        let error = tauri::async_runtime::block_on(query::run(account(&url, "general"), secrets))
            .unwrap_err();
        assert!(
            error.contains(expected),
            "{error} should contain {expected}"
        );
        assert!(!error.contains("secret-test"));
        server.join().unwrap();
    }
}

#[test]
fn timeouts_cover_the_complete_query() {
    let (url, _request, server) = mock("200 OK", r#"{"balance":3}"#, Duration::from_millis(1200));
    let mut a = account(&url, "general");
    a.timeout_seconds = 1;
    let secrets = Secrets {
        api_key: "secret-test".into(),
        ..Default::default()
    };
    let error = tauri::async_runtime::block_on(query::run(a, secrets)).unwrap_err();
    assert!(error.to_lowercase().contains("timed out"));
    server.join().unwrap();
}

#[test]
fn custom_request_extractor_runs_against_local_http() {
    let (url, request, server) = mock("200 OK", r#"{"wallet":{"balance":7.5}}"#, Duration::ZERO);
    let secrets=Secrets {api_key:"mock-token".into(),code:r#"({request:{url:'{{baseUrl}}/wallet',headers:{Authorization:'Bearer {{apiKey}}'}},extractor:r=>({remaining:r.wallet.balance,unit:'CNY'})})"#.into(),..Default::default()};
    let result =
        tauri::async_runtime::block_on(query::run(account(&url, "custom"), secrets)).unwrap();
    assert_eq!(result.data[0].remaining, Some(7.5));
    assert_eq!(result.data[0].unit.as_deref(), Some("CNY"));
    assert!(request.recv().unwrap().contains("Bearer mock-token"));
    server.join().unwrap();
}
