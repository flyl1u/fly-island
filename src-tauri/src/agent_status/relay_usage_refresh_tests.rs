//! A single-use refresh token fixture; never touches Windows Credential Manager.
use super::*;
use std::io::{BufRead, BufReader, Read, Write};

#[tokio::test]
async fn a_probe_retains_rotated_credentials_for_saving_and_the_next_probe() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    listener.set_nonblocking(true).unwrap();
    let server = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(12);
        let mut requests = 0;
        let mut refreshed = false;
        while requests < 8 && Instant::now() < deadline {
            let (mut stream, _) = match listener.accept() {
                Ok(pair) => pair,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(5)); continue;
                }
                Err(error) => panic!("fixture accept: {error}"),
            };
            stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut head = String::new();
            loop {
                let mut line = String::new();
                assert_ne!(reader.read_line(&mut line).unwrap(), 0);
                if line == "\r\n" { break; }
                head.push_str(&line);
            }
            let length = head.lines().find_map(|line| line.to_lowercase().strip_prefix("content-length: ")
                .and_then(|value| value.parse::<usize>().ok())).unwrap_or(0);
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            let (status, answer) = if head.starts_with("POST /api/v1/auth/refresh ") {
                assert!(!refreshed, "the previous refresh token works only once");
                assert_eq!(serde_json::from_slice::<Value>(&body).unwrap()["refresh_token"], "refresh-old");
                refreshed = true;
                ("200 OK", json!({"code": 0, "data": {"access_token": "access-new", "refresh_token": "refresh-new"}}))
            } else if head.starts_with("GET /api/v1/auth/me ") && head.contains("Bearer access-old") {
                ("401 Unauthorized", json!({}))
            } else {
                assert!(head.contains("Bearer access-new"), "rotated token must authenticate subsequent requests");
                ("200 OK", json!({"code": 0, "data": {"balance": 12.5, "total_actual_cost": 1.0}}))
            };
            let answer = answer.to_string();
            write!(stream, "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{answer}", answer.len()).unwrap();
            requests += 1;
        }
        assert_eq!(requests, 8);
    });
    let mut account: RelayAccount = serde_json::from_value(json!({"id":"new", "name":"Fixture", "adapter":"sub2api",
        "baseUrl":format!("http://{address}"), "accessToken":"access-old", "refreshToken":"refresh-old"})).unwrap();
    probe(&mut account).await.unwrap();
    assert_eq!(account.access_token.as_deref(), Some("access-new"));
    assert_eq!(account.refresh_token.as_deref(), Some("refresh-new"));
    // The exact object that save_relay_account serializes succeeds without another refresh.
    probe(&mut account).await.unwrap();
    server.join().unwrap();
}
