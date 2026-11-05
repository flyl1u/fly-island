//! A mail's attachments: listed with the body, and saved one at a time into the
//! user's Downloads folder under a safe, unused file name.

use imap::{types::Fetch, Session};
use imap_proto::types::{BodyContentCommon, BodyStructure, MessageSection, SectionPath};
use serde::Serialize;
use std::{
    fs::OpenOptions,
    io::{Read, Write},
    path::{Path, PathBuf},
};

use super::content::{is_attachment, parse_message_id};

/// Most attachments listed for one message.
const MAX_LISTED: usize = 50;
/// Largest attachment saved, as the server reports it before decoding.
pub(super) const MAX_SAVE_BYTES: u32 = 25 * 1024 * 1024;
/// Longest file name written, in characters, extension included.
const MAX_NAME_CHARS: usize = 150;

/// One attachment of a message. Mirrored by `MailAttachment` in src/features/messages/mail/api.ts.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentInfo {
    /// IMAP section number, e.g. "2" or "1.3"; what save_qq_mail_attachment takes.
    pub part: String,
    pub name: String,
    /// Size on the server (encoded), in bytes.
    pub size: u32,
    pub mime: String,
}

fn param<'a>(params: Option<&'a Vec<(&'a str, &'a str)>>, key: &str) -> Option<&'a str> {
    params?.iter().find(|(name, _)| name.eq_ignore_ascii_case(key)).map(|(_, value)| *value)
}

/// `filename*=UTF-8''%E6%8A%A5...` (RFC 2231) into text; other charsets are read as UTF-8.
fn decode_extended(value: &str) -> String {
    let encoded = value.splitn(3, '\'').nth(2).unwrap_or(value);
    let mut bytes = Vec::with_capacity(encoded.len());
    let mut chars = encoded.bytes();
    while let Some(byte) = chars.next() {
        if byte == b'%' {
            let hex: Vec<u8> = chars.by_ref().take(2).collect();
            if let Some(decoded) = std::str::from_utf8(&hex).ok().and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                bytes.push(decoded);
                continue;
            }
            bytes.push(byte);
            bytes.extend(hex);
        } else {
            bytes.push(byte);
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

/// The attachment's file name: disposition filename, else the type's name, with
/// RFC 2047 encoded words and RFC 2231 extended values decoded.
fn file_name(common: &BodyContentCommon<'_>) -> String {
    let disposition = common.disposition.as_ref().and_then(|disposition| disposition.params.as_ref());
    let raw = param(disposition, "filename*")
        .map(decode_extended)
        .or_else(|| param(disposition, "filename").map(str::to_string))
        .or_else(|| param(common.ty.params.as_ref(), "name*").map(decode_extended))
        .or_else(|| param(common.ty.params.as_ref(), "name").map(str::to_string))
        .unwrap_or_default();
    // mailparse decodes "=?UTF-8?B?...?=" words when reading a header value.
    let decoded = mailparse::parse_header(format!("X: {raw}").as_bytes())
        .map(|(header, _)| header.get_value())
        .unwrap_or(raw);
    decoded.trim().to_string()
}

/// Attachments in a body structure, depth first, at most MAX_LISTED.
pub(super) fn collect(body: &BodyStructure<'_>, path: Vec<u32>, out: &mut Vec<AttachmentInfo>) {
    if out.len() >= MAX_LISTED || path.len() > 16 {
        return;
    }
    let part = |path: &[u32]| if path.is_empty() { "1".to_string() } else { path.iter().map(u32::to_string).collect::<Vec<_>>().join(".") };
    match body {
        BodyStructure::Multipart { bodies, .. } => {
            for (index, nested) in bodies.iter().take(128).enumerate() {
                let mut nested_path = path.clone();
                nested_path.push(index as u32 + 1);
                collect(nested, nested_path, out);
            }
        }
        BodyStructure::Basic { common, other, .. }
        | BodyStructure::Text { common, other, .. }
        | BodyStructure::Message { common, other, .. }
            if is_attachment(common) =>
        {
            let name = file_name(common);
            out.push(AttachmentInfo {
                part: part(&path),
                name: if name.is_empty() { "attachment".into() } else { name },
                size: other.octets,
                mime: format!("{}/{}", common.ty.ty, common.ty.subtype).to_ascii_lowercase(),
            });
        }
        _ => {}
    }
}

/// `name` made safe as a Windows file name: no path separators, reserved or control
/// characters, no reserved device names, no trailing dots or spaces, a sane length.
pub(super) fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| if character.is_control() || "<>:\"/\\|?*".contains(character) { '_' } else { character })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches(['.', ' ']).trim_start_matches('.').to_string();
    let (stem, extension) = match cleaned.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() && extension.chars().count() <= 16 => (stem.to_string(), format!(".{extension}")),
        _ => (cleaned.clone(), String::new()),
    };
    let reserved = ["CON", "PRN", "AUX", "NUL"].iter().any(|device| stem.eq_ignore_ascii_case(device))
        || (stem.len() == 4
            && (stem[..3].eq_ignore_ascii_case("COM") || stem[..3].eq_ignore_ascii_case("LPT"))
            && stem.as_bytes()[3].is_ascii_digit());
    let stem = if stem.is_empty() { "attachment".to_string() } else if reserved { format!("_{stem}") } else { stem };
    let room = MAX_NAME_CHARS.saturating_sub(extension.chars().count()).max(1);
    format!("{}{extension}", stem.chars().take(room).collect::<String>())
}

