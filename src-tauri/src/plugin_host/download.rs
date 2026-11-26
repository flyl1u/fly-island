//! Streaming downloads for the plugin index and packages. There is no limit on the whole
//! request: a large package on a slow link keeps going as long as bytes keep arriving.
//! A dropped transfer is retried, resuming with a Range request when the server allows it.

use std::{fs::File, io::{Read, Write}, path::Path, time::{Duration, Instant}};
use reqwest::{header, StatusCode, Url};
use sha2::{Digest, Sha256};
use super::{jobs::{CancelToken, CANCELLED}, packages::IndexEntry};

pub const TIMEOUT: &str = "plugin_download_timeout";
pub const INTERRUPTED: &str = "plugin_download_interrupted";
pub const HTTP_CLIENT: &str = "plugin_download_http_client";
pub const HTTP_SERVER: &str = "plugin_download_http_server";
pub const DISK_FULL: &str = "plugin_disk_full";
pub const INTEGRITY: &str = "plugin_package_integrity_failed";
pub const FAILED: &str = "plugin_package_download_failed";
/// The address itself is not allowed. Reported to the page as a failed download.
pub const REFUSED: &str = "plugin_source_refused";
pub const INSTALL_FAILED: &str = "plugin_install_failed";

const PROGRESS_INTERVAL: Duration = Duration::from_millis(200);

#[derive(Clone, Copy)]
pub struct Limits {
    pub connect: Duration,
    /// Fails only when not a single byte arrives for this long.
    pub idle: Duration,
    pub retries: u32,
    pub retry_delay: Duration,
}

impl Default for Limits {
    fn default() -> Self {
        Self { connect: Duration::from_secs(15), idle: Duration::from_secs(30), retries: 2, retry_delay: Duration::from_millis(1500) }
    }
}

/// `code` is what the settings page translates; `detail` only goes to the log.
#[derive(Debug)]
pub struct Failure { pub code: &'static str, pub detail: String }

impl Failure {
    fn new(code: &'static str, detail: impl Into<String>) -> Self { Self { code, detail: detail.into() } }

    pub fn io(error: &std::io::Error) -> Self {
        let code = if disk_full(error) { DISK_FULL } else { INSTALL_FAILED };
        Self::new(code, error.to_string())
    }

    fn retryable(&self) -> bool { matches!(self.code, TIMEOUT | INTERRUPTED | HTTP_SERVER | FAILED) }
}

pub fn disk_full(error: &std::io::Error) -> bool {
    // ERROR_HANDLE_DISK_FULL (39) and ERROR_DISK_FULL (112).
    error.kind() == std::io::ErrorKind::StorageFull || matches!(error.raw_os_error(), Some(39 | 112))
}

/// For an error the unpacking or moving code has already turned into text.
pub fn storage_code(error: &str, otherwise: &'static str) -> &'static str {
    if error.contains("(os error 112)") || error.contains("(os error 39)") { DISK_FULL } else { otherwise }
}

/// reqwest's own message ("error decoding response body") hides the cause; keep the chain.
fn describe(error: reqwest::Error) -> String {
    let error = error.without_url();
    let mut text = error.to_string();
    let mut source = std::error::Error::source(&error);
    while let Some(cause) = source {
        text.push_str(": ");
        text.push_str(&cause.to_string());
        source = cause.source();
    }
    text
}

fn transport(error: reqwest::Error) -> Failure {
    // A refused redirect is a policy decision, not a network fault: it is not retried.
    let code = if error.is_redirect() || error.is_builder() { REFUSED }
        else if error.is_timeout() { TIMEOUT }
        else if error.is_body() || error.is_decode() { INTERRUPTED }
        else { FAILED };
    Failure::new(code, describe(error))
}

pub(super) fn network_source_allowed(url: &Url, local: bool) -> bool {
    url.username().is_empty() && url.password().is_none() && url.host_str().is_some()
        && (url.scheme() == "https" || (local && url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))))
}

enum Source { Local(std::path::PathBuf), Network(Url) }

fn source(url: &str, local: bool) -> Result<Source, Failure> {
    let refused = |detail: &str| Failure::new(REFUSED, detail);
    if local && Path::new(url).is_absolute() { return Ok(Source::Local(url.into())); }
    let parsed = Url::parse(url).map_err(|error| refused(&error.to_string()))?;
    if parsed.scheme() == "file" && local {
        return parsed.to_file_path().map(Source::Local).map_err(|_| refused("Invalid local plugin URL"));
    }
    if !network_source_allowed(&parsed, local) {
        return Err(refused("Plugin downloads require HTTPS (local sources need developer mode)"));
    }
    Ok(Source::Network(parsed))
}

fn client(local: bool, limits: Limits) -> Result<reqwest::Client, Failure> {
    let redirects = reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= 5 { attempt.error("Too many plugin redirects") }
        else if !network_source_allowed(attempt.url(), local) { attempt.error("Unsupported plugin redirect") }
        else { attempt.follow() }
    });
    reqwest::Client::builder().connect_timeout(limits.connect).read_timeout(limits.idle)
        .redirect(redirects).build().map_err(transport)
}

