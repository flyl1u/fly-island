//! Message body fetching: text part selection and inline cid images.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use imap::{
    types::{Fetch, Fetches},
    Session,
};
use imap_proto::types::{
    BodyContentCommon, BodyStructure, ContentEncoding, MessageSection, SectionPath,
};
use std::io::{Read, Write};

use super::MailContent;

pub(super) const MAX_BODY_BYTES: u32 = 512 * 1024;

const MAX_MIME_BYTES: usize = 65_536;

const MAX_INLINE_IMAGES: usize = 16;

const MAX_INLINE_IMAGE_BYTES: u32 = 1024 * 1024;

const MAX_INLINE_TOTAL_BYTES: u32 = 4 * 1024 * 1024;

pub(super) fn parse_message_id(message_id: &str) -> Result<(u32, u32), String> {
    let parsed = message_id.split_once(':').and_then(|(validity, uid)| {
        if !validity.bytes().all(|byte| byte.is_ascii_digit())
            || !uid.bytes().all(|byte| byte.is_ascii_digit())
        {
            return None;
        }
        Some((validity.parse::<u32>().ok()?, uid.parse::<u32>().ok()?))
    });
    parsed
        .filter(|(validity, uid)| *validity > 0 && *uid > 0)
        .ok_or_else(|| "邮件标识无效，请刷新收件箱。".into())
}

struct TextPart {
    path: Vec<u32>,
    mime: &'static str,
    octets: u32,
}

pub(super) fn is_attachment(common: &BodyContentCommon<'_>) -> bool {
    common.disposition.as_ref().is_some_and(|disposition| {
        !disposition.ty.eq_ignore_ascii_case("inline")
            || disposition.params.as_ref().is_some_and(|params| {
                params
                    .iter()
                    .any(|(key, _)| key.eq_ignore_ascii_case("filename"))
            })
    }) || common.ty.params.as_ref().is_some_and(|params| {
        params
            .iter()
            .any(|(key, _)| key.eq_ignore_ascii_case("name"))
    })
}

fn text_part(body: &BodyStructure<'_>, path: Vec<u32>) -> Option<TextPart> {
    if path.len() > 16 {
        return None;
    }
    match body {
        BodyStructure::Text { common, other, .. } if !is_attachment(common) => {
            let mime = if common.ty.subtype.eq_ignore_ascii_case("plain") {
                "text/plain"
            } else if common.ty.subtype.eq_ignore_ascii_case("html") {
                "text/html"
            } else {
                return None;
            };
            Some(TextPart {
                path: if path.is_empty() { vec![1] } else { path },
                mime,
                octets: other.octets,
            })
        }
        BodyStructure::Multipart { common, bodies, .. } if !is_attachment(common) => {
            let mut fallback = None;
            for (index, body) in bodies.iter().take(128).enumerate() {
                let mut nested = path.clone();
                nested.push(index as u32 + 1);
                if let Some(part) = text_part(body, nested) {
                    // 优先渲染 HTML 版本：纯文本副本里没有排版和图片，图片只有在 HTML 里才存在。
                    if part.mime == "text/html" {
                        return Some(part);
                    }
                    if fallback.is_none() {
                        fallback = Some(part);
                    }
                }
            }
            fallback
        }
        // Forwarded messages and text attachments are separate from the mail's own body.
        _ => None,
    }
}

struct InlineImage {
    path: Vec<u32>,
    content_id: String,
    mime: String,
    octets: u32,
    base64: bool,
    quoted_printable: bool,
}

// cid 引用的结束位置：遇到分隔符才算 token 结束，否则 cid:image1 会把 cid:image10 一起吞掉。
fn cid_token_end(html: &str, start: usize) -> usize {
    html[start..]
        .find(|character: char| {
            character.is_whitespace()
                || matches!(character, '"' | '\'' | ')' | '(' | '<' | '>' | '?')
        })
        .map_or(html.len(), |offset| start + offset)
}

