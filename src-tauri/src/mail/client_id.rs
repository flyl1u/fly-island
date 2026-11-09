//! The RFC 2971 `ID` exchange that 163 and 126 (NetEase Coremail) require
//! before `SELECT INBOX`; without it they answer "Unsafe Login".
//!
//! imap 2.x cannot parse the `* ID (...)` reply and then panics on the
//! leftover tagged line, so the exchange runs directly on the TLS stream
//! while the session sits idle between commands. Ported from
//! flyl1u/fly-island#39 by ShengLin1001.

use imap::extensions::idle::SetReadTimeout;
use std::{
    io::{Read, Write},
    sync::{Arc, Mutex, MutexGuard},
    time::Duration,
};

/// Shares the TLS stream between the imap session and `send_client_id`.
#[derive(Debug)]
pub(super) struct SharedStream<T>(pub(super) Arc<Mutex<T>>);

impl<T> SharedStream<T> {
    fn lock(&self) -> std::io::Result<MutexGuard<'_, T>> {
        self.0
            .lock()
            .map_err(|_| std::io::Error::other("mail stream lock poisoned"))
    }
}

impl<T: Read> Read for SharedStream<T> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        self.lock()?.read(buffer)
    }
}

impl<T: Write> Write for SharedStream<T> {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        self.lock()?.write(buffer)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.lock()?.flush()
    }
}

impl<T: SetReadTimeout> SetReadTimeout for SharedStream<T> {
    fn set_read_timeout(&mut self, timeout: Option<Duration>) -> imap::Result<()> {
        self.0
            .lock()
            .map_err(|_| imap::Error::ConnectionLost)?
            .set_read_timeout(timeout)
    }
}

const ID_COMMAND: &[u8] =
    b"fly0 ID (\"name\" \"fly-island\" \"version\" \"1.0\" \"vendor\" \"fly-island\")\r\n";
/// Longest reply line accepted before giving up on a misbehaving server.
const MAX_LINE: usize = 8_192;

/// Sends `ID` and reads up to and including its own tagged reply. Callers drop
/// the connection on error, because a half-read reply would trip imap later.
pub(super) fn send_client_id<T: Read + Write>(stream: &Mutex<T>) -> std::io::Result<()> {
    let mut stream = stream
        .lock()
        .map_err(|_| std::io::Error::other("mail stream lock poisoned"))?;
    stream.write_all(ID_COMMAND)?;
    stream.flush()?;
    let mut line = Vec::new();
    let mut byte = [0u8; 1];
    // One byte at a time so nothing after our tagged reply is taken from the session.
    loop {
        if stream.read(&mut byte)? == 0 {
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        line.push(byte[0]);
        if byte[0] == b'\n' {
            if line.starts_with(b"fly0 ") {
                return Ok(());
            }
            line.clear();
        } else if line.len() > MAX_LINE {
            return Err(std::io::ErrorKind::InvalidData.into());
        }
    }
}
