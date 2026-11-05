//! Sending plain-text mail over SMTP with the mailbox's authorization code, and
//! the reply draft for a listed message.

use imap::Session;
use lettre::{
    message::{header::ContentType, Mailbox},
    transport::smtp::{authentication::Credentials, client::Tls, client::TlsParameters},
    Message, SmtpTransport, Transport,
};
use serde::Serialize;
use std::{
    io::{Read, Write},
    time::Duration,
};

use super::content::parse_message_id;

/// The SMTPS port; other ports are used with STARTTLS (still required).
const SMTPS_PORT: u16 = 465;
const MAX_RECIPIENTS: usize = 20;
const MAX_SUBJECT_CHARS: usize = 500;
const MAX_BODY_BYTES: usize = 200 * 1024;

/// What the user wrote. Mirrored by `OutgoingMail` in src/features/messages/mail/api.ts.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingMail {
    pub to: Vec<String>,
    #[serde(default)]
    pub cc: Vec<String>,
    pub subject: String,
    pub body: String,
}

/// Threading headers of the message being answered, read from the server.
#[derive(Debug, Clone, Default, PartialEq)]
pub(super) struct Thread {
    pub message_id: Option<String>,
    pub references: Option<String>,
}

/// A reply's starting point. Mirrored by `MailReplyDraft` in api.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplyDraft {
    pub to: String,
    pub subject: String,
}

/// The outgoing server: `smtp.<rest>` when the IMAP server is `imap.<rest>`
/// (which covers a hand-entered one, e.g. Foxmail on `imap.qq.com`), else
/// `smtp.<domain>`, as QQ Mail, 163, 126 and most school and company mail use.
pub(super) fn smtp_server(email: &str, imap_host: &str) -> String {
    let name = imap_host.split_once(':').map_or(imap_host, |(name, _)| name);
    match name.strip_prefix("imap.") {
        Some(rest) if !rest.is_empty() => format!("smtp.{rest}"),
        _ => format!("smtp.{}", email.split_once('@').map_or(email, |(_, domain)| domain)),
    }
}

fn mailbox(address: &str) -> Result<Mailbox, String> {
    address.trim().parse::<Mailbox>().map_err(|_| format!("收件人地址无效：{}", address.trim()))
}

/// A header value from the server, safe to send back: one line, a sane length.
fn header_value(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|value| !value.is_empty() && value.len() <= 2_000 && !value.chars().any(char::is_control))
}

/// Builds the message, checking every field a page could send.
pub(super) fn build(email: &str, mail: &OutgoingMail, thread: &Thread) -> Result<Message, String> {
    let to: Vec<&String> = mail.to.iter().filter(|address| !address.trim().is_empty()).collect();
    let cc: Vec<&String> = mail.cc.iter().filter(|address| !address.trim().is_empty()).collect();
    if to.is_empty() {
        return Err("请填写收件人。".into());
    }
    if to.len() + cc.len() > MAX_RECIPIENTS {
        return Err(format!("一封邮件最多 {MAX_RECIPIENTS} 个收件人。"));
    }
    if mail.subject.chars().count() > MAX_SUBJECT_CHARS || mail.subject.contains(['\r', '\n']) {
        return Err("主题太长或包含换行。".into());
    }
    if mail.body.len() > MAX_BODY_BYTES {
        return Err("正文太长，请在网页中发送。".into());
    }
    let mut builder = Message::builder()
        .from(mailbox(email)?)
        .subject(mail.subject.trim())
        .header(ContentType::TEXT_PLAIN);
    for address in to {
        builder = builder.to(mailbox(address)?);
    }
    for address in cc {
        builder = builder.cc(mailbox(address)?);
    }
    if let Some(id) = header_value(thread.message_id.clone()) {
        let references = header_value(thread.references.clone()).map_or_else(|| id.clone(), |references| format!("{references} {id}"));
        builder = builder.in_reply_to(id).references(references);
    }
    builder.body(mail.body.replace("\r\n", "\n")).map_err(|error| format!("无法生成邮件：{error}"))
}

/// Sends `message` through `server` (host, optionally `:port`), always over TLS.
pub(super) fn deliver(server: &str, email: &str, secret: &str, message: &Message) -> Result<(), String> {
    let (host, port) = match server.split_once(':') {
        Some((host, port)) => (host, port.parse().unwrap_or(SMTPS_PORT)),
        None => (server, SMTPS_PORT),
    };
    let tls = TlsParameters::new(host.to_string()).map_err(|error| format!("无法建立加密连接：{error}"))?;
    let transport = SmtpTransport::builder_dangerous(host)
        .port(port)
        .tls(if port == SMTPS_PORT { Tls::Wrapper(tls) } else { Tls::Required(tls) })
        .credentials(Credentials::new(email.to_string(), secret.to_string()))
        .timeout(Some(Duration::from_secs(30)))
        .build();
    transport.send(message).map(|_| ()).map_err(|error| {
        if error.is_permanent() || error.to_string().contains("535") {
            "发件服务器拒绝了登录或邮件，请确认已开启 SMTP 服务、授权码正确，以及收件人地址。".to_string()
        } else {
            format!("发送失败，请检查网络后重试：{error}")
        }
    })
}

