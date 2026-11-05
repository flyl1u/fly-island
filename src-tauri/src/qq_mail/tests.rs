use super::content::{
    cid_references, fetch_content, parse_message_id, replace_cid_references, MAX_BODY_BYTES,
};
use super::client_id::send_client_id;
use super::credentials::{imap_host, normalize_email, resolve_host};
use super::service::{retry_delay, MailState, Work, PUSH_REFRESH_INTERVAL};
use super::session::{
    display_header, fetch_inbox, fetch_inbox_cached, interrupt_idle, login_failure, parse_header,
    wait_for_mail, BoundedStream, Cursor, Inbox, MailFailure, MailWake, FLAGS_QUERY, HEADER_QUERY,
    IO_TIMEOUT,
};
use super::*;
use imap::{extensions::idle::SetReadTimeout, Session};
use std::io::Cursor as IoCursor;
use std::{
    io::{Read, Write},
    net::TcpStream,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::Duration,
};

fn inbox(validity: u32, uids: &[u32]) -> Inbox {
    Inbox {
        needs_refresh: false,
        cursor: Cursor {
            validity,
            high_water: uids.iter().copied().max().unwrap_or(0),
        },
        unread_count: uids.len(),
        items: uids
            .iter()
            .map(|uid| MailMessage {
                id: format!("{validity}:{uid}"),
                uid: *uid,
                sender: "sender@example.com".into(),
                subject: "主题".into(),
                received_at: None,
                unread: true,
            })
            .collect(),
    }
}

fn active_state() -> MailState {
    MailState {
        snapshot: MailSnapshot {
            enabled: true,
            configured: true,
            ..MailSnapshot::default()
        },
        ..MailState::default()
    }
}

#[test]
fn validates_addresses_and_rejects_commands_or_malformed_domains() {
    assert_eq!(normalize_email(" User@QQ.COM ").unwrap(), "user@qq.com");
    assert_eq!(normalize_email("x@163.com").unwrap(), "x@163.com");
    assert_eq!(normalize_email("a.b@example.edu.cn").unwrap(), "a.b@example.edu.cn");
    for email in [
        "",
        "@qq.com",
        "a@",
        "a@qq",
        "a@qq..com",
        "a@-qq.com",
        "a@b@qq.com",
        "a b@qq.com",
        "a\r\nLOGIN@qq.com",
        "a@qq.com\r\nx",
    ] {
        assert!(normalize_email(email).is_err(), "{email:?}");
    }
}

#[test]
fn the_imap_host_follows_the_address_domain() {
    assert_eq!(imap_host("x@qq.com"), "imap.qq.com");
    assert_eq!(imap_host("x@163.com"), "imap.163.com");
    assert_eq!(imap_host("x@mail.example.edu.cn"), "imap.mail.example.edu.cn");
}

#[test]
fn a_typed_imap_host_must_be_a_bare_domain() {
    assert_eq!(resolve_host("x@163.com", None).unwrap(), "imap.163.com");
    assert_eq!(resolve_host("x@example.edu.cn", Some(" ")).unwrap(), "imap.example.edu.cn");
    assert_eq!(resolve_host("x@foxmail.com", Some("IMAP.QQ.COM")).unwrap(), "imap.qq.com");
    for host in ["imap.qq.com:993", "imap.qq.com/x", "imaps://imap.qq.com", "localhost", "a b.com"] {
        assert!(resolve_host("x@qq.com", Some(host)).is_err(), "{host:?}");
    }
}

#[test]
fn revisions_keep_rising_across_mailboxes() {
    let mut first = MailState::default();
    let mut second = MailState::default();
    let a = first.changed().revision;
    let b = second.changed().revision;
    let c = first.changed().revision;
    assert!(a < b && b < c);
}

#[test]
fn client_id_consumes_only_its_own_reply() {
    let input = b"* ID (\"name\" \"Coremail Imap\")\r\nfly0 OK ID completed\r\na2 OK next\r\n".to_vec();
    let output = Arc::new(Mutex::new(Vec::new()));
    let stream = Mutex::new(ScriptedStream {
        input: IoCursor::new(input),
        output: output.clone(),
    });
    send_client_id(&stream).unwrap();
    assert!(String::from_utf8_lossy(&output.lock().unwrap()).starts_with("fly0 ID (\"name\" \"fly-island\""));
    let mut rest = String::new();
    stream.into_inner().unwrap().input.read_to_string(&mut rest).unwrap();
    assert_eq!(rest, "a2 OK next\r\n");

    let silent = Mutex::new(ScriptedStream {
        input: IoCursor::new(b"* ID NIL\r\n".to_vec()),
        output: Arc::new(Mutex::new(Vec::new())),
    });
    assert!(send_client_id(&silent).is_err());
}