// 只内联正文里真正用 cid: 引用的图片，避免为未被引用的附件白拉数据。
pub(super) fn cid_references(html: &str) -> Vec<String> {
    let lower = html.to_ascii_lowercase();
    let mut ids: Vec<String> = Vec::new();
    let mut cursor = 0;
    while let Some(found) = lower[cursor..].find("cid:") {
        let start = cursor + found + 4;
        let end = cid_token_end(&lower, start);
        let id = html[start..end]
            .trim()
            .trim_matches(|character| character == '<' || character == '>');
        if !id.is_empty() && !ids.iter().any(|known| known.eq_ignore_ascii_case(id)) {
            ids.push(id.to_string());
        }
        cursor = end.max(start);
    }
    ids
}

// 内嵌图的 MIME：大多是 image/*；也有客户端把它标成 application/octet-stream，这时按文件名后缀认图片，
// 否则正文里被 cid 引用的图会整张不显示。
pub(super) fn inline_image_mime(common: &BodyContentCommon<'_>) -> Option<String> {
    if common.ty.ty.eq_ignore_ascii_case("image") {
        return Some(format!("image/{}", common.ty.subtype.to_ascii_lowercase()));
    }
    if !common.ty.ty.eq_ignore_ascii_case("application")
        || !common.ty.subtype.eq_ignore_ascii_case("octet-stream")
    {
        return None;
    }
    let disposition_params = common
        .disposition
        .as_ref()
        .and_then(|disposition| disposition.params.as_ref());
    let name = common
        .ty
        .params
        .iter()
        .chain(disposition_params)
        .flatten()
        .find(|(key, _)| key.eq_ignore_ascii_case("name") || key.eq_ignore_ascii_case("filename"))
        .map(|(_, value)| value.to_ascii_lowercase())?;
    let extension = name.rsplit_once('.')?.1;
    let subtype = match extension {
        "jpg" | "jpeg" => "jpeg",
        "png" | "gif" | "webp" | "bmp" => extension,
        _ => return None,
    };
    Some(format!("image/{subtype}"))
}

fn collect_inline_images(
    body: &BodyStructure<'_>,
    path: Vec<u32>,
    ids: &[String],
    out: &mut Vec<InlineImage>,
) {
    if out.len() >= MAX_INLINE_IMAGES || path.len() > 16 {
        return;
    }
    match body {
        BodyStructure::Basic { common, other, .. } => {
            let Some(mime) = inline_image_mime(common) else {
                return;
            };
            let Some(id) = other
                .id
                .as_deref()
                .map(|id| id.trim_matches(|character| character == '<' || character == '>'))
            else {
                return;
            };
            if id.is_empty() || other.octets == 0 || other.octets > MAX_INLINE_IMAGE_BYTES {
                return;
            }
            let Some(matched) = ids.iter().find(|wanted| wanted.eq_ignore_ascii_case(id)) else {
                return;
            };
            out.push(InlineImage {
                path: if path.is_empty() { vec![1] } else { path },
                content_id: matched.clone(),
                mime,
                octets: other.octets,
                base64: matches!(other.transfer_encoding, ContentEncoding::Base64),
                quoted_printable: matches!(
                    other.transfer_encoding,
                    ContentEncoding::QuotedPrintable
                ),
            });
        }
        BodyStructure::Multipart { bodies, .. } => {
            for (index, nested) in bodies.iter().take(128).enumerate() {
                let mut nested_path = path.clone();
                nested_path.push(index as u32 + 1);
                collect_inline_images(nested, nested_path, ids, out);
            }
        }
        _ => {}
    }
}

// 按完整 cid token 替换，避免 cid:image1 命中 cid:image10 的前缀。
pub(super) fn replace_cid_references(html: &str, replacements: &[(String, String)]) -> String {
    let lower = html.to_ascii_lowercase();
    let mut out = String::with_capacity(html.len());
    let mut cursor = 0;
    while let Some(found) = lower[cursor..].find("cid:") {
        // 整个 cid:token 都要换掉，只换 token 会留下 "cid:data:image/..." 这种废地址。
        let reference_start = cursor + found;
        let token_start = reference_start + 4;
        let token_end = cid_token_end(&lower, token_start);
        out.push_str(&html[cursor..reference_start]);
        match replacements
            .iter()
            .find(|(content_id, _)| content_id.eq_ignore_ascii_case(&html[token_start..token_end]))
        {
            Some((_, data_uri)) => out.push_str(data_uri),
            None => out.push_str(&html[reference_start..token_end]),
        }
        cursor = token_end;
    }
    out.push_str(&html[cursor..]);
    out
}