/// Reads the answered message's header: who to reply to, its subject and threading.
pub(super) fn reply_source<T: Read + Write>(session: &mut Session<T>, message_id: &str) -> Result<(ReplyDraft, Thread), String> {
    let (validity, uid) = parse_message_id(message_id)?;
    let mailbox = session.examine("INBOX").map_err(|_| "无法打开收件箱，请稍后重试。")?;
    if mailbox.uid_validity != Some(validity) {
        return Err("收件箱已更新，请刷新列表后重试。".into());
    }
    let messages = session
        .uid_fetch(uid.to_string(), "(UID BODY.PEEK[HEADER]<0.65536>)")
        .map_err(|_| "无法读取邮件，请稍后重试。")?;
    let header = messages
        .iter()
        .filter(|message| message.uid.is_none_or(|found| found == uid))
        .find_map(|message| message.header())
        .ok_or("邮件已移除，请刷新收件箱。")?;
    let (headers, _) = mailparse::parse_headers(header).map_err(|_| "无法读取邮件头。")?;
    let get = |name: &str| headers.iter().find(|header| header.get_key().eq_ignore_ascii_case(name)).map(|header| header.get_value());
    let address = |name: &str| {
        let value = headers.iter().find(|header| header.get_key().eq_ignore_ascii_case(name))?;
        let list = mailparse::addrparse_header(value).ok()?;
        list.extract_single_info().map(|info| info.addr)
    };
    let to = address("Reply-To").or_else(|| address("From")).ok_or("找不到这封邮件的发件人。")?;
    let subject = get("Subject").unwrap_or_default();
    let subject = subject.trim();
    let lower = subject.to_ascii_lowercase();
    let subject = if lower.starts_with("re:") || subject.starts_with("回复：") { subject.to_string() } else { format!("Re: {subject}") };
    let thread = Thread { message_id: get("Message-ID"), references: get("References") };
    Ok((ReplyDraft { to, subject }, thread))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outgoing(to: &[&str], subject: &str) -> OutgoingMail {
        OutgoingMail { to: to.iter().map(|value| value.to_string()).collect(), cc: Vec::new(), subject: subject.into(), body: "你好\r\n".into() }
    }

    #[test]
    fn messages_are_built_from_checked_fields() {
        let message = build("me@qq.com", &outgoing(&["a@163.com"], "周报"), &Thread::default()).unwrap();
        let text = String::from_utf8(message.formatted()).unwrap();
        assert!(text.contains("From: me@qq.com") && text.contains("To: a@163.com"), "{text}");
        assert!(!text.contains("In-Reply-To"));

        assert!(build("me@qq.com", &outgoing(&[], "x"), &Thread::default()).is_err(), "a recipient is needed");
        assert!(build("me@qq.com", &outgoing(&["not an address"], "x"), &Thread::default()).is_err());
        assert!(build("me@qq.com", &outgoing(&["a@163.com"], "x\r\nBcc: evil@example.com"), &Thread::default()).is_err(), "no header injection");
        let many: Vec<String> = (0..21).map(|index| format!("u{index}@qq.com")).collect();
        let many: Vec<&str> = many.iter().map(String::as_str).collect();
        assert!(build("me@qq.com", &outgoing(&many, "x"), &Thread::default()).is_err());
    }

    #[test]
    fn replies_carry_the_thread_and_drop_unsafe_header_values() {
        let thread = Thread { message_id: Some("<b@x>".into()), references: Some("<a@x>".into()) };
        let text = String::from_utf8(build("me@qq.com", &outgoing(&["a@163.com"], "Re: 周报"), &thread).unwrap().formatted()).unwrap();
        assert!(text.contains("In-Reply-To: <b@x>") && text.contains("References: <a@x> <b@x>"), "{text}");

        let hostile = Thread { message_id: Some("<b@x>\u{0}Bcc: evil".into()), references: None };
        let text = String::from_utf8(build("me@qq.com", &outgoing(&["a@163.com"], "x"), &hostile).unwrap().formatted()).unwrap();
        assert!(!text.contains("In-Reply-To") && !text.contains("evil"), "{text}");
    }

    #[test]
    fn the_outgoing_server_follows_the_imap_server() {
        assert_eq!(smtp_server("me@qq.com", "imap.qq.com"), "smtp.qq.com");
        assert_eq!(smtp_server("me@foxmail.com", "imap.qq.com:993"), "smtp.qq.com");
        assert_eq!(smtp_server("me@example.com", "mail.example.com:9993"), "smtp.example.com");
        assert_eq!(smtp_server("me@163.com", ""), "smtp.163.com");
    }
}
