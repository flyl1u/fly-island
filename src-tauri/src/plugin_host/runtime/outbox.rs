//! Messages to a plugin go through a bounded queue that one thread writes to
//! the plugin's stdin. Writing to a pipe blocks once the plugin stops reading;
//! with the queue only that thread waits, never the caller (which may hold the
//! host's locks). A plugin that lets the queue fill up is not reading its input.

use std::{
    io::Write,
    process::ChildStdin,
    sync::mpsc::{sync_channel, SyncSender, TrySendError},
    thread,
};

/// Messages waiting for the plugin; more than this means it stopped reading.
pub(super) const CAPACITY: usize = 512;

pub(super) struct Outbox {
    sender: SyncSender<String>,
}

pub(super) enum SendError {
    /// The plugin is not running (or its input is closed).
    Closed,
    /// The plugin has not read its last `CAPACITY` messages.
    Full,
}

impl Outbox {
    /// Starts the writer thread. Dropping the outbox closes stdin once the
    /// queued messages are written (or writing fails because the process ended).
    pub fn new(mut stdin: ChildStdin) -> Result<Self, String> {
        let (sender, receiver) = sync_channel::<String>(CAPACITY);
        thread::Builder::new()
            .name("plugin-stdin".into())
            .spawn(move || {
                for line in receiver {
                    let written = stdin
                        .write_all(line.as_bytes())
                        .and_then(|()| stdin.write_all(b"\n"))
                        .and_then(|()| stdin.flush());
                    if written.is_err() {
                        break;
                    }
                }
            })
            .map_err(|error| format!("Could not start the plugin input thread: {error}"))?;
        Ok(Self { sender })
    }

    pub fn send(&self, line: String) -> Result<(), SendError> {
        self.sender.try_send(line).map_err(|error| match error {
            TrySendError::Full(_) => SendError::Full,
            TrySendError::Disconnected(_) => SendError::Closed,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        os::windows::process::CommandExt,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };

    #[test]
    fn a_process_that_never_reads_fills_the_queue_without_blocking_the_sender() {
        // ping waits ~20 s and never reads stdin.
        let mut child = Command::new("ping")
            .args(["-n", "20", "127.0.0.1"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .creation_flags(crate::system::CREATE_NO_WINDOW)
            .spawn()
            .expect("ping starts");
        let outbox = Outbox::new(child.stdin.take().expect("stdin")).expect("outbox");
        let line = "x".repeat(64 * 1024);
        let started = Instant::now();
        let mut full = false;
        for _ in 0..CAPACITY * 4 {
            match outbox.send(line.clone()) {
                Ok(()) => {}
                Err(SendError::Full) => {
                    full = true;
                    break;
                }
                Err(SendError::Closed) => panic!("the writer ended early"),
            }
        }
        let _ = child.kill();
        let _ = child.wait();
        assert!(full, "the queue never filled");
        assert!(started.elapsed() < Duration::from_secs(5), "sending blocked");
    }
}