// UID FETCH 只查这一封邮件，但服务器可以把分段拆成多条 FETCH 响应发回来，而且续包不一定
// 重复 UID（QQ 实测就只给第一条带 UID）。按 uid 相等过滤会把续包整批丢掉，只剩下第一批分段，
// 所以这里只把带 UID 的响应排在前面，其余响应照样参与合并。
fn responses_for_message(messages: &Fetches, uid: u32) -> Vec<&Fetch<'_>> {
    let (mut mine, others): (Vec<&Fetch<'_>>, Vec<&Fetch<'_>>) =
        messages.iter().partition(|item| item.uid == Some(uid));
    mine.extend(others);
    mine
}

// 内嵌图只是锦上添花：任何一步失败都退回原正文，不能把已经拿到的文字一起弄丢。
fn inline_cid_images<T: Read + Write>(
    session: &mut Session<T>,
    uid: u32,
    structure: &BodyStructure<'_>,
    html: String,
) -> String {
    let ids = cid_references(&html);
    if ids.is_empty() {
        return html;
    }
    let mut images = Vec::new();
    collect_inline_images(structure, Vec::new(), &ids, &mut images);
    if images.is_empty() {
        return html;
    }
    let query = format!(
        "(UID {})",
        images
            .iter()
            .map(|image| {
                let section = image
                    .path
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(".");
                // 和正文一样避开 QQ 不应答的部分取回，图片大小由 octets 限额兜底。
                format!("BODY.PEEK[{section}]")
            })
            .collect::<Vec<_>>()
            .join(" ")
    );
    let Ok(messages) = session.uid_fetch(uid.to_string(), &query) else {
        return html;
    };
    let responses = responses_for_message(&messages, uid);
    if responses.is_empty() {
        return html;
    }
    let mut replacements: Vec<(String, String)> = Vec::new();
    let mut budget = MAX_INLINE_TOTAL_BYTES;
    for image in &images {
        if image.quoted_printable {
            continue;
        }
        let path = SectionPath::Part(image.path.clone(), None);
        // 批量响应里缺这一段时（服务器把后面的批次丢了）再单独要一次：一条命令只请求一个分段，
        // 就谈不上「分批」，保证后面的图片不会漏。
        let retry;
        let bytes = match responses.iter().find_map(|item| item.section(&path)) {
            Some(bytes) => Some(bytes),
            None => {
                let section = image
                    .path
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(".");
                retry = session
                    .uid_fetch(uid.to_string(), format!("(UID BODY.PEEK[{section}])"))
                    .ok();
                retry
                    .as_ref()
                    .and_then(|items| items.iter().find_map(|item| item.section(&path)))
            }
        };
        let Some(bytes) = bytes else {
            continue;
        };
        if bytes.len() < image.octets as usize {
            continue;
        }
        let payload = if image.base64 {
            let encoded = bytes
                .iter()
                .copied()
                .filter(|byte| !byte.is_ascii_whitespace())
                .collect::<Vec<u8>>();
            String::from_utf8(encoded).ok()
        } else {
            Some(BASE64.encode(bytes))
        };
        let Some(payload) = payload else {
            continue;
        };
        if payload.len() as u32 > budget {
            continue;
        }
        budget -= payload.len() as u32;
        replacements.push((
            image.content_id.clone(),
            format!("data:{};base64,{payload}", image.mime),
        ));
    }
    replace_cid_references(&html, &replacements)
}