#[test]
fn decodes_chinese_mime_headers_and_handles_empty_subjects() {
    let (sender, subject) = parse_header(
        b"From: =?UTF-8?B?5byg5LiJ?= <sender@example.com>\r\nSubject: =?UTF-8?B?5Lya6K6u?=\r\n\r\n",
    );
    assert!(sender.contains("张三"));
    assert_eq!(subject, "会议");
    assert_eq!(
        parse_header(b"Subject: =?GB2312?B?1tDOxA==?=\r\n\r\n").1,
        "中文"
    );
    assert_eq!(parse_header(b"\r\n").1, "（无主题）");
    assert_eq!(display_header("line\r\n two", ""), "line two");
}

#[test]
fn inlines_only_images_referenced_by_cid() {
    let html = r#"<img src="cid:img001@qq"><img src='cid:IMG002@QQ'>正文提到 cid: 但没有编号。"#;
    assert_eq!(cid_references(html), vec!["img001@qq", "IMG002@QQ"]);
    assert!(cid_references("<p>no images here</p>").is_empty());
    let png = "data:image/png;base64,AA".to_string();
    assert_eq!(
        replace_cid_references("a CID:x b cid:X c", &[("x".into(), png.clone())]),
        format!("a {png} b {png} c")
    );
    assert_eq!(
        replace_cid_references("中文 cid:x", &[("x".into(), "图".into())]),
        "中文 图"
    );
    // cid:image1 不能吃掉 cid:image10 的前缀
    assert_eq!(
        replace_cid_references(
            r#"<img src="cid:image10"><img src="cid:image1">"#,
            &[("image1".into(), png.clone())]
        ),
        format!(r#"<img src="cid:image10"><img src="{png}">"#)
    );
    // 整个 cid:token 都要换掉，不能留下 "cid:data:image/..." 这种无效地址
    assert_eq!(
        replace_cid_references(r#"<img src="cid:x">"#, &[("x".into(), png.clone())]),
        format!(r#"<img src="{png}">"#)
    );
}

#[test]
fn first_sync_and_uid_validity_reset_do_not_replay_history() {
    let mut state = active_state();
    assert!(state.accept(0, inbox(1, &[1, 2])).unwrap().1.is_none());
    assert!(state.accept(0, inbox(1, &[1, 2])).unwrap().1.is_none());
    assert_eq!(
        state.accept(0, inbox(1, &[1, 2, 3])).unwrap().1.as_deref(),
        Some("1:3")
    );
    assert!(state.accept(0, inbox(2, &[10, 11])).unwrap().1.is_none());
    state.invalidate();
    assert!(state
        .accept(1, inbox(2, &[10, 11, 12]))
        .unwrap()
        .1
        .is_none());
}

#[test]
fn old_or_read_messages_are_not_new_arrivals() {
    let mut state = active_state();
    state.accept(0, inbox(1, &[40]));
    assert!(state.accept(0, inbox(1, &[39])).unwrap().1.is_none());
    let mut read = inbox(1, &[41]);
    read.items[0].unread = false;
    assert!(state.accept(0, read).unwrap().1.is_none());
    assert!(state.accept(0, inbox(1, &[41])).unwrap().1.is_none());
}

#[test]
fn disconnect_invalidates_inflight_success_and_failure() {
    let mut state = active_state();
    state.invalidate();
    state.snapshot = MailSnapshot::default();
    assert!(state.accept(0, inbox(1, &[1])).is_none());
    assert!(state.fail(0, &MailFailure::network()).is_none());
    assert_eq!(state.snapshot.status, MailStatus::Disconnected);
    assert!(state.snapshot.items.is_empty());
}

#[test]
fn network_errors_keep_data_and_authentication_errors_stop_retries() {
    let mut state = active_state();
    state.accept(0, inbox(1, &[1]));
    state.fail(0, &MailFailure::network());
    assert_eq!(state.snapshot.unread_count, Some(1));
    assert_eq!(state.snapshot.items.len(), 1);
    assert!(state.next_check.is_some());
    state.fail(0, &MailFailure::authentication());
    assert_eq!(state.snapshot.status, MailStatus::AuthRequired);
    assert!(state.next_check.is_none());
    assert_eq!(retry_delay(1).as_secs(), 5);
    assert_eq!(retry_delay(2).as_secs(), 15);
    assert_eq!(retry_delay(10).as_secs(), 300);
}

#[derive(Debug)]
struct ScriptedStream {
    input: IoCursor<Vec<u8>>,
    output: Arc<Mutex<Vec<u8>>>,
}
impl Read for ScriptedStream {
    fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
        self.input.read(bytes)
    }
}
impl Write for ScriptedStream {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.output.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
impl SetReadTimeout for ScriptedStream {
    fn set_read_timeout(&mut self, _: Option<Duration>) -> imap::Result<()> {
        Ok(())
    }
}

fn client(script: String) -> (imap::Client<ScriptedStream>, Arc<Mutex<Vec<u8>>>) {
    let output = Arc::new(Mutex::new(Vec::new()));
    let mut client = imap::Client::new(ScriptedStream {
        input: IoCursor::new(script.into_bytes()),
        output: output.clone(),
    });
    client.read_greeting().unwrap();
    (client, output)
}

#[test]
fn server_authentication_rejection_is_actionable_and_redacted() {
    let (client, _) = client("* OK ready\r\na1 NO invalid password\r\n".into());
    let (error, _) = client.login("user@qq.com", "test-secret").err().unwrap();
    let failure = login_failure(error);
    assert!(failure.authentication);
    assert!(!failure.message.contains("test-secret"));
}

#[test]
fn reads_only_headers_and_counts_all_unread_not_just_recent_twenty() {
    let mut script = "* OK ready\r\na1 OK login\r\n* 25 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 26] next\r\na2 OK [READ-ONLY] examined\r\n* STATUS \"INBOX\" (UNSEEN 25)\r\na3 OK status\r\n".to_string();
    let header = "From: sender@example.com\r\nSubject: Update\r\n\r\n";
    for uid in 6..=25 {
        script.push_str(&format!("* {uid} FETCH (UID {uid} FLAGS () INTERNALDATE \"19-Oct-2026 08:00:00 +0800\" BODY[HEADER]<0> {{{}}}\r\n{header})\r\n", header.len()));
    }
    script.push_str("a4 OK fetch\r\n");
    let (client, output) = client(script);
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let inbox = fetch_inbox(&mut session).unwrap();
    assert_eq!(inbox.unread_count, 25);
    assert_eq!(inbox.items.len(), 20);
    assert_eq!(inbox.items[0].id, "7:25");
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert!(commands.contains("EXAMINE \"INBOX\""));
    assert!(commands.contains("STATUS \"INBOX\" (UNSEEN)"));
    assert!(commands.contains(HEADER_QUERY));
    for forbidden in [" SELECT ", " STORE ", " EXPUNGE", "BODY[]", "BODY[TEXT]"] {
        assert!(!commands.contains(forbidden));
    }
}

#[test]
fn empty_mailbox_is_a_successful_zero_unread_snapshot() {
    let (client, _) = client("* OK ready\r\na1 OK login\r\n* 0 EXISTS\r\n* 0 RECENT\r\n* OK [UIDVALIDITY 1] valid\r\n* OK [UIDNEXT 1] next\r\na2 OK [READ-ONLY] examined\r\n* STATUS \"INBOX\" (UNSEEN 0)\r\na3 OK status\r\n".into());
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let inbox = fetch_inbox(&mut session).unwrap();
    assert_eq!(inbox.unread_count, 0);
    assert!(inbox.items.is_empty());
}

#[test]
fn a_reused_session_detects_new_mail_without_another_login() {
    let header = "From: sender@example.com\r\nSubject: New arrival\r\n\r\n";
    let script = format!(
        "* OK ready\r\na1 OK login\r\n* 0 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 1] next\r\na2 OK [READ-ONLY] examined\r\n* STATUS \"INBOX\" (UNSEEN 0)\r\na3 OK status\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 2] next\r\na4 OK [READ-ONLY] examined\r\n* STATUS \"INBOX\" (UNSEEN 1)\r\na5 OK status\r\n* 1 FETCH (UID 1 FLAGS () BODY[HEADER]<0> {{{}}}\r\n{header})\r\na6 OK fetch\r\n",
        header.len()
    );
    let (client, output) = client(script);
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let mut state = active_state();
    let initial = fetch_inbox(&mut session).unwrap();
    assert!(state.accept(0, initial).unwrap().1.is_none());
    assert!(
        state
            .next_check
            .unwrap()
            .saturating_duration_since(Instant::now())
            <= Duration::from_secs(5)
    );
    let arrival = fetch_inbox(&mut session).unwrap();
    assert_eq!(arrival.items[0].subject, "New arrival");
    assert_eq!(state.accept(0, arrival).unwrap().1.as_deref(), Some("7:1"));
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert_eq!(commands.matches("LOGIN").count(), 1);
    assert_eq!(commands.matches("EXAMINE").count(), 2);
}

#[test]
fn cached_sync_updates_flags_without_downloading_headers_again() {
    let (client, output) = client("* OK ready\r\na1 OK login\r\n* 2 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 3] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 1)\r\na3 OK status\r\n* 1 FETCH (UID 1 FLAGS (\\Seen))\r\n* 2 FETCH (UID 2 FLAGS ())\r\na4 OK flags\r\n".into());
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let cached = inbox(7, &[1, 2]);
    let next = fetch_inbox_cached(&mut session, Some(&cached)).unwrap();
    assert_eq!(next.unread_count, 1);
    assert!(!next.items.iter().find(|item| item.uid == 1).unwrap().unread);
    assert_eq!(next.items[0].subject, "主题");
    assert!(!next.needs_refresh);
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert!(commands.contains(FLAGS_QUERY));
    assert!(!commands.contains("BODY"));
    assert!(!commands.contains("SEARCH"));
}

#[test]
fn a_new_arrival_downloads_only_its_header_and_preserves_cached_titles() {
    let header = "From: new@example.com\r\nSubject: New arrival\r\n\r\n";
    let script = format!("* OK ready\r\na1 OK login\r\n* 3 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 4] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 2)\r\na3 OK status\r\n* 1 FETCH (UID 1 FLAGS (\\Seen))\r\n* 2 FETCH (UID 2 FLAGS ())\r\n* 3 FETCH (UID 3 FLAGS ())\r\na4 OK flags\r\n* 3 FETCH (UID 3 FLAGS () BODY[HEADER]<0> {{{}}}\r\n{header})\r\na5 OK header\r\n", header.len());
    let (client, output) = client(script);
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let cached = inbox(7, &[1, 2]);
    let next = fetch_inbox_cached(&mut session, Some(&cached)).unwrap();
    assert_eq!(next.items[0].subject, "New arrival");
    assert_eq!(next.items[1].subject, "主题");
    assert_eq!(next.unread_count, 2);
    let mut state = active_state();
    state.accept(0, cached);
    assert_eq!(state.accept(0, next).unwrap().1.as_deref(), Some("7:3"));
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert!(commands.contains("UID FETCH 3 (UID FLAGS INTERNALDATE BODY.PEEK[HEADER]"));
    assert_eq!(commands.matches("BODY.PEEK").count(), 1);
}

#[test]
fn rebuilt_mailboxes_do_not_reuse_headers_from_the_old_uid_validity() {
    let header = "Subject: Replacement\r\n\r\n";
    let script = format!("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 8] valid\r\n* OK [UIDNEXT 2] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 1)\r\na3 OK status\r\n* 1 FETCH (UID 1 FLAGS () BODY[HEADER]<0> {{{}}}\r\n{header})\r\na4 OK header\r\n", header.len());
    let (client, _) = client(script);
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let cached = inbox(7, &[1]);
    let next = fetch_inbox_cached(&mut session, Some(&cached)).unwrap();
    assert_eq!(next.items[0].id, "8:1");
    assert_eq!(next.items[0].subject, "Replacement");
    let mut state = active_state();
    state.accept(0, cached);
    assert!(state.accept(0, next).unwrap().1.is_none());
}

#[test]
fn arrivals_during_sync_request_an_immediate_followup_before_idling() {
    let (client, _) = client("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 3] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 2)\r\na3 OK status\r\n* 2 EXISTS\r\n* 1 FETCH (UID 1 FLAGS ())\r\na4 OK flags\r\n".into());
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let cached = inbox(7, &[1]);
    let next = fetch_inbox_cached(&mut session, Some(&cached)).unwrap();
    assert!(next.needs_refresh);
    assert_eq!(next.cursor.high_water, 1);
    let mut state = active_state();
    state.accept(0, cached);
    state.accept(0, next);
    assert_eq!(
        state.accept(0, inbox(7, &[1, 2])).unwrap().1.as_deref(),
        Some("7:2")
    );
}

#[test]
fn missing_new_headers_cannot_silently_advance_the_notification_cursor() {
    let (client, _) = client("* OK ready\r\na1 OK login\r\n* 2 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\n* OK [UIDNEXT 3] next\r\na2 OK examined\r\n* STATUS INBOX (UNSEEN 2)\r\na3 OK status\r\n* 1 FETCH (UID 1 FLAGS ())\r\n* 2 FETCH (UID 2 FLAGS ())\r\na4 OK flags\r\na5 OK header\r\n".into());
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let cached = inbox(7, &[1]);
    assert!(fetch_inbox_cached(&mut session, Some(&cached)).is_err());
    assert_eq!(cached.cursor.high_water, 1);
}

fn socket_pair() -> (TcpStream, TcpStream) {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let client = TcpStream::connect(listener.local_addr().unwrap()).unwrap();
    (client, listener.accept().unwrap().0)
}

#[test]
fn queued_refreshes_are_not_dropped_or_blocked_by_idle() {
    let (client, output) = client("* OK ready\r\na1 OK login\r\n".into());
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let (socket, _peer) = socket_pair();
    let gate = Mutex::new(None);
    let (sender, receiver) = mpsc::channel();
    let (reply, _) = mpsc::channel();
    for generation in [1, 2] {
        sender
            .send(Work::Refresh {
                generation,
                reply: reply.clone(),
            })
            .unwrap();
    }
    let wake = wait_for_mail(
        &mut session,
        &socket,
        &gate,
        &receiver,
        PUSH_REFRESH_INTERVAL,
    );
    assert!(matches!(
        wake,
        MailWake::Work(Work::Refresh { generation: 1, .. })
    ));
    assert!(matches!(
        receiver.try_recv(),
        Ok(Work::Refresh { generation: 2, .. })
    ));
    assert!(gate.lock().unwrap().is_none());
    assert!(!String::from_utf8(output.lock().unwrap().clone())
        .unwrap()
        .contains("IDLE"));
}

#[test]
fn server_push_wakes_the_worker_without_waiting_for_a_poll_deadline() {
    let (client, output) =
        client("* OK ready\r\na1 OK login\r\n+ idling\r\n* 2 EXISTS\r\na2 OK idle done\r\n".into());
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let (socket, _peer) = socket_pair();
    let gate = Mutex::new(None);
    let (_sender, receiver) = mpsc::channel();
    let wake = wait_for_mail(
        &mut session,
        &socket,
        &gate,
        &receiver,
        PUSH_REFRESH_INTERVAL,
    );
    assert!(matches!(wake, MailWake::Changed));
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert!(commands.contains("a2 IDLE\r\nDONE\r\n"));
    assert!(gate.lock().unwrap().is_none());
}

#[test]
fn idle_rejection_returns_to_the_worker_for_polling_fallback() {
    let (client, _) = client(
        "* OK ready\r\na1 OK login\r\na2 BAD IDLE unsupported\r\na2 BAD not idling\r\n".into(),
    );
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let (socket, _peer) = socket_pair();
    let gate = Mutex::new(None);
    let (_sender, receiver) = mpsc::channel();
    assert!(matches!(
        wait_for_mail(
            &mut session,
            &socket,
            &gate,
            &receiver,
            PUSH_REFRESH_INTERVAL
        ),
        MailWake::Failed(imap::Error::Bad(_))
    ));
    assert!(gate.lock().unwrap().is_none());
}

#[test]
fn clearing_an_idle_timeout_restores_a_bounded_read_timeout() {
    let (socket, _peer) = socket_pair();
    let mut stream = BoundedStream(socket);
    stream.set_read_timeout(None).unwrap();
    assert_eq!(stream.0.read_timeout().unwrap(), Some(IO_TIMEOUT));
}

#[test]
fn pause_or_disconnect_interrupts_a_real_blocked_idle_socket() {
    use std::io::{BufRead, BufReader};
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let address = listener.local_addr().unwrap();
    let (entered, started) = mpsc::channel();
    let peer = thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let mut reader = BufReader::new(socket.try_clone().unwrap());
        socket.write_all(b"* OK ready\r\n").unwrap();
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        assert!(line.starts_with("a1 LOGIN"));
        socket.write_all(b"a1 OK login\r\n").unwrap();
        line.clear();
        reader.read_line(&mut line).unwrap();
        assert_eq!(line, "a2 IDLE\r\n");
        socket.write_all(b"+ idling\r\n").unwrap();
        entered.send(()).unwrap();
        line.clear();
        let _ = reader.read_line(&mut line);
    });
    let socket = TcpStream::connect(address).unwrap();
    socket.set_read_timeout(Some(IO_TIMEOUT)).unwrap();
    let control = socket.try_clone().unwrap();
    let mut client = imap::Client::new(BoundedStream(socket));
    client.read_greeting().unwrap();
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let gate = Arc::new(Mutex::new(None));
    let interrupt = gate.clone();
    let (sender, receiver) = mpsc::channel();
    let cancel = thread::spawn(move || {
        started.recv_timeout(Duration::from_secs(3)).unwrap();
        sender.send(Work::Wake).unwrap();
        interrupt_idle(&interrupt);
    });
    let before = Instant::now();
    assert!(matches!(
        wait_for_mail(
            &mut session,
            &control,
            &gate,
            &receiver,
            PUSH_REFRESH_INTERVAL
        ),
        MailWake::Work(Work::Wake)
    ));
    assert!(before.elapsed() < Duration::from_secs(3));
    assert!(gate.lock().unwrap().is_none());
    cancel.join().unwrap();
    peer.join().unwrap();
}

fn body_client(
    structure: &str,
    header: &str,
    path: &str,
    mime: &str,
    body: &str,
) -> (Session<ScriptedStream>, Arc<Mutex<Vec<u8>>>) {
    let script = format!("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 FLAGS ())\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 FLAGS ())\r\n* 1 FETCH (UID 9 BODY[{header}] {{{}}}\r\n{mime} BODY[{path}] {{{}}}\r\n{body})\r\na4 OK body\r\n", mime.len(), body.len());
    let (client, output) = client(script);
    (client.login("user@qq.com", "test-secret").unwrap(), output)
}

#[test]
fn mail_ids_cannot_change_the_imap_query() {
    assert_eq!(parse_message_id("7:9").unwrap(), (7, 9));
    for id in [
        "",
        "0:9",
        "7:0",
        "7:*",
        "7:1,2",
        "7:1\r\nSTORE",
        "7:1:2",
        "+7:9",
        "7:4294967296",
    ] {
        assert!(parse_message_id(id).is_err(), "{id:?}");
    }
}

#[test]
fn reads_only_the_plain_body_and_never_marks_mail_read() {
    let body = "5Lit5paH";
    let structure = format!(
        "(\"TEXT\" \"PLAIN\" (\"CHARSET\" \"UTF-8\") NIL NIL \"BASE64\" {} 1)",
        body.len()
    );
    let (mut session, output) = body_client(
        &structure,
        "HEADER",
        "1",
        "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n",
        body,
    );
    let content = fetch_content(&mut session, "7:9").unwrap();
    assert_eq!(content.id, "7:9");
    assert_eq!(content.content, "中文");
    assert_eq!(content.content_type, "text/plain");
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert!(commands.contains("UID FETCH 9 (UID BODYSTRUCTURE)"));
    assert!(commands.contains("BODY.PEEK[HEADER] BODY.PEEK[1]"));
    for forbidden in [" SELECT ", " STORE ", " EXPUNGE", "BODY[]", "RFC822 "] {
        assert!(!commands.contains(forbidden), "{commands}");
    }
}

#[test]
fn split_fetch_responses_still_build_the_body() {
    let body = "5Lit5paH";
    let mime =
        "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
    let structure = format!(
        "(\"TEXT\" \"PLAIN\" (\"CHARSET\" \"UTF-8\") NIL NIL \"BASE64\" {} 1)",
        body.len()
    );
    // 续包只带了分段、没重复 UID（QQ 的拆包形态），正文和报文头都要能拼出来。
    let script = format!("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 BODY[HEADER] {{{}}}\r\n{mime})\r\n* 1 FETCH (BODY[1] {{{}}}\r\n{body})\r\na4 OK body\r\n", mime.len(), body.len());
    let (client, _) = client(script);
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    assert_eq!(fetch_content(&mut session, "7:9").unwrap().content, "中文");
}

#[test]
fn multipart_prefers_html_and_skips_attachments_and_plain_alternative() {
    let body = "<p>meeting at 3</p>";
    let structure = format!("(((\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {} 1)(\"TEXT\" \"PLAIN\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" 12 1) \"ALTERNATIVE\")(\"APPLICATION\" \"PDF\" (\"NAME\" \"large.pdf\") NIL NIL \"BASE64\" 9999999) \"MIXED\")", body.len());
    let (mut session, output) = body_client(
        &structure,
        "1.1.MIME",
        "1.1",
        "Content-Type: text/html; charset=utf-8\r\n\r\n",
        body,
    );
    assert_eq!(fetch_content(&mut session, "7:9").unwrap().content, body);
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert!(commands.contains("BODY.PEEK[1.1]"));
    assert!(!commands.contains("BODY.PEEK[1.2]"));
    assert!(!commands.contains("BODY.PEEK[2]"));
}

