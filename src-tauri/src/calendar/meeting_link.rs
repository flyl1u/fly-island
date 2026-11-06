//! The link to join an event's online meeting, found in its URL, location or description, in
//! that order, as MeetingBar does (MeetingLinkDetector.swift). Only links of known meeting
//! services are taken, so the island never opens an arbitrary link from someone's invitation.

/// Hosts (and the path a join link starts with) of meeting services.
const SERVICES: &[(&str, &str)] = &[
    ("meeting.tencent.com", "/dm/"),
    ("meeting.tencent.com", "/p/"),
    ("voovmeeting.com", "/"),
    ("vc.feishu.cn", "/j/"),
    ("vc.larksuite.com", "/j/"),
    ("meeting.dingtalk.com", "/"),
    ("zoom.us", "/j/"),
    ("zoom.com.cn", "/j/"),
    ("teams.microsoft.com", "/l/meetup-join/"),
    ("teams.live.com", "/meet/"),
    ("meet.google.com", "/"),
    ("webex.com", "/"),
];

/// The meeting service a link belongs to, if it is a join link of a known one.
fn is_meeting_link(link: &str) -> bool {
    let Some(rest) = link.strip_prefix("https://") else {
        return false;
    };
    let (host, path) = rest.split_once('/').map_or((rest, "/".to_string()), |(host, path)| (host, format!("/{path}")));
    let host = host.to_ascii_lowercase();
    SERVICES.iter().any(|(service, prefix)| {
        (host == *service || host.ends_with(&format!(".{service}"))) && path.starts_with(prefix) && path.len() > prefix.len()
    })
}

/// The https links in a text, cut at whitespace, quotes and angle brackets.
fn links(text: &str) -> impl Iterator<Item = &str> {
    text.match_indices("https://").map(move |(start, _)| {
        let rest = &text[start..];
        let end = rest.find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '<' | '>' | ')' | '，' | '。')).unwrap_or(rest.len());
        rest[..end].trim_end_matches(['.', ',', ';'])
    })
}

/// The first meeting link in the fields, given in priority order; the longest one within a field.
pub(super) fn meeting_link(fields: &[Option<&str>]) -> Option<String> {
    fields.iter().flatten().find_map(|field| links(field).filter(|link| is_meeting_link(link)).max_by_key(|link| link.len()).map(str::to_string))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_links_of_known_services_are_found_in_priority_order() {
        let description = "腾讯会议：https://meeting.tencent.com/dm/jvAnxAmrDfHt\n#腾讯会议：123-456\n资料 https://example.com/doc";
        assert_eq!(meeting_link(&[None, Some("3 楼会议室"), Some(description)]).as_deref(), Some("https://meeting.tencent.com/dm/jvAnxAmrDfHt"));
        assert_eq!(
            meeting_link(&[Some("https://vc.feishu.cn/j/123456789"), None, Some("https://zoom.us/j/1")]).as_deref(),
            Some("https://vc.feishu.cn/j/123456789")
        );
        assert_eq!(meeting_link(&[None, Some("<https://us02web.zoom.us/j/8812345?pwd=abc>")]).as_deref(), Some("https://us02web.zoom.us/j/8812345?pwd=abc"));
        assert_eq!(meeting_link(&[Some("https://meet.google.com/abc-defg-hij.")]).as_deref(), Some("https://meet.google.com/abc-defg-hij"));
        // Not a join link, or not a meeting service, or not https.
        assert_eq!(meeting_link(&[Some("https://zoom.us/pricing"), Some("https://example.com/j/1"), Some("http://zoom.us/j/1")]), None);
        assert_eq!(meeting_link(&[Some("https://meet.google.com/")]), None);
    }
}
