use std::{
    collections::{HashSet, VecDeque},
    fs,
    path::{Path, PathBuf},
    sync::{atomic::{AtomicU64, Ordering}, mpsc::{self, Sender, SyncSender}, OnceLock},
    thread,
    time::{Duration, Instant},
};

use super::{file::{self, LogFile}, format::{self, Category}};
use crate::win32::std_handle::local_timestamp;

const RING_LIMIT: usize = 2_000;
const REPEAT_WINDOW: Duration = Duration::from_secs(3);
const REPEAT_KEYS: usize = 512;
static QUEUE: OnceLock<SyncSender<Request>> = OnceLock::new();
static DROPPED: AtomicU64 = AtomicU64::new(0);

#[cfg(test)]
struct Snapshot {
    pub recent: String,
    pub startup: String,
}

enum Request {
    Event { body: String, at: Instant, startup: bool },
    SetEnabled(bool, Sender<Result<(), String>>),
    Clear(Sender<Result<(), String>>),
}

#[derive(Clone)]
struct Record {
    sequence: u64,
    line: String,
}

struct Buffer {
    recent: VecDeque<Record>,
    startup: Vec<Record>,
    sequence: u64,
    keys: HashSet<String>,
    expiry: VecDeque<(Instant, String)>,
    repeated: u64,
}

impl Buffer {
    fn new() -> Self {
        Self { recent: VecDeque::with_capacity(RING_LIMIT), startup: Vec::new(), sequence: 0,
            keys: HashSet::new(), expiry: VecDeque::new(), repeated: 0 }
    }

    fn push(&mut self, timestamp: &str, body: String, at: Instant, startup: bool) -> Option<&Record> {
        while self.expiry.front().is_some_and(|(first, _)| at.saturating_duration_since(*first) >= REPEAT_WINDOW || self.expiry.len() >= REPEAT_KEYS) {
            if let Some((_, expired)) = self.expiry.pop_front() { self.keys.remove(&expired); }
        }
        if !self.keys.insert(body.clone()) {
            self.repeated = self.repeated.saturating_add(1);
            return None;
        }
        let line = format::line(timestamp, &body, std::mem::take(&mut self.repeated));
        self.expiry.push_back((at, body));
        self.sequence += 1;
        let record = Record { sequence: self.sequence, line };
        if startup && self.startup.len() < 256 { self.startup.push(record.clone()); }
        if self.recent.len() == RING_LIMIT { self.recent.pop_front(); }
        self.recent.push_back(record);
        self.recent.back()
    }

    #[cfg(test)]
    fn snapshot(&self) -> Snapshot {
        let mut recent: String = self.recent.iter().map(|record| record.line.as_str()).collect();
        if self.repeated != 0 {
            recent.push_str(&format::line(&local_timestamp(), "[startup] pending_repeat reason=snapshot", self.repeated));
        }
        Snapshot { recent, startup: self.startup.iter().map(|record| record.line.as_str()).collect() }
    }

    fn clear(&mut self) {
        self.recent.clear();
        self.keys.clear();
        self.expiry.clear();
        self.repeated = 0;
    }
}

struct Output {
    dir: PathBuf,
    enabled: bool,
    file: Option<LogFile>,
    last_written: u64,
}

impl Output {
    fn write(&mut self, record: &Record) {
        if !self.enabled || record.sequence <= self.last_written { return; }
        if self.file.is_none() { self.file = LogFile::open(&self.dir); }
        if self.file.as_mut().is_some_and(|file| file.write(&record.line).is_ok()) {
            self.last_written = record.sequence;
        } else {
            self.file = None;
        }
    }

    fn set_enabled(&mut self, enabled: bool, root: &Path, buffer: &Buffer) -> Result<(), String> {
        let settings = serde_json::to_vec(&super::LogSettings { enabled }).map_err(|error| error.to_string())?;
        fs::create_dir_all(root).and_then(|()| fs::write(root.join(super::SETTINGS_FILE), settings)).map_err(|error| error.to_string())?;
        self.enabled = enabled;
        super::set_capture_enabled(enabled);
        if enabled {
            let oldest = buffer.recent.front().map_or(u64::MAX, |record| record.sequence);
            for record in buffer.startup.iter().filter(|record| record.sequence < oldest) { self.write(record); }
            for record in &buffer.recent { self.write(record); }
        } else {
            self.file = None;
        }
        Ok(())
    }
}

