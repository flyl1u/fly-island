//! IMAP connection, IDLE waiting, inbox sync and header parsing.

use imap::{
    extensions::idle::{SetReadTimeout, WaitOutcome},
    types::{Fetch, Flag, UnsolicitedResponse},
    Session,
};
use imap_proto::types::StatusAttribute;
use mailparse::MailHeaderMap;
use std::{
    io::{Read, Write},
    net::{Shutdown, TcpStream, ToSocketAddrs},
    sync::{mpsc, Mutex},
    time::Duration,
};

use super::*;

pub(super) const HOST: &str = "imap.qq.com";

pub(super) const MAX_ITEMS: u32 = 20;

pub(super) const IO_TIMEOUT: Duration = Duration::from_secs(15);

pub(super) const HEADER_QUERY: &str = "(UID FLAGS INTERNALDATE BODY.PEEK[HEADER]<0.65536>)";

pub(super) const FLAGS_QUERY: &str = "(UID FLAGS INTERNALDATE)";

#[derive(Clone, Copy)]
pub(super) struct Cursor {
    pub(super) validity: u32,
    pub(super) high_water: u32,
}

#[derive(Clone)]
pub(super) struct Inbox {
    pub(super) cursor: Cursor,
    pub(super) unread_count: usize,
    pub(super) items: Vec<MailMessage>,
    pub(super) needs_refresh: bool,
}

#[derive(Debug)]
pub(super) struct MailFailure {
    pub(super) authentication: bool,
    pub(super) message: &'static str,
}

impl MailFailure {
    pub(super) fn network() -> Self {
        Self {
            authentication: false,
            message: "无法同步 QQ 邮箱，请检查网络或稍后重试。",
        }
    }

    pub(super) fn authentication() -> Self {
        Self {
            authentication: true,
            message: "QQ 邮箱拒绝了连接，请确认已开启 IMAP，并重新输入邮箱授权码。",
        }
    }
}

#[derive(Debug)]
pub(super) struct BoundedStream<T>(pub(super) T);

impl<T: Read> Read for BoundedStream<T> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        self.0.read(buffer)
    }
}

impl<T: Write> Write for BoundedStream<T> {
    fn write(&mut self, buffer: &[u8]) -> std::io::Result<usize> {
        self.0.write(buffer)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.0.flush()
    }
}

impl<T: SetReadTimeout> SetReadTimeout for BoundedStream<T> {
    fn set_read_timeout(&mut self, timeout: Option<Duration>) -> imap::Result<()> {
        // imap 2.4 clears the timeout before IDLE's DONE response is read.
        // Keep that response bounded too, including after a dropped connection.
        self.0.set_read_timeout(Some(timeout.unwrap_or(IO_TIMEOUT)))
    }
}

type MailSession = Session<BoundedStream<native_tls::TlsStream<TcpStream>>>;

pub(super) enum MailWake {
    Work(Work),
    Changed,
    TimedOut,
    Failed(imap::Error),
    Closed,
}

pub(super) fn queued_work(receiver: &mpsc::Receiver<Work>) -> Option<MailWake> {
    match receiver.try_recv() {
        Ok(work) => Some(MailWake::Work(work)),
        Err(mpsc::TryRecvError::Disconnected) => Some(MailWake::Closed),
        Err(mpsc::TryRecvError::Empty) => None,
    }
}

pub(super) fn interrupt_idle(socket: &Mutex<Option<TcpStream>>) {
    if let Ok(socket) = socket.lock() {
        if let Some(socket) = socket.as_ref() {
            let _ = socket.shutdown(Shutdown::Both);
        }
    }
}

pub(super) fn wait_for_mail<T: Read + Write + SetReadTimeout>(
    session: &mut Session<T>,
    socket: &TcpStream,
    interrupt: &Mutex<Option<TcpStream>>,
    receiver: &mpsc::Receiver<Work>,
    timeout: Duration,
) -> MailWake {
    let cloned = match socket.try_clone() {
        Ok(socket) => socket,
        Err(error) => return MailWake::Failed(imap::Error::Io(error)),
    };
    let Ok(mut registered) = interrupt.lock() else {
        return MailWake::Closed;
    };
    *registered = Some(cloned);
    drop(registered);
    // Register before checking the queue: a command arriving at either side of
    // this check must interrupt IDLE rather than wait for its keepalive deadline.
    let result = if let Some(work) = queued_work(receiver) {
        work
    } else {
        match session
            .idle()
            .and_then(|idle| idle.wait_with_timeout(timeout))
        {
            Ok(WaitOutcome::MailboxChanged) => MailWake::Changed,
            Ok(WaitOutcome::TimedOut) => MailWake::TimedOut,
            Err(error) => MailWake::Failed(error),
        }
    };
    if let Ok(mut registered) = interrupt.lock() {
        *registered = None;
    }
    // A deliberate socket interruption is a queued user action, not a network
    // error. Process it before considering any server response.
    match result {
        MailWake::Work(_) | MailWake::Closed => result,
        _ => queued_work(receiver).unwrap_or(result),
    }
}