/// Writes `bytes` to `dir/name`, or "name (2).ext" and so on if taken; never overwrites.
pub(super) fn write_unused(dir: &Path, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let (stem, extension) = match name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => (stem, format!(".{extension}")),
        _ => (name, String::new()),
    };
    for attempt in 1..=999 {
        let candidate = if attempt == 1 { name.to_string() } else { format!("{stem} ({attempt}){extension}") };
        let path = dir.join(candidate);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(bytes).map_err(|error| format!("无法写入 {}：{error}", path.display()))?;
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("无法保存到 {}：{error}", path.display())),
        }
    }
    Err("下载文件夹里同名文件太多，请清理后重试。".into())
}

fn responses(messages: &[Fetch], uid: u32) -> impl Iterator<Item = &Fetch> {
    messages.iter().filter(move |message| message.uid.is_none_or(|found| found == uid))
}

/// Fetches and decodes one attachment. The part must be an attachment in the
/// message's current structure, so a page cannot ask for arbitrary sections.
pub(super) fn fetch_attachment<T: Read + Write>(
    session: &mut Session<T>,
    message_id: &str,
    part: &str,
) -> Result<(AttachmentInfo, Vec<u8>), String> {
    let (validity, uid) = parse_message_id(message_id)?;
    let mailbox = session.examine("INBOX").map_err(|_| "无法打开收件箱，请稍后重试。")?;
    if mailbox.uid_validity != Some(validity) {
        return Err("收件箱已更新，请刷新列表后重新打开邮件。".into());
    }
    let structures = session
        .uid_fetch(uid.to_string(), "(UID BODYSTRUCTURE)")
        .map_err(|_| "无法读取邮件结构，请稍后重试。")?;
    let structure = responses(&structures, uid)
        .find_map(|item| item.bodystructure())
        .ok_or("邮件已移除或暂不可用，请刷新收件箱。")?;
    let mut listed = Vec::new();
    collect(structure, Vec::new(), &mut listed);
    let info = listed.into_iter().find(|item| item.part == part).ok_or("找不到这个附件，请重新打开邮件。")?;
    if info.size > MAX_SAVE_BYTES {
        return Err(format!("附件超过 {} MB，请在网页中下载。", MAX_SAVE_BYTES / (1024 * 1024)));
    }
    // A single-part message has no [1.MIME] (QQ does not answer it); its header is the message's.
    let multipart = matches!(structure, BodyStructure::Multipart { .. });
    let header_query = if multipart { format!("BODY.PEEK[{part}.MIME]") } else { "BODY.PEEK[HEADER]".into() };
    let query = format!("(UID {header_query} BODY.PEEK[{part}])");
    let messages = session.uid_fetch(uid.to_string(), query).map_err(|_| "无法下载附件，请检查网络并重试。")?;
    let path: Vec<u32> = part.split('.').filter_map(|segment| segment.parse().ok()).collect();
    let mime_path = SectionPath::Part(path.clone(), Some(MessageSection::Mime));
    let body_path = SectionPath::Part(path, None);
    let mut header = None;
    let mut body = None;
    for item in responses(&messages, uid) {
        header = header.or_else(|| if multipart { item.section(&mime_path) } else { item.header() });
        body = body.or_else(|| item.section(&body_path));
    }
    let (header, body) = (header.ok_or("附件已移除，请刷新收件箱。")?, body.ok_or("附件已移除，请刷新收件箱。")?);
    let mut raw = header.to_vec();
    if !raw.ends_with(b"\r\n\r\n") && !raw.ends_with(b"\n\n") {
        raw.extend_from_slice(b"\r\n\r\n");
    }
    raw.extend_from_slice(body);
    let parsed = mailparse::parse_mail(&raw).map_err(|_| "无法解析附件，请在网页中下载。")?;
    let bytes = parsed.get_body_raw().map_err(|_| "无法解码附件，请在网页中下载。")?;
    Ok((info, bytes))
}