pub(super) fn start(root: PathBuf, enabled: bool) -> std::io::Result<()> {
    let (sender, receiver) = mpsc::sync_channel(512);
    thread::Builder::new().name("app-log-writer".into()).spawn(move || {
        let mut buffer = Buffer::new();
        let mut output = Output { dir: root.join(super::LOG_DIR), enabled, file: None, last_written: 0 };
        while let Ok(request) = receiver.recv() {
            let dropped = DROPPED.swap(0, Ordering::Relaxed);
            if dropped != 0 {
                let body = format!("[startup] dropped reason=queue_full count={dropped}");
                if let Some(record) = buffer.push(&local_timestamp(), body, Instant::now(), false) { output.write(record); }
            }
            match request {
                Request::Event { body, at, startup } => {
                    if let Some(record) = buffer.push(&local_timestamp(), body, at, startup) { output.write(record); }
                }
                Request::SetEnabled(enabled, reply) => { let _ = reply.send(output.set_enabled(enabled, &root, &buffer)); }
                Request::Clear(reply) => {
                    output.file = None;
                    buffer.clear();
                    output.last_written = buffer.sequence;
                    let _ = reply.send(file::remove_all(&output.dir).map_err(|error| error.to_string()));
                }
            }
        }
    })?;
    let _ = QUEUE.set(sender);
    Ok(())
}

pub(super) fn event(body: String, category: Option<Category>) {
    let Some(queue) = QUEUE.get() else { return };
    let startup = matches!(category, Some(Category::Startup));
    let at = Instant::now();
    if queue.try_send(Request::Event { body, at, startup }).is_err() { DROPPED.fetch_add(1, Ordering::Relaxed); }
}

fn request<Value>(build: impl FnOnce(Sender<Value>) -> Request) -> Result<Value, String> {
    let (sender, receiver) = mpsc::channel();
    let queue = QUEUE.get().ok_or("Diagnostic writer unavailable")?;
    queue.send(build(sender)).map_err(|error| error.to_string())?;
    receiver.recv().map_err(|error| error.to_string())
}

pub(super) fn set_enabled(enabled: bool) -> Result<(), String> {
    request(|reply| Request::SetEnabled(enabled, reply))?
}

pub(super) fn clear() -> Result<(), String> {
    request(Request::Clear)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coalesces_short_repeats_and_attaches_count_to_the_next_event() {
        let mut buffer = Buffer::new();
        let now = Instant::now();
        assert!(buffer.push("time", "[island] mode".into(), now, false).is_some());
        assert!(buffer.push("time", "[island] mode".into(), now + Duration::from_secs(1), false).is_none());
        assert!(buffer.push("time", "[island] mode".into(), now + Duration::from_secs(2), false).is_none());
        assert!(buffer.snapshot().recent.contains("pending_repeat reason=snapshot repeated=2"));
        let next = buffer.push("time", "[island] drag".into(), now + Duration::from_secs(2), false).unwrap();
        assert_eq!(next.line, "time [island] drag repeated=2\n");
        assert!(buffer.push("time", "[island] drag".into(), now + Duration::from_secs(6), false).is_some());
    }

    #[test]
    fn coalesces_repeats_across_unrelated_events() {
        let mut buffer = Buffer::new();
        let now = Instant::now();
        buffer.push("time", "[window] geometry".into(), now, false);
        buffer.push("time", "[island] hover".into(), now, false);
        assert!(buffer.push("time", "[window] geometry".into(), now, false).is_none());
        let next = buffer.push("time", "[media] session".into(), now, false).unwrap();
        assert!(next.line.ends_with("repeated=1\n"));
    }

    #[test]
    fn caps_the_ring_without_evicting_the_startup_header() {
        let mut buffer = Buffer::new();
        let now = Instant::now();
        buffer.push("time", "[startup] version".into(), now, true);
        for index in 0..RING_LIMIT + 5 { buffer.push("time", format!("[island] entry={index}"), now, false); }
        assert_eq!(buffer.recent.len(), RING_LIMIT);
        let snapshot = buffer.snapshot();
        assert!(snapshot.recent.starts_with("time [island] entry=5\n"));
        assert_eq!(snapshot.startup, "time [startup] version\n");
    }
}