#[derive(Default)]
pub(super) struct SyncConnection {
    pub(super) generation: u64,
    pub(super) session: Option<MailSession>,
    pub(super) socket: Option<TcpStream>,
    pub(super) cached: Option<Inbox>,
    pub(super) idle_supported: bool,
    pub(super) idle_rejected: bool,
}

impl SyncConnection {
    pub(super) fn reset(&mut self, generation: u64) {
        if self.generation != generation {
            *self = Self::default();
            self.generation = generation;
        }
    }

    pub(super) fn fetch(
        &mut self,
        email: &str,
        secret: Option<&str>,
    ) -> Result<Inbox, MailFailure> {
        // Only a failed connection needs another TLS handshake, login and credential lookup.
        if let Some(session) = &mut self.session {
            if let Ok(inbox) = fetch_inbox_cached(session, self.cached.as_ref()) {
                self.cached = Some(inbox.clone());
                return Ok(inbox);
            }
            self.session = None;
            self.socket = None;
        }
        let stored_secret;
        let secret = match secret {
            Some(secret) => secret,
            None => {
                stored_secret = read_secret(email).map_err(|_| MailFailure {
                    authentication: true,
                    message: "无法读取 Windows 邮箱凭据，请重新连接。",
                })?;
                stored_secret
                    .as_deref()
                    .ok_or_else(MailFailure::authentication)?
            }
        };
        let (mut session, socket) = open_connection(email, secret)?;
        self.idle_supported = session
            .capabilities()
            .map_err(|_| MailFailure::network())?
            .has_str("IDLE")
            && !self.idle_rejected;
        let inbox = fetch_inbox_cached(&mut session, self.cached.as_ref())?;
        self.cached = Some(inbox.clone());
        self.session = Some(session);
        self.socket = Some(socket);
        Ok(inbox)
    }
}

pub(super) fn login_failure(error: imap::Error) -> MailFailure {
    match error {
        imap::Error::No(_) | imap::Error::Bad(_) => MailFailure::authentication(),
        _ => MailFailure::network(),
    }
}

pub(super) fn open_session(email: &str, secret: &str) -> Result<MailSession, MailFailure> {
    open_connection(email, secret).map(|(session, _)| session)
}

pub(super) fn open_connection(
    email: &str,
    secret: &str,
) -> Result<(MailSession, TcpStream), MailFailure> {
    let mut stream = None;
    let addresses = (HOST, 993)
        .to_socket_addrs()
        .map_err(|_| MailFailure::network())?;
    for address in addresses {
        if let Ok(connected) = TcpStream::connect_timeout(&address, Duration::from_secs(10)) {
            stream = Some(connected);
            break;
        }
    }
    let stream = stream.ok_or_else(MailFailure::network)?;
    stream
        .set_read_timeout(Some(IO_TIMEOUT))
        .map_err(|_| MailFailure::network())?;
    stream
        .set_write_timeout(Some(IO_TIMEOUT))
        .map_err(|_| MailFailure::network())?;
    let interrupt = stream.try_clone().map_err(|_| MailFailure::network())?;
    let tls = native_tls::TlsConnector::new().map_err(|_| MailFailure::network())?;
    let stream = tls
        .connect(HOST, stream)
        .map_err(|_| MailFailure::network())?;
    let mut client = imap::Client::new(BoundedStream(stream));
    client.read_greeting().map_err(|_| MailFailure::network())?;
    client
        .login(email, secret)
        .map(|session| (session, interrupt))
        .map_err(|(error, _)| login_failure(error))
}

#[cfg(test)]
pub(super) fn fetch_inbox<T: Read + Write>(session: &mut Session<T>) -> Result<Inbox, MailFailure> {
    fetch_inbox_cached(session, None)
}

pub(super) fn header_message(message: &Fetch, validity: u32) -> Option<MailMessage> {
    let uid = message.uid?;
    let (sender, subject) = parse_header(message.header()?);
    Some(MailMessage {
        id: format!("{validity}:{uid}"),
        uid,
        sender,
        subject,
        received_at: message.internal_date().map(|date| date.timestamp_millis()),
        unread: !message.flags().contains(&Flag::Seen),
    })
}

pub(super) fn drain_mail_updates<T: Read + Write>(
    session: &Session<T>,
    exists: u32,
    unread: &mut Option<usize>,
    needs_refresh: &mut bool,
) {
    for response in session.unsolicited_responses.try_iter() {
        match response {
            UnsolicitedResponse::Status {
                mailbox,
                attributes,
            } if mailbox.eq_ignore_ascii_case("INBOX") => {
                if let Some(count) = attributes
                    .into_iter()
                    .find_map(|attribute| match attribute {
                        StatusAttribute::Unseen(count) => Some(count as usize),
                        _ => None,
                    })
                {
                    *unread = Some(count);
                }
            }
            UnsolicitedResponse::Exists(count) if count != exists => *needs_refresh = true,
            UnsolicitedResponse::Expunge(_) => *needs_refresh = true,
            _ => {}
        }
    }
}