#[test]
fn images_split_across_fetch_responses_without_repeated_uid_are_all_inlined() {
    let body = r#"<p>两张图</p><img src="cid:img1@qq"><img src="cid:img2@qq">"#;
    let mime = "Content-Type: text/html; charset=utf-8\r\n\r\n";
    let first = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4";
    let second = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR5";
    let structure = format!(
        "((\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {} 1)(\"IMAGE\" \"PNG\" (\"NAME\" \"img1.png\") \"<img1@qq>\" NIL \"BASE64\" {})(\"IMAGE\" \"PNG\" (\"NAME\" \"img2.png\") \"<img2@qq>\" NIL \"BASE64\" {}) \"RELATED\")",
        body.len(),
        first.len(),
        second.len()
    );
    // 图片多时服务器会把分段拆成多条 FETCH 响应，而且只有第一条带 UID，后面的响应
    // 只给分段——按 uid 过滤的话就只能拿到第一批，两张图都得内联才算过。
    let script = format!(
        "* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 BODY[1.MIME] {{{}}}\r\n{mime} BODY[1] {{{}}}\r\n{body})\r\na4 OK body\r\n* 1 FETCH (UID 9 BODY[2] {{{}}}\r\n{first})\r\n* 1 FETCH (BODY[3] {{{}}}\r\n{second})\r\na5 OK images\r\n",
        mime.len(),
        body.len(),
        first.len(),
        second.len()
    );
    let (client, _) = client(script);
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let content = fetch_content(&mut session, "7:9").unwrap();
    assert!(content
        .content
        .contains(&format!("data:image/png;base64,{first}")));
    assert!(content
        .content
        .contains(&format!("data:image/png;base64,{second}")));
    assert!(!content.content.contains("cid:"));
}

