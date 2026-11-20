use crate::win32::process_job::ProcessJob;
use serde_json::Value;
use std::{io::{BufRead, BufReader, Read, Write}, os::windows::process::CommandExt, path::Path, process::{ChildStdout, Command, Stdio}, time::{Duration, Instant}};

const OUTPUT_LIMIT: u64 = 2 * 1024 * 1024;

pub(super) fn run(program: &Path, args: &[String], seconds: u64) -> Result<Value, String> {
    run_reader(program, args, seconds, None, |stdout| {
        let mut bytes = Vec::new();
        stdout.take(OUTPUT_LIMIT + 1).read_to_end(&mut bytes)
            .map_err(|e| format!("Device reader output failed: {e}"))?;
        if bytes.len() as u64 > OUTPUT_LIMIT { return Err("Device reader output exceeded its limit".into()); }
        serde_json::from_slice(&bytes).map_err(|_| "Invalid device reader response".into())
    })
}

pub(super) fn poll(
    program: &Path, args: &[String], progress: impl FnMut(&Value) + Send + 'static,
) -> Result<Value, String> {
    // A foreground poll emits cumulative snapshots while slower readers finish.
    const REQUEST: &[u8] = b"{\"command\":\"poll\",\"requestId\":1,\"parkEmptyReaders\":true}\n";
    run_reader(program, args, 50, Some(REQUEST), move |stdout| read_snapshots(stdout, progress))
}

fn read_snapshots(input: impl Read, mut progress: impl FnMut(&Value)) -> Result<Value, String> {
    let mut reader = BufReader::new(input);
    let mut line = Vec::new();
    let mut complete = None;
    // The engine emits at most 96 partial snapshots and one final snapshot.
    for index in 0..=97 {
        line.clear();
        let count = reader.by_ref().take(OUTPUT_LIMIT + 1).read_until(b'\n', &mut line)
            .map_err(|e| format!("Device reader output failed: {e}"))?;
        if count == 0 { break; }
        if count as u64 > OUTPUT_LIMIT || index == 97 { return Err("Device reader output exceeded its limit".into()); }
        let value: Value = serde_json::from_slice(&line).map_err(|_| "Invalid device reader response")?;
        if value["schema"] != 2 || value["requestId"] != 1 || !value["devices"].is_array() || complete.is_some() {
            return Err("Invalid battery query response".into());
        }
        match value["complete"].as_bool() {
            Some(true) => complete = Some(value),
            Some(false) => progress(&value),
            None => return Err("Invalid battery query response".into()),
        }
    }
    complete.ok_or_else(|| "Battery query ended before returning a result".into())
}

fn run_reader(
    program: &Path, args: &[String], seconds: u64, request: Option<&[u8]>,
    read: impl FnOnce(ChildStdout) -> Result<Value, String> + Send + 'static,
) -> Result<Value, String> {
    let mut child = Command::new(program).args(args).creation_flags(0x08000000)
        .stdin(if request.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().map_err(|e| format!("Could not start device reader: {e}"))?;
    let job = match ProcessJob::attach(&child) {
        Ok(job) => job,
        Err(e) => { let _ = child.kill(); let _ = child.wait(); return Err(format!("Could not isolate device reader: {e}")); }
    };
    let stdout = child.stdout.take().ok_or("Device reader output unavailable")?;
    if let Some(request) = request {
        child.stdin.take().ok_or("Device reader input unavailable")?.write_all(request)
            .map_err(|e| format!("Device reader input failed: {e}"))?;
    }
    let reader = std::thread::spawn(move || read(stdout));
    let deadline = Instant::now() + Duration::from_secs(seconds);
    let outcome = loop {
        match child.try_wait() {
            Ok(Some(status)) => break if status.success() { Ok(()) } else { Err("Device reader failed; refresh or rebuild the local plugin".to_string()) },
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            Ok(None) => break Err("Device reader timed out; try refreshing".to_string()),
            Err(e) => break Err(format!("Device reader failed: {e}")),
        }
    };
    drop(job); // Also stops isolated grandchildren on success, error and timeout.
    let _ = child.wait();
    let result = reader.join().map_err(|_| "Device reader output failed")?;
    outcome?;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_snapshots_arrive_before_final_or_truncated_response() {
        let partial = b"{\"schema\":2,\"requestId\":1,\"complete\":false,\"devices\":[{\"percent\":93}]}\n";
        let final_line = b"{\"schema\":2,\"requestId\":1,\"complete\":true,\"devices\":[{\"percent\":93},{\"percent\":84}]}\n";
        let mut observed = None;
        let result = read_snapshots(partial.as_slice().chain(final_line.as_slice()), |value| {
            observed = value["devices"][0]["percent"].as_u64();
        }).unwrap();
        assert_eq!(observed, Some(93));
        assert_eq!(result["devices"][1]["percent"], 84);
        assert!(read_snapshots(partial.as_slice(), |_| {}).is_err());
    }
}
