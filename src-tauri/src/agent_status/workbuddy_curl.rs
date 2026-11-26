use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
    time::timeout,
};

use super::workbuddy_official::ProtocolError;

const BILLING_URL: &str = "https://copilot.tencent.com/v2/billing/meter/get-user-resource";
const MAX_BODY: usize = 512 * 1024;
const MAX_OUTPUT: usize = MAX_BODY + 4;
const MAX_HEADER: usize = 4096;

fn billing_config(
    token: &str,
    user: &str,
    domain: &str,
    body: &str,
) -> Result<String, ProtocolError> {
    if [token, user, domain].into_iter().any(|value| {
        value.is_empty() || value.len() > MAX_HEADER || value.chars().any(char::is_control)
    }) {
        return Err(ProtocolError::InvalidResponse);
    }
    let quote = |value: &str| value.replace('\\', "\\\\").replace('"', "\\\"");
    Ok(format!(
        "url = \"{BILLING_URL}\"\nrequest = \"POST\"\nheader = \"Authorization: Bearer {}\"\n\
         header = \"X-User-Id: {}\"\nheader = \"X-Domain: {}\"\nheader = \"Accept: application/json\"\n\
         header = \"Content-Type: application/json\"\ndata-binary = \"{}\"\n",
        quote(token), quote(user), quote(domain), quote(body),
    ))
}

fn response_body(mut output: Vec<u8>) -> Result<Vec<u8>, ProtocolError> {
    let status_start = output
        .len()
        .checked_sub(4)
        .ok_or(ProtocolError::InvalidResponse)?;
    if output[status_start] != b'\n' || status_start > MAX_BODY {
        return Err(ProtocolError::InvalidResponse);
    }
    match &output[status_start + 1..] {
        b"200" => {
            output.truncate(status_start);
            Ok(output)
        }
        b"401" | b"403" => Err(ProtocolError::LoginRequired),
        b"429" => Err(ProtocolError::RateLimited),
        [b'5', _, _] => Err(ProtocolError::Network),
        _ => Err(ProtocolError::InvalidResponse),
    }
}

pub(super) async fn billing_request(
    token: &str,
    user: &str,
    domain: &str,
    body: &str,
) -> Result<Vec<u8>, ProtocolError> {
    let config = billing_config(token, user, domain, body)?;
    let program = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .map(|path| path.join("System32/curl.exe"))
        .filter(|path| path.is_file())
        .ok_or(ProtocolError::CurlUnavailable)?;
    let mut command = Command::new(program);
    #[cfg(windows)]
    command.creation_flags(crate::system::CREATE_NO_WINDOW);
    let mut child = command
        .args([
            "--disable",
            "--config",
            "-",
            "--silent",
            "--proto",
            "=https",
            "--connect-timeout",
            "4",
            "--max-time",
            "10",
            "--max-filesize",
            "524288",
            "--write-out",
            "\n%{http_code}",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                ProtocolError::CurlUnavailable
            } else {
                ProtocolError::Network
            }
        })?;
    let read = timeout(Duration::from_secs(12), async {
        let mut input = child.stdin.take().ok_or(ProtocolError::Network)?;
        input
            .write_all(config.as_bytes())
            .await
            .map_err(|_| ProtocolError::Network)?;
        drop(input);
        let mut output = Vec::new();
        child
            .stdout
            .take()
            .ok_or(ProtocolError::Network)?
            .take((MAX_OUTPUT + 1) as u64)
            .read_to_end(&mut output)
            .await
            .map_err(|_| ProtocolError::Network)?;
        if output.len() > MAX_OUTPUT {
            return Err(ProtocolError::InvalidResponse);
        }
        let status = child.wait().await.map_err(|_| ProtocolError::Network)?;
        if !status.success() {
            return Err(match status.code() {
                Some(28) => ProtocolError::Timeout,
                Some(63) => ProtocolError::InvalidResponse,
                _ => ProtocolError::Network,
            });
        }
        response_body(output)
    })
    .await;
    let result = read.unwrap_or(Err(ProtocolError::Timeout));
    if result.is_err() {
        let _ = child.kill().await;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_are_only_serialized_to_stdin_and_cannot_add_config_directives() {
        let config =
            billing_config("fake-token", "quoted\"user", "back\\slash", r#"{"data":1}"#).unwrap();
        assert!(config.contains("Authorization: Bearer fake-token"));
        assert!(config.contains(r#"X-User-Id: quoted\"user"#));
        assert!(config.contains(r#"X-Domain: back\\slash"#));
        assert_eq!(
            billing_config("token\r\nnew-option", "user", "domain", "{}"),
            Err(ProtocolError::InvalidResponse)
        );
    }

    #[test]
    fn response_status_is_classified_without_returning_error_body() {
        assert_eq!(
            response_body(b"{\"data\":1}\n200".to_vec()).unwrap(),
            b"{\"data\":1}"
        );
        assert_eq!(
            response_body(b"secret\n401".to_vec()),
            Err(ProtocolError::LoginRequired)
        );
        assert_eq!(
            response_body(b"secret\n429".to_vec()),
            Err(ProtocolError::RateLimited)
        );
        assert_eq!(
            response_body(b"200".to_vec()),
            Err(ProtocolError::InvalidResponse)
        );
    }
}