/// Where the bytes go. `restart` is called when a retry cannot resume.
trait Sink: Send {
    fn received(&self) -> u64;
    fn restart(&mut self) -> Result<(), Failure>;
    fn write(&mut self, chunk: &[u8]) -> Result<(), Failure>;
}

async fn attempt(client: &reqwest::Client, url: &Url, limit: u64, sink: &mut dyn Sink) -> Result<(), Failure> {
    let offset = sink.received();
    let mut request = client.get(url.clone());
    if offset > 0 { request = request.header(header::RANGE, format!("bytes={offset}-")); }
    let mut response = request.send().await.map_err(transport)?;
    let status = response.status();
    if status.is_client_error() || status.is_server_error() {
        // A refused range is not a refused download: start over without it.
        if status == StatusCode::RANGE_NOT_SATISFIABLE && offset > 0 {
            sink.restart()?;
            return Err(Failure::new(INTERRUPTED, "Server refused to resume"));
        }
        let code = if status.is_client_error() { HTTP_CLIENT } else { HTTP_SERVER };
        return Err(Failure::new(code, format!("HTTP {}", status.as_u16())));
    }
    if offset > 0 {
        let resumed = status == StatusCode::PARTIAL_CONTENT && response.headers().get(header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with(&format!("bytes {offset}-")));
        if !resumed {
            sink.restart()?;
            if status == StatusCode::PARTIAL_CONTENT {
                return Err(Failure::new(INTERRUPTED, "Server resumed at the wrong offset"));
            }
        }
    }
    while let Some(chunk) = response.chunk().await.map_err(transport)? {
        if sink.received().saturating_add(chunk.len() as u64) > limit {
            return Err(Failure::new(INTEGRITY, "Plugin download too large"));
        }
        sink.write(&chunk)?;
    }
    Ok(())
}

async fn transfer(url: &Url, local: bool, limit: u64, limits: Limits, sink: &mut dyn Sink, complete: Option<u64>) -> Result<(), Failure> {
    let client = client(local, limits)?;
    let mut retries = 0;
    loop {
        let result = attempt(&client, url, limit, sink).await.and_then(|()| {
            // A connection that closes cleanly but early is still an interruption.
            if complete.is_some_and(|size| sink.received() < size) {
                Err(Failure::new(INTERRUPTED, format!("Connection closed after {} bytes", sink.received())))
            } else { Ok(()) }
        });
        match result {
            Err(failure) if failure.retryable() && retries < limits.retries => {
                retries += 1;
                tokio::time::sleep(limits.retry_delay).await;
            }
            other => return other,
        }
    }
}

struct Memory(Vec<u8>);
impl Sink for Memory {
    fn received(&self) -> u64 { self.0.len() as u64 }
    fn restart(&mut self) -> Result<(), Failure> { self.0.clear(); Ok(()) }
    fn write(&mut self, chunk: &[u8]) -> Result<(), Failure> { self.0.extend_from_slice(chunk); Ok(()) }
}

/// The small plugin index, kept in memory.
pub async fn fetch(url: &str, local: bool, limit: u64, limits: Limits) -> Result<Vec<u8>, Failure> {
    match source(url, local)? {
        Source::Local(path) => read_local(&path, limit),
        Source::Network(url) => {
            let mut sink = Memory(Vec::new());
            transfer(&url, local, limit, limits, &mut sink, None).await?;
            Ok(sink.0)
        }
    }
}

