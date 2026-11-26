use std::{io::{Read, Write}, net::{TcpListener, TcpStream}, path::PathBuf, sync::{Arc, Mutex}, thread, time::Duration};
use sha2::{Digest, Sha256};
use super::*;
use crate::plugin_host::{manifest::Localized, packages::IndexEntry, service::Host};

const BODY: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz";

fn limits() -> Limits {
    Limits { connect: Duration::from_secs(3), idle: Duration::from_millis(600), retries: 2, retry_delay: Duration::from_millis(20) }
}

/// What the server does with one connection.
#[derive(Clone)]
enum Reply {
    /// Headers for the whole body, then only the first `usize` bytes before closing.
    Cut(usize),
    /// Honour the Range header with a 206.
    Resume,
    /// Ignore the Range header.
    Whole,
    /// The body in pieces with a pause before each one.
    Slow(usize, Duration),
    /// Part of the body, then silence on an open connection.
    Stall(usize),
    Status(&'static str),
}

fn read_request(stream: &mut TcpStream) -> String {
    stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    let mut request = Vec::new();
    let mut buffer = [0; 1024];
    while !request.windows(4).any(|window| window == b"\r\n\r\n") {
        let count = stream.read(&mut buffer).unwrap();
        if count == 0 { break; }
        request.extend_from_slice(&buffer[..count]);
    }
    String::from_utf8_lossy(&request).to_lowercase()
}

fn answer(mut stream: TcpStream, request: &str, reply: Reply) {
    let whole = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n", BODY.len());
    match reply {
        Reply::Cut(count) => { let _ = stream.write_all(whole.as_bytes()); let _ = stream.write_all(&BODY[..count]); }
        Reply::Whole => { let _ = stream.write_all(whole.as_bytes()); let _ = stream.write_all(BODY); }
        Reply::Resume => {
            let from: usize = request.split("range: bytes=").nth(1).and_then(|rest| rest.split('-').next()).unwrap().parse().unwrap();
            let head = format!("HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {from}-{}/{}\r\nConnection: close\r\n\r\n",
                BODY.len() - from, BODY.len() - 1, BODY.len());
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(&BODY[from..]);
        }
        Reply::Slow(pieces, pause) => {
            let _ = stream.write_all(whole.as_bytes());
            for piece in BODY.chunks(BODY.len().div_ceil(pieces)) {
                thread::sleep(pause);
                let _ = stream.write_all(piece);
                let _ = stream.flush();
            }
        }
        Reply::Stall(count) => {
            let _ = stream.write_all(whole.as_bytes());
            let _ = stream.write_all(&BODY[..count]);
            let _ = stream.flush();
            thread::sleep(Duration::from_millis(1500));
        }
        Reply::Status(status) => {
            let _ = stream.write_all(format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes());
        }
    }
}

/// A local server answering one connection per reply; returns its URL and the requests seen.
fn serve(replies: Vec<Reply>) -> (String, Arc<Mutex<Vec<String>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/package.zip", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let seen = requests.clone();
    thread::spawn(move || {
        for reply in replies {
            let Ok((mut stream, _)) = listener.accept() else { return };
            let request = read_request(&mut stream);
            seen.lock().unwrap().push(request.clone());
            thread::spawn(move || answer(stream, &request, reply));
        }
    });
    (url, requests)
}

fn entry(url: String) -> IndexEntry {
    let text = Localized { zh: "测试".into(), en: "Test".into() };
    IndexEntry { id: "example-hello".into(), version: "0.1.0".into(), name: text.clone(), description: text, api_version: 1,
        url, sha256: format!("{:x}", Sha256::digest(BODY)), size: BODY.len() as u64, min_app_version: "0.1.0".into() }
}

fn temporary(name: &str) -> PathBuf {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../node_modules/.cache/plugin-tests").join(format!("download-{name}-{}", std::process::id()));
    if root.exists() { std::fs::remove_dir_all(&root).unwrap(); }
    std::fs::create_dir_all(&root).unwrap();
    root
}

/// Runs one package download; returns the result, the target path and the progress reports.
fn download(name: &str, entry: &IndexEntry) -> (Result<(), Failure>, PathBuf, Vec<u64>) {
    let target = temporary(name).join("package.zip");
    let seen = Mutex::new(Vec::new());
    let result = tauri::async_runtime::block_on(package(entry, true, &target, limits(), &Default::default(),
        &|received| seen.lock().unwrap().push(received), &|| {}));
    (result, target, seen.into_inner().unwrap())
}

#[test]
fn a_slow_transfer_outlives_the_idle_limit_while_bytes_keep_arriving() {
    // Eight pieces 150 ms apart: 1.2 s in all, twice the 600 ms idle limit.
    let (url, requests) = serve(vec![Reply::Slow(8, Duration::from_millis(150))]);
    let (result, target, progress) = download("slow", &entry(url));
    result.unwrap();
    assert_eq!(std::fs::read(target).unwrap(), BODY);
    assert_eq!(requests.lock().unwrap().len(), 1);
    assert_eq!(progress.last(), Some(&(BODY.len() as u64)));
    // Throttled to one report per 200 ms, plus the final one.
    assert!(progress.len() <= 8, "{progress:?}");
}

#[test]
fn a_dropped_connection_resumes_from_where_it_stopped() {
    let (url, requests) = serve(vec![Reply::Cut(20), Reply::Resume]);
    let (result, target, _) = download("resume", &entry(url));
    result.unwrap();
    assert_eq!(std::fs::read(target).unwrap(), BODY);
    let requests = requests.lock().unwrap();
    assert!(!requests[0].contains("range:") && requests[1].contains("range: bytes=20-"), "{requests:?}");
}

#[test]
fn a_server_without_ranges_is_read_again_from_the_start() {
    let (url, _) = serve(vec![Reply::Cut(20), Reply::Whole]);
    let (result, target, progress) = download("restart", &entry(url));
    result.unwrap();
    assert_eq!(std::fs::read(target).unwrap(), BODY);
    assert!(progress.contains(&0), "the restart is reported: {progress:?}");
}

#[test]
fn silence_and_repeated_cuts_fail_after_two_retries_and_leave_no_file() {
    for (name, reply, code) in [
        ("stall", Reply::Stall(10), TIMEOUT),
        ("cut", Reply::Cut(0), INTERRUPTED),
        ("server", Reply::Status("503 Service Unavailable"), HTTP_SERVER),
    ] {
        let (url, requests) = serve(vec![reply.clone(), reply.clone(), reply, Reply::Whole]);
        let (result, target, _) = download(name, &entry(url));
        assert_eq!(result.unwrap_err().code, code, "{name}");
        assert_eq!(requests.lock().unwrap().len(), 3, "{name}");
        assert!(!target.exists(), "{name}");
    }
}

#[test]
fn a_missing_file_is_not_retried() {
    let (url, requests) = serve(vec![Reply::Status("404 Not Found"), Reply::Whole]);
    let (result, target, _) = download("missing", &entry(url));
    let failure = result.unwrap_err();
    assert_eq!((failure.code, failure.detail.as_str()), (HTTP_CLIENT, "HTTP 404"));
    assert_eq!(requests.lock().unwrap().len(), 1);
    assert!(!target.exists());
}

#[test]
fn oversized_and_altered_packages_fail_the_integrity_check() {
    let (url, requests) = serve(vec![Reply::Whole]);
    let mut short = entry(url);
    short.size = 10;
    let (result, target, _) = download("oversized", &short);
    assert_eq!(result.unwrap_err().code, INTEGRITY);
    assert!(!target.exists());
    assert_eq!(requests.lock().unwrap().len(), 1);

    let (url, _) = serve(vec![Reply::Whole]);
    let mut altered = entry(url);
    altered.sha256 = "0".repeat(64);
    let (result, target, _) = download("altered", &altered);
    assert_eq!(result.unwrap_err().code, INTEGRITY);
    assert!(!target.exists());
}

#[test]
fn disk_full_has_its_own_code() {
    assert_eq!(Failure::io(&std::io::Error::from_raw_os_error(112)).code, DISK_FULL);
    assert_eq!(Failure::io(&std::io::Error::from(std::io::ErrorKind::PermissionDenied)).code, INSTALL_FAILED);
    assert_eq!(storage_code("磁盘空间不足。 (os error 112)", INSTALL_FAILED), DISK_FULL);
    assert_eq!(storage_code("bad zip", "plugin_package_invalid"), "plugin_package_invalid");
}

#[test]
fn a_second_install_of_the_same_plugin_returns_at_once() {
    let root = temporary("duplicate");
    let (url, requests) = serve(vec![Reply::Slow(6, Duration::from_millis(150))]);
    let index = root.join("index.json");
    std::fs::write(&index, serde_json::to_vec(&[entry(url)]).unwrap()).unwrap();
    let host = Arc::new(Host::new(root.join("data"), None, true).unwrap());
    let mut registry = host.snapshot().registry;
    registry.developer_mode = true;
    registry.index_url = index.to_string_lossy().into_owned();
    host.persist(registry).unwrap();
    let running = host.clone();
    let first = thread::spawn(move || tauri::async_runtime::block_on(running.install("example-hello", false)));
    let until = std::time::Instant::now() + Duration::from_secs(3);
    while requests.lock().unwrap().is_empty() && std::time::Instant::now() < until { thread::sleep(Duration::from_millis(10)); }
    assert_eq!(tauri::async_runtime::block_on(host.install("example-hello", false)).unwrap_err(), "plugin_install_in_progress");
    assert_eq!(tauri::async_runtime::block_on(host.remove("example-hello")).unwrap_err(), "plugin_install_in_progress");
    assert!(host.operation.try_lock().is_ok(), "the download leaves other plugin operations usable");
    // The body is not a ZIP, so the one real download ends at unpacking.
    assert_eq!(first.join().unwrap().unwrap_err(), "plugin_package_invalid");
    assert_eq!(requests.lock().unwrap().len(), 1);
    assert_eq!(host.jobs.list()[0].error.as_deref(), Some("plugin_package_invalid"));
    assert!(!host.root.join("plugins/.download-example-hello.zip").exists());
    drop(host);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn cancelling_a_stalled_download_leaves_nothing_behind_and_frees_the_plugin() {
    let root = temporary("cancel");
    // Part of the body, then silence: the install is waiting on a read when it is cancelled.
    let (url, requests) = serve(vec![Reply::Stall(10)]);
    let index = root.join("index.json");
    std::fs::write(&index, serde_json::to_vec(&[entry(url)]).unwrap()).unwrap();
    let mut host = Host::new(root.join("data"), None, true).unwrap();
    // Far longer than the test: only cancellation can end the wait in time.
    host.limits.idle = Duration::from_secs(60);
    let host = Arc::new(host);
    let mut registry = host.snapshot().registry;
    registry.developer_mode = true;
    registry.index_url = index.to_string_lossy().into_owned();
    host.persist(registry).unwrap();
    assert!(!host.jobs.cancel("example-hello"), "nothing to cancel yet");
    let running = host.clone();
    let first = thread::spawn(move || tauri::async_runtime::block_on(running.install("example-hello", false)));
    let until = std::time::Instant::now() + Duration::from_secs(3);
    while requests.lock().unwrap().is_empty() && std::time::Instant::now() < until { thread::sleep(Duration::from_millis(10)); }
    thread::sleep(Duration::from_millis(100));
    let asked = std::time::Instant::now();
    assert!(host.jobs.cancel("example-hello"));
    assert_eq!(first.join().unwrap().unwrap_err(), "plugin_install_cancelled");
    assert!(asked.elapsed() < Duration::from_secs(1), "a stalled read stops at once");
    assert!(host.jobs.list().is_empty(), "a cancelled job is not shown as failed");
    assert!(!host.root.join("plugins/.download-example-hello.zip").exists());
    assert!(!host.root.join("plugins/.staging-example-hello").exists());
    assert!(!host.snapshot().registry.installed.contains_key("example-hello"));
    drop(host.jobs.begin("example-hello", crate::plugin_host::jobs::Phase::Downloading).unwrap());
    drop(host);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn a_chunk_after_cancellation_is_not_written() {
    let (url, _) = serve(vec![Reply::Whole]);
    let target = temporary("cancel-chunk").join("package.zip");
    let token = crate::plugin_host::jobs::CancelToken::default();
    token.cancel();
    let failure = tauri::async_runtime::block_on(package(&entry(url), true, &target, limits(), &token, &|_| {}, &|| {})).unwrap_err();
    assert_eq!(failure.code, "plugin_install_cancelled");
    assert!(!target.exists());
}