#[test]
fn an_image_missing_from_the_batches_is_fetched_again_on_its_own() {
    let body = r#"<p>两张图</p><img src="cid:img1@qq"><img src="cid:img2@qq">"#;
    let mime = "Content-Type: text/html; charset=utf-8\r\n\r\n";
    let first = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4";
    let second = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR5";
    let structure = format!(
        "((\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {} 1)(\"IMAGE\" \"PNG\" (\"NAME\" \"img1.png\") \"<img1@qq>\" NIL \"BASE64\" {})(\"IMAGE\" \"PNG\" (\"NAME\" \"img2.png\") \"<img2@qq>\" NIL \"BASE64\" {}) \"RELATED\")",
        body.len(),
        first.len(),
        second.len()
    );
    // 服务器只把第一批发回来（第二张图缺失），得单独再取一次这个分段补上。
    let script = format!(
        "* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 BODY[1.MIME] {{{}}}\r\n{mime} BODY[1] {{{}}}\r\n{body})\r\na4 OK body\r\n* 1 FETCH (UID 9 BODY[2] {{{}}}\r\n{first})\r\na5 OK images\r\n* 1 FETCH (UID 9 BODY[3] {{{}}}\r\n{second})\r\na6 OK retry\r\n",
        mime.len(),
        body.len(),
        first.len(),
        second.len()
    );
    let (client, output) = client(script);
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let content = fetch_content(&mut session, "7:9").unwrap();
    assert!(content
        .content
        .contains(&format!("data:image/png;base64,{first}")));
    assert!(content
        .content
        .contains(&format!("data:image/png;base64,{second}")));
    assert!(!content.content.contains("cid:"));
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert_eq!(commands.matches("BODY.PEEK[3]").count(), 2, "{commands}");
}

