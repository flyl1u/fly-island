//! Bounded, read-only verification-code enrichment for newly arrived unread mail.

use super::{
    otp, otp_html,
    session::{Cursor, MailFailure},
    MailMessage,
};
use imap::Session;
use std::io::{Read, Write};

const MAX_OTP_MAILS: usize = 3;
const MAX_PEEK_BYTES: usize = 256 * 1024;
const PEEK_QUERY: &str = "(UID BODY.PEEK[]<0.262144>)";

fn is_arrival(item: &MailMessage, validity: u32, previous: Option<Cursor>) -> bool {
    item.unread && previous.is_some_and(|old| old.validity == validity && item.uid > old.high_water)
}

pub(super) fn newest_code(
    items: &[MailMessage],
    validity: u32,
    previous: Option<Cursor>,
) -> Option<String> {
    items
        .iter()
        .filter(|item| is_arrival(item, validity, previous) && item.otp_code.is_some())
        .max_by_key(|item| item.uid)
        .map(|item| item.id.clone())
}

pub(super) fn enrich<T: Read + Write>(
    session: &mut Session<T>,
    items: &mut [MailMessage],
    validity: u32,
    previous: Option<Cursor>,
) -> Result<(), MailFailure> {
    // Initial login and UIDVALIDITY changes establish a baseline; never scan old unread mail.
    for item in items
        .iter_mut()
        .filter(|item| is_arrival(item, validity, previous))
        .take(MAX_OTP_MAILS)
    {
        item.otp_code = otp::extract(&item.subject, "", &[]).map(|code| code.text);
        if item.otp_code.is_some() || !otp::likely_verification(&item.subject, &item.sender) {
            continue;
        }
        // EXAMINE was issued by the inbox sync. PEEK also keeps this safe if the session's
        // selection mode ever changes. Partial fetch bounds large MIME/attachment messages.
        let messages = match session.uid_fetch(item.uid.to_string(), PEEK_QUERY) {
            Ok(messages) => messages,
            Err(imap::Error::No(reason)) => {
                eprintln!("mail OTP: server rejected optional body peek: {reason}");
                continue;
            }
            Err(imap::Error::Bad(reason)) => {
                eprintln!("mail OTP: server rejected optional body peek: {reason}");
                continue;
            }
            Err(error) => {
                eprintln!("mail OTP: body peek failed: {error}");
                return Err(MailFailure::network());
            }
        };
        if let Some(raw) = messages
            .iter()
            .find(|message| message.uid == Some(item.uid))
            .and_then(|message| message.body())
            .filter(|raw| raw.len() <= MAX_PEEK_BYTES)
        {
            item.otp_code = code_from_mime(&item.subject, raw);
        }
    }
    Ok(())
}

fn code_from_mime(subject: &str, raw: &[u8]) -> Option<String> {
    let mail = mailparse::parse_mail(raw).ok()?;
    let mut parts = vec![(&mail, 0)];
    let mut plain = String::new();
    let mut html = String::new();
    for _ in 0..128 {
        let Some((part, depth)) = parts.pop() else {
            break;
        };
        if depth > 16
            || part.get_content_disposition().disposition == mailparse::DispositionType::Attachment
            || part.ctype.params.contains_key("name")
        {
            continue;
        }
        if part.ctype.mimetype.eq_ignore_ascii_case("message/rfc822") {
            continue;
        }
        if !part.subparts.is_empty() {
            parts.extend(part.subparts.iter().rev().map(|part| (part, depth + 1)));
        } else if let Ok(body) = part.get_body() {
            if part.ctype.mimetype.eq_ignore_ascii_case("text/plain") {
                plain.push_str(&body);
                plain.push('\n');
            } else if part.ctype.mimetype.eq_ignore_ascii_case("text/html") {
                html.push_str(&body);
                html.push('\n');
            }
        }
    }
    let text = if html.is_empty() {
        plain
    } else {
        otp_html::html_to_text(&html)
    };
    otp::extract(subject, &text, &otp_html::emphasized(&html)).map(|code| code.text)
}

#[cfg(test)]
#[path = "otp_arrivals_tests.rs"]
mod tests;