fn read_local(path: &Path, limit: u64) -> Result<Vec<u8>, Failure> {
    let unreadable = |detail: String| Failure::new(FAILED, detail);
    let file = File::open(path).map_err(|e| unreadable(e.to_string()))?;
    let metadata = file.metadata().map_err(|e| unreadable(e.to_string()))?;
    if !metadata.is_file() || metadata.len() > limit { return Err(unreadable("Invalid or oversized plugin file".into())); }
    let mut bytes = Vec::new();
    file.take(limit.saturating_add(1)).read_to_end(&mut bytes).map_err(|e| unreadable(e.to_string()))?;
    if bytes.len() as u64 > limit { return Err(unreadable("Plugin file too large".into())); }
    Ok(bytes)
}

/// A package being written to disk, hashed and counted as it arrives.
struct Package<'a> {
    file: File,
    hash: Sha256,
    received: u64,
    reported: Option<Instant>,
    progress: &'a (dyn Fn(u64) + Send + Sync),
    cancel: &'a CancelToken,
}

impl Sink for Package<'_> {
    fn received(&self) -> u64 { self.received }

    fn restart(&mut self) -> Result<(), Failure> {
        use std::io::{Seek, SeekFrom};
        self.file.set_len(0).and_then(|()| self.file.seek(SeekFrom::Start(0)).map(drop)).map_err(|e| Failure::io(&e))?;
        self.hash = Sha256::new();
        self.received = 0;
        self.reported = None;
        (self.progress)(0);
        Ok(())
    }

    fn write(&mut self, chunk: &[u8]) -> Result<(), Failure> {
        // Not retryable, so the transfer ends here.
        if self.cancel.is_cancelled() { return Err(Failure::new(CANCELLED, "Cancelled by the user")); }
        self.file.write_all(chunk).map_err(|e| Failure::io(&e))?;
        self.hash.update(chunk);
        self.received += chunk.len() as u64;
        if self.reported.is_none_or(|at| at.elapsed() >= PROGRESS_INTERVAL) {
            self.reported = Some(Instant::now());
            (self.progress)(self.received);
        }
        Ok(())
    }
}

/// Downloads one package into `target` and checks its size and SHA-256 against the index.
/// `progress` gets the bytes received, at most every 200 ms; `verifying` runs once they are
/// all there. `target` is removed on failure, cancellation included.
pub async fn package(
    entry: &IndexEntry, local: bool, target: &Path, limits: Limits, cancel: &CancelToken,
    progress: &(dyn Fn(u64) + Send + Sync), verifying: &(dyn Fn() + Send + Sync),
) -> Result<(), Failure> {
    let result = write_package(entry, local, target, limits, cancel, progress, verifying).await;
    if result.is_err() { let _ = std::fs::remove_file(target); }
    result
}

async fn write_package(
    entry: &IndexEntry, local: bool, target: &Path, limits: Limits, cancel: &CancelToken,
    progress: &(dyn Fn(u64) + Send + Sync), verifying: &(dyn Fn() + Send + Sync),
) -> Result<(), Failure> {
    let source = source(&entry.url, local)?;
    let file = File::create(target).map_err(|e| Failure::io(&e))?;
    let mut sink = Package { file, hash: Sha256::new(), received: 0, reported: None, progress, cancel };
    let limit = entry.size.min(super::packages::PACKAGE_LIMIT);
    match source {
        Source::Local(path) => {
            let bytes = read_local(&path, super::packages::PACKAGE_LIMIT)?;
            if bytes.len() as u64 > limit { return Err(Failure::new(INTEGRITY, "Plugin SHA-256 or size mismatch")); }
            sink.write(&bytes)?;
        }
        Source::Network(url) => transfer(&url, local, limit, limits, &mut sink, Some(entry.size)).await?,
    }
    progress(sink.received);
    verifying();
    sink.file.flush().map_err(|e| Failure::io(&e))?;
    if sink.received != entry.size || format!("{:x}", sink.hash.finalize()) != entry.sha256.to_lowercase() {
        return Err(Failure::new(INTEGRITY, "Plugin SHA-256 or size mismatch"));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