#[test]
fn inline_image_failures_keep_the_text_body() {
    let body = r#"<p>保留正文</p><img src="cid:image1@qq">"#;
    let mime = "Content-Type: text/html; charset=utf-8\r\n\r\n";
    let structure = format!(
        "((\"TEXT\" \"HTML\" (\"CHARSET\" \"UTF-8\") NIL NIL \"8BIT\" {} 1)(\"IMAGE\" \"PNG\" (\"NAME\" \"image1.png\") \"<image1@qq>\" NIL \"BASE64\" 40) \"RELATED\")",
        body.len()
    );
    let script = format!("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 7] valid\r\na2 OK [READ-ONLY] examined\r\n* 1 FETCH (UID 9 BODYSTRUCTURE {structure})\r\na3 OK structure\r\n* 1 FETCH (UID 9 BODY[1.MIME]<0> {{{}}}\r\n{mime} BODY[1]<0> {{{}}}\r\n{body})\r\na4 OK body\r\na5 NO image fetch failed\r\n", mime.len(), body.len());
    let (client, output) = client(script);
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    let content = fetch_content(&mut session, "7:9").expect("图片失败不应该连正文一起失败");
    assert_eq!(content.content, body);
    let commands = String::from_utf8(output.lock().unwrap().clone()).unwrap();
    assert!(commands.contains("BODY.PEEK[1]"));
    assert!(commands.contains("BODY.PEEK[2]"));
}

