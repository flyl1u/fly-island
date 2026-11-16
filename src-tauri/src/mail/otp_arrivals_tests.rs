use super::*;
use std::io::Cursor as IoCursor;
use std::sync::{Arc, Mutex};

#[derive(Default, Debug)]
struct Stream {
    input: IoCursor<Vec<u8>>,
    output: Arc<Mutex<Vec<u8>>>,
}
impl Read for Stream {
    fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
        self.input.read(bytes)
    }
}
impl Write for Stream {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.output.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
fn message(uid: u32) -> MailMessage {
    MailMessage {
        id: format!("7:{uid}"),
        uid,
        sender: "security@example.com".into(),
        subject: "Verification code".into(),
        received_at: None,
        unread: true,
        otp_code: None,
    }
}
fn previous() -> Option<Cursor> {
    Some(Cursor {
        validity: 7,
        high_water: 1,
    })
}

#[test]
fn initial_sync_old_mail_read_mail_and_rebuilt_mailboxes_are_not_arrivals() {
    let mut item = message(2);
    assert!(!is_arrival(&item, 7, None));
    assert!(!is_arrival(&item, 8, previous()));
    assert!(!is_arrival(&message(1), 7, previous()));
    assert!(is_arrival(&item, 7, previous()));
    item.unread = false;
    assert!(!is_arrival(&item, 7, previous()));
}

#[test]
fn subject_codes_need_no_body_request_and_newest_code_can_precede_an_ordinary_mail() {
    let mut items = vec![message(4), message(3), message(2), message(1)];
    items[0].subject = "Weekly news".into();
    items[0].sender = "news@example.com".into();
    items[1].subject = "Verification code: 834921".into();
    items[2].unread = false;
    let raw = "Content-Type: text/plain\r\n\r\nWeekly news";
    let script = format!("* OK ready\r\na1 OK login\r\n* 4 FETCH (UID 4 BODY[]<0> {{{}}}\r\n{raw})\r\na2 OK peek\r\n", raw.len());
    let mut client = imap::Client::new(Stream {
        input: IoCursor::new(script.into_bytes()),
        ..Stream::default()
    });
    client.read_greeting().unwrap();
    let mut session = client.login("test@example.com", "secret").unwrap();
    enrich(&mut session, &mut items, 7, previous()).unwrap();
    assert_eq!(items[1].otp_code.as_deref(), Some("834921"));
    assert!(items[0].otp_code.is_none());
    assert_eq!(newest_code(&items, 7, previous()).as_deref(), Some("7:3"));
}

#[test]
fn body_peeks_are_bounded_to_five_new_unread_messages_and_never_set_seen() {
    let mut script = "* OK ready\r\na1 OK login\r\n".to_string();
    let raw = "Content-Type: text/plain; charset=utf-8\r\n\r\nYour verification code: 834921";
    for (tag, uid) in [(2, 7), (3, 6), (4, 5), (5, 4), (6, 3)] {
        script.push_str(&format!(
            "* {uid} FETCH (UID {uid} BODY[]<0> {{{}}}\r\n{raw})\r\na{tag} OK peek\r\n",
            raw.len()
        ));
    }
    let output = Arc::new(Mutex::new(Vec::new()));
    let stream = Stream {
        input: IoCursor::new(script.into_bytes()),
        output: output.clone(),
    };
    let mut client = imap::Client::new(stream);
    client.read_greeting().unwrap();
    let mut session = client.login("test@example.com", "secret").unwrap();
    let mut items = vec![message(7), message(6), message(5), message(4), message(3), message(2)];
    enrich(&mut session, &mut items, 7, previous()).unwrap();
    assert!(items[..5]
        .iter()
        .all(|item| item.otp_code.as_deref() == Some("834921") && item.unread));
    assert!(items[5].otp_code.is_none());
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert_eq!(commands.matches(PEEK_QUERY).count(), 5);
    for forbidden in [" SELECT ", " STORE ", "\\Seen", " BODY[]"] {
        assert!(!commands.contains(forbidden), "{commands}");
    }
}

#[test]
fn initial_sync_peeks_only_recent_unread_mail() {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
    let raw = "Content-Type: text/plain\r\n\r\nYour code is 834921";
    let script = format!("* OK ready\r\na1 OK login\r\n* 3 FETCH (UID 3 BODY[]<0> {{{}}}\r\n{raw})\r\na2 OK peek\r\n", raw.len());
    let output = Arc::new(Mutex::new(Vec::new()));
    let mut client = imap::Client::new(Stream { input: IoCursor::new(script.into_bytes()), output: output.clone() });
    client.read_greeting().unwrap();
    let mut session = client.login("test@example.com", "secret").unwrap();
    let mut items = vec![message(3), message(2), message(1)];
    items[0].subject = "Notice".into();
    items[0].sender = "hello@example.com".into();
    items[0].received_at = Some(now);
    items[1].received_at = Some(now - MAX_INITIAL_AGE_MS - 1);
    items[2].received_at = Some(now);
    items[2].unread = false;
    enrich(&mut session, &mut items, 7, None).unwrap();
    assert_eq!(items[0].otp_code.as_deref(), Some("834921"));
    assert!(items[1..].iter().all(|item| item.otp_code.is_none()));
    assert_eq!(String::from_utf8(output.lock().unwrap().clone()).unwrap().matches(PEEK_QUERY).count(), 1);
    assert_eq!(newest_code(&items, 7, None), None);
}

#[test]
fn decodes_mime_transfer_encoding_and_html_emphasis_without_fetching_attachments() {
    let raw = b"Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\nVmVyaWZpY2F0aW9uIGNvZGU6IDgzNDkyMQ==";
    assert_eq!(code_from_mime("", raw).as_deref(), Some("834921"));
    let raw = b"Content-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: text/html\r\n\r\n<p>Please sign in.</p><b>834921</b>\r\n--x\r\nContent-Type: text/plain; name=code.txt\r\nContent-Disposition: attachment; filename=code.txt\r\n\r\nVerification code: 999999\r\n--x--";
    assert_eq!(
        code_from_mime("Verification code", raw).as_deref(),
        Some("834921")
    );
    assert_eq!(code_from_mime("", b"Content-Type: text/html\r\n\r\n<div hidden>Verification code: 999999</div><p>Weekly news</p>"), None);
}