pub(super) fn fetch_inbox_cached<T: Read + Write>(
    session: &mut Session<T>,
    cached: Option<&Inbox>,
) -> Result<Inbox, MailFailure> {
    let mailbox = session
        .examine("INBOX")
        .map_err(|_| MailFailure::network())?;
    let validity = mailbox
        .uid_validity
        .filter(|value| *value > 0)
        .ok_or_else(MailFailure::network)?;
    // STATUS returns the total without enumerating every unread UID in a large inbox.
    for _ in session.unsolicited_responses.try_iter() {}
    session
        .status("INBOX", "(UNSEEN)")
        .map_err(|_| MailFailure::network())?;
    // imap 2.4 forwards STATUS attributes to this channel rather than returning
    // them in Mailbox.unseen (which has different semantics for EXAMINE).
    let mut unread_count = None;
    let mut needs_refresh = false;
    drain_mail_updates(
        session,
        mailbox.exists,
        &mut unread_count,
        &mut needs_refresh,
    );
    let mut items = Vec::new();
    if mailbox.exists > 0 {
        let first = mailbox.exists.saturating_sub(MAX_ITEMS - 1).max(1);
        let cached = cached.filter(|previous| previous.cursor.validity == validity);
        if let Some(cached) = cached {
            let mut missing = Vec::new();
            let messages = session
                .fetch(format!("{first}:{}", mailbox.exists), FLAGS_QUERY)
                .map_err(|_| MailFailure::network())?;
            for message in messages
                .iter()
                .filter(|message| (first..=mailbox.exists).contains(&message.message))
            {
                let Some(uid) = message.uid else {
                    continue;
                };
                if let Some(previous) = cached.items.iter().find(|item| item.uid == uid) {
                    let mut item = previous.clone();
                    item.unread = !message.flags().contains(&Flag::Seen);
                    item.received_at = message
                        .internal_date()
                        .map(|date| date.timestamp_millis())
                        .or(item.received_at);
                    items.push(item);
                } else if !missing.contains(&uid) {
                    missing.push(uid);
                }
            }
            if !missing.is_empty() {
                let sequence = missing
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(",");
                let messages = session
                    .uid_fetch(sequence, HEADER_QUERY)
                    .map_err(|_| MailFailure::network())?;
                for message in messages.iter() {
                    if let Some(item) = header_message(message, validity) {
                        if missing.contains(&item.uid)
                            && !items.iter().any(|old| old.uid == item.uid)
                        {
                            items.push(item);
                        }
                    }
                }
                if missing
                    .iter()
                    .any(|uid| !items.iter().any(|item| item.uid == *uid))
                {
                    return Err(MailFailure::network());
                }
            }
        } else {
            let messages = session
                .fetch(format!("{first}:{}", mailbox.exists), HEADER_QUERY)
                .map_err(|_| MailFailure::network())?;
            for message in messages
                .iter()
                .filter(|message| (first..=mailbox.exists).contains(&message.message))
            {
                if let Some(item) = header_message(message, validity) {
                    items.push(item);
                }
            }
        }
    }
    items.sort_by_key(|item| std::cmp::Reverse(item.uid));
    items.dedup_by_key(|item| item.uid);
    items.truncate(MAX_ITEMS as usize);
    let expected = mailbox.exists.min(MAX_ITEMS) as usize;
    if items.len() != expected {
        return Err(MailFailure::network());
    }
    // UIDNEXT can advance while this snapshot is being fetched. Acknowledge
    // only headers actually received, or the next arrival's preview can be lost.
    let high_water = items.iter().map(|item| item.uid).max().unwrap_or(0);
    drain_mail_updates(
        session,
        mailbox.exists,
        &mut unread_count,
        &mut needs_refresh,
    );
    Ok(Inbox {
        cursor: Cursor {
            validity,
            high_water,
        },
        unread_count: unread_count.ok_or_else(MailFailure::network)?,
        items,
        needs_refresh,
    })
}

pub(super) fn parse_header(raw: &[u8]) -> (String, String) {
    let headers = mailparse::parse_headers(raw)
        .map(|(headers, _)| headers)
        .unwrap_or_default();
    let sender = headers.get_first_value("From").unwrap_or_default();
    let subject = headers.get_first_value("Subject").unwrap_or_default();
    (
        display_header(&sender, "未知发件人"),
        display_header(&subject, "（无主题）"),
    )
}

pub(super) fn display_header(value: &str, fallback: &str) -> String {
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value.is_empty() {
        fallback.into()
    } else {
        value.chars().take(1_000).collect()
    }
}