pub(super) fn fetch_content<T: Read + Write>(
    session: &mut Session<T>,
    message_id: &str,
) -> Result<MailContent, String> {
    let (validity, uid) = parse_message_id(message_id)?;
    let mailbox = session
        .examine("INBOX")
        .map_err(|_| "无法打开收件箱，请稍后重试。")?;
    if mailbox.uid_validity != Some(validity) {
        return Err("收件箱已更新，请刷新列表后重新打开邮件。".into());
    }
    let structures = session
        .uid_fetch(uid.to_string(), "(UID BODYSTRUCTURE)")
        .map_err(|_| "无法读取邮件结构，请稍后重试。")?;
    let structure = structures
        .iter()
        .filter(|item| item.uid == Some(uid))
        .find_map(|item| item.bodystructure())
        .ok_or("邮件已移除或暂不可用，请刷新收件箱。")?;
    let mut attachments = Vec::new();
    super::attachments::collect(structure, Vec::new(), &mut attachments);
    // A message that is only attachments still opens, with its list and no text.
    let Some(part) = text_part(structure, Vec::new()) else {
        if attachments.is_empty() {
            return Err("这封邮件没有可读取的文字正文，请在网页中查看。".into());
        }
        return Ok(MailContent { id: message_id.into(), content: String::new(), content_type: "text/plain".into(), attachments });
    };
    if part.octets > MAX_BODY_BYTES {
        return Err("邮件正文超过 512 KB，请在网页中查看。".into());
    }
    let section = part
        .path
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(".");
    let multipart = matches!(structure, BodyStructure::Multipart { .. });
    let mime_path = SectionPath::Part(part.path.clone(), Some(MessageSection::Mime));
    let body_path = SectionPath::Part(part.path, None);
    // 单段邮件的正文就是整封信，没有 [1.MIME] 这个分段（QQ 会直接不返回），只能取报文头。
    let header_query = if multipart {
        format!("BODY.PEEK[{section}.MIME]")
    } else {
        "BODY.PEEK[HEADER]".to_string()
    };
    // QQ 的 IMAP 对分段的部分取回（BODY[1]<0.n>）不应答，会一直挂到超时；整段取回秒回。
    // 大小仍由 BODYSTRUCTURE 的 octets 和下面的长度校验兜底。
    let query = format!("(UID {header_query} BODY.PEEK[{section}])");
    let messages = session
        .uid_fetch(uid.to_string(), query)
        .map_err(|_| "无法加载邮件正文，请检查网络并重试。")?;
    // 服务器可能把两个分段拆到不同的 FETCH 响应里（续包甚至不重复 UID），合并全部响应，
    // 别要求同一条响应都带齐，也别要求每条响应都带 UID。
    let mut header = None;
    let mut body = None;
    for item in responses_for_message(&messages, uid) {
        if header.is_none() {
            header = if multipart {
                item.section(&mime_path)
            } else {
                item.header()
            };
        }
        if body.is_none() {
            body = item.section(&body_path);
        }
    }
    let header = header.ok_or("邮件已移除，请刷新收件箱。")?;
    let body = body.ok_or("邮件已移除，请刷新收件箱。")?;
    if header.len() > MAX_MIME_BYTES || body.len() > MAX_BODY_BYTES as usize {
        return Err("邮件正文过大，请在网页中查看。".into());
    }
    if body.len() < part.octets as usize {
        return Err("邮件正文未完整加载，请重试。".into());
    }
    let mut raw = header.to_vec();
    if !raw.ends_with(b"\r\n\r\n") && !raw.ends_with(b"\n\n") {
        raw.extend_from_slice(b"\r\n\r\n");
    }
    raw.extend_from_slice(body);
    let parsed = mailparse::parse_mail(&raw).map_err(|_| "无法解析邮件正文，请在网页中查看。")?;
    if !parsed.ctype.mimetype.eq_ignore_ascii_case(part.mime)
        || parsed.get_content_disposition().disposition == mailparse::DispositionType::Attachment
    {
        return Err("邮件正文格式不匹配，请在网页中查看。".into());
    }
    let content = parsed
        .get_body()
        .map_err(|_| "无法解码邮件正文，请在网页中查看。")?;
    let content = if part.mime == "text/html" {
        inline_cid_images(session, uid, structure, content)
    } else {
        content
    };
    Ok(MailContent {
        id: message_id.into(),
        content,
        content_type: part.mime.into(),
        attachments,
    })
}
