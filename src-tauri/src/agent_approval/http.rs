//! Just enough HTTP/1.1 for the approval endpoint: one request per connection, read whole, and
//! one JSON answer, after which the connection closes. Written against the standard library so
//! the server keeps the socket and can tell when the agent hangs up while the user decides.

use std::io::{BufRead, Read, Write};

use super::config::remote_token;

/// Names the SSH remote computer a request came from, through the island's reverse forward.
pub(super) const REMOTE_HEADER: &str = "x-focusd-remote";

/// A hook's input: a command with its full output, or a file being written, can be large.
pub(super) const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
const MAX_LINE_BYTES: usize = 8 * 1024;
const MAX_HEADERS: usize = 64;

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct HttpRequest {
    pub method: String,
    /// The path without its query.
    pub path: String,
    /// Names in lower case.
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpRequest {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }
}

/// Why a request was turned away, with the status to answer.
#[derive(Debug, PartialEq, Eq)]
pub(super) struct HttpError {
    pub status: u16,
    pub message: &'static str,
}

const fn error(status: u16, message: &'static str) -> HttpError {
    HttpError { status, message }
}

pub(super) fn read_request(reader: &mut impl BufRead) -> Result<HttpRequest, HttpError> {
    let request_line = read_line(reader)?;
    let mut parts = request_line.split(' ');
    let (Some(method), Some(target), Some(version)) = (parts.next(), parts.next(), parts.next()) else {
        return Err(error(400, "Malformed request line."));
    };
    if !version.starts_with("HTTP/1.") {
        return Err(error(505, "Only HTTP/1.x is supported."));
    }
    let path = target.split('?').next().unwrap_or_default().to_string();

    let mut headers = Vec::new();
    loop {
        let line = read_line(reader)?;
        if line.is_empty() {
            break;
        }
        if headers.len() == MAX_HEADERS {
            return Err(error(431, "Too many headers."));
        }
        let (name, value) = line.split_once(':').ok_or(error(400, "Malformed header."))?;
        headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
    }
    let mut request = HttpRequest { method: method.to_string(), path, headers, body: Vec::new() };

    let chunked = request
        .header("transfer-encoding")
        .is_some_and(|encoding| encoding.to_ascii_lowercase().contains("chunked"));
    request.body = if chunked {
        read_chunked(reader)?
    } else {
        let length = match request.header("content-length") {
            Some(value) => value.parse::<usize>().map_err(|_| error(400, "Bad Content-Length."))?,
            None => 0,
        };
        if length > MAX_BODY_BYTES {
            return Err(error(413, "The body is too large."));
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body).map_err(|_| error(400, "The body ended early."))?;
        body
    };
    Ok(request)
}

fn read_chunked(reader: &mut impl BufRead) -> Result<Vec<u8>, HttpError> {
    let mut body = Vec::new();
    loop {
        let size_line = read_line(reader)?;
        let size_text = size_line.split(';').next().unwrap_or_default().trim();
        let size = usize::from_str_radix(size_text, 16).map_err(|_| error(400, "Bad chunk size."))?;
        if size == 0 {
            // Trailers, if any, end with an empty line.
            while !read_line(reader)?.is_empty() {}
            return Ok(body);
        }
        if body.len() + size > MAX_BODY_BYTES {
            return Err(error(413, "The body is too large."));
        }
        let start = body.len();
        body.resize(start + size, 0);
        reader.read_exact(&mut body[start..]).map_err(|_| error(400, "A chunk ended early."))?;
        if !read_line(reader)?.is_empty() {
            return Err(error(400, "A chunk is longer than its size."));
        }
    }
}

/// One line without its CRLF (or bare LF).
fn read_line(reader: &mut impl BufRead) -> Result<String, HttpError> {
    let mut line = Vec::new();
    let read = reader
        .by_ref()
        .take(MAX_LINE_BYTES as u64 + 1)
        .read_until(b'\n', &mut line)
        .map_err(|_| error(400, "Could not read the request."))?;
    if read == 0 {
        return Err(error(400, "The request ended early."));
    }
    if line.len() > MAX_LINE_BYTES || !line.ends_with(b"\n") {
        return Err(error(431, "A line is too long."));
    }
    line.pop();
    if line.ends_with(b"\r") {
        line.pop();
    }
    String::from_utf8(line).map_err(|_| error(400, "The request is not UTF-8."))
}

/// Answers with `body` as JSON and closes the connection.
pub(super) fn write_response(writer: &mut impl Write, status: u16, body: &str) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        431 => "Request Header Fields Too Large",
        _ => "Error",
    };
    write!(
        writer,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    writer.flush()
}

/// Whether the request may reach the endpoint: from this machine's agents, or a remote
/// computer's through the forward on the same port, not from a web page (no Origin, and a Host
/// naming this port, which DNS rebinding cannot fake), with the token; a remote one carries that
/// computer's own. Returns the remote computer.
pub(super) fn check_access(request: &HttpRequest, token: &str, port: u16) -> Result<Option<String>, HttpError> {
    if request.header("origin").is_some() {
        return Err(error(403, "Requests from web pages are not accepted."));
    }
    let host_ok = request
        .header("host")
        .is_some_and(|host| host == format!("127.0.0.1:{port}") || host == format!("localhost:{port}"));
    if !host_ok {
        return Err(error(403, "Unexpected Host."));
    }
    let remote = request.header(REMOTE_HEADER).filter(|host| !host.is_empty()).map(str::to_string);
    let expected = remote.as_deref().map_or_else(|| token.to_string(), |host| remote_token(token, host));
    let presented = request.header("authorization").and_then(|value| value.strip_prefix("Bearer ")).unwrap_or_default();
    if !same_secret(presented.trim().as_bytes(), expected.as_bytes()) {
        return Err(error(401, "Missing or wrong token."));
    }
    Ok(remote)
}

/// Compares in time that does not depend on where the first difference is.
fn same_secret(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}
