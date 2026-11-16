//! Bounded, read-only verification-code enrichment for newly arrived unread mail.

use super::{
    otp, otp_html,
    session::{Cursor, MailFailure},
    MailMessage,
};
use imap::Session;
use std::io::{Read, Write};

const MAX_OTP_MAILS: usize = 5;
const MAX_INITIAL_AGE_MS: i64 = 24 * 60 * 60 * 1000;
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
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default().as_millis() as i64;
    let initial = previous.is_none_or(|old| old.validity != validity);
    let mut attempted = 0;
    for item in items.iter_mut() {
        if !item.unread && previous.is_some_and(|old| old.validity == validity && item.uid > old.high_water) {
            eprintln!("mail OTP: skipped new message, already read");
        }
        let arrival = is_arrival(item, validity, previous);
        let recent = initial && item.unread && item.received_at.is_some_and(|at| at <= now && now.saturating_sub(at) <= MAX_INITIAL_AGE_MS);
        if !arrival && !recent { continue; }
        if attempted >= MAX_OTP_MAILS {
            if arrival { eprintln!("mail OTP: skipped new message, per-sync limit reached"); }
            continue;
        }
        attempted += 1;
        eprintln!("mail OTP: checking unread message (initial={initial}, likely={})", otp::likely_verification(&item.subject, &item.sender));
        item.otp_code = otp::extract(&item.subject, "", &[]).map(|code| code.text);
        if item.otp_code.is_some() {
            eprintln!("mail OTP: matched subject");
            continue;
        }
        // EXAMINE was issued by the inbox sync. PEEK also keeps this safe if the session's
        // selection mode ever changes. Partial fetch bounds large MIME/attachment messages.
        let messages = match session.uid_fetch(item.uid.to_string(), PEEK_QUERY) {
            Ok(messages) => messages,
            Err(imap::Error::No(_)) => {
                eprintln!("mail OTP: server rejected optional body peek (NO)");
                continue;
            }
            Err(imap::Error::Bad(_)) => {
                eprintln!("mail OTP: server rejected optional body peek (BAD)");
                continue;
            }
            Err(_) => {
                eprintln!("mail OTP: body peek failed due to connection error");
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
            eprintln!("mail OTP: body checked, match={}", item.otp_code.is_some());
        } else {
            eprintln!("mail OTP: body unavailable or too large");
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