#[test]
fn html_only_mail_decodes_quoted_printable_chinese() {
    let body = "<p>=D6=D0=CE=C4</p>";
    let structure = format!(
        "(\"TEXT\" \"HTML\" (\"CHARSET\" \"GB2312\") NIL NIL \"QUOTED-PRINTABLE\" {} 1)",
        body.len()
    );
    let (mut session, _) = body_client(&structure, "HEADER", "1", "Content-Type: text/html; charset=GB2312\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n", body);
    let content = fetch_content(&mut session, "7:9").unwrap();
    assert_eq!(content.content, "<p>中文</p>");
    assert_eq!(content.content_type, "text/html");
}

#[test]
fn a_changed_uid_validity_never_reads_a_different_message() {
    let (client, output) = client("* OK ready\r\na1 OK login\r\n* 1 EXISTS\r\n* OK [UIDVALIDITY 8] changed\r\na2 OK examined\r\n".into());
    let mut session = client.login("user@qq.com", "test-secret").unwrap();
    assert!(fetch_content(&mut session, "7:9")
        .unwrap_err()
        .contains("刷新"));
    assert!(!String::from_utf8(output.lock().unwrap().clone())
        .unwrap()
        .contains("UID FETCH"));
}

#[test]
fn oversized_bodies_and_text_attachments_are_not_downloaded() {
    for structure in [
        format!("(\"TEXT\" \"PLAIN\" NIL NIL NIL \"8BIT\" {} 1)", MAX_BODY_BYTES + 1),
        "(\"TEXT\" \"PLAIN\" (\"NAME\" \"secret.txt\") NIL NIL \"8BIT\" 8 1 NIL (\"ATTACHMENT\" (\"FILENAME\" \"secret.txt\")) NIL NIL)".into(),
    ] {
        let (mut session, output) = body_client(&structure, "HEADER", "1", "", "");
        assert!(fetch_content(&mut session, "7:9").is_err());
        assert!(!String::from_utf8(output.lock().unwrap().clone()).unwrap().contains("BODY.PEEK"));
    }
}

#[test]
fn incomplete_or_mismatched_mime_bodies_are_rejected() {
    for (size, mime) in [
        (50, "Content-Type: text/plain\r\n\r\n"),
        (5, "Content-Type: text/html\r\n\r\n"),
    ] {
        let structure = format!("(\"TEXT\" \"PLAIN\" NIL NIL NIL \"8BIT\" {size} 1)");
        let (mut session, _) = body_client(&structure, "HEADER", "1", mime, "hello");
        assert!(fetch_content(&mut session, "7:9").is_err());
    }
}
