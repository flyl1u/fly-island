//! Parse the accessible names of WeChat's conversation rows and compare unread state.

use serde::Serialize;
use std::collections::HashMap;
use windows::Win32::Foundation::HWND;

use crate::win32::uia_list::named_list_rows;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(super) struct ChatPreview {
    pub(super) contact: String,
    pub(super) body: String,
}

pub(super) struct Conversation {
    key: String,
    preview: ChatPreview,
    unread: u32,
    muted: bool,
    mentioned: bool,
}

const MUTED: &[&str] = &["消息免打扰", "免打扰", "静音", "Muted", "Do Not Disturb"];
const LABELS: &[&str] = &[
    "已置顶",
    "置顶聊天",
    "折叠的聊天",
    "有新消息",
    "以下为新消息",
    "服务号",
    "Pinned",
    "New messages",
];
const MENTIONS: &[&str] = &["有人@我", "@我", "@所有人", "Mentioned you", "@You", "@All"];

pub(super) fn read(window: HWND) -> Option<Vec<Conversation>> {
    let rows = named_list_rows(window, "session_item_")?;
    let conversations: Vec<_> = rows
        .into_iter()
        .filter_map(|(key, name)| parse_row(key, &name))
        .collect();
    (!conversations.is_empty()).then_some(conversations)
}

fn parse_row(key: String, name: &str) -> Option<Conversation> {
    let mut lines = name.lines().map(str::trim).filter(|line| !line.is_empty());
    let contact = lines.next()?;
    let mut row = Conversation {
        key,
        preview: ChatPreview {
            contact: contact.chars().take(128).collect(),
            body: String::new(),
        },
        unread: 0,
        muted: false,
        mentioned: false,
    };
    let mut after_time = false;
    let mut summary = None;
    for line in lines {
        if MUTED.contains(&line) {
            row.muted = true;
        } else if !after_time {
            if let Some(count) = unread_count(line) {
                row.unread = count;
            } else if LABELS.contains(&line) {
                continue;
            } else if MENTIONS.contains(&line) {
                row.mentioned = true;
            } else if is_time_label(line) {
                after_time = true;
            } else {
                row.mentioned |= MENTIONS.iter().any(|mark| {
                    line.strip_prefix('[')
                        .and_then(|line| line.strip_prefix(mark))
                        .is_some_and(|tail| tail.starts_with(']'))
                });
                if summary.is_none() || contact != "服务号" {
                    summary = Some(line);
                }
            }
        }
    }
    if let Some(text) = summary {
        row.preview.body = text.chars().take(512).collect();
    }
    Some(row)
}

fn unread_count(line: &str) -> Option<u32> {
    let number = if let Some(bracketed) = line
        .strip_prefix('[')
        .and_then(|text| text.strip_suffix(']'))
    {
        bracketed.trim().trim_end_matches('条')
    } else {
        [
            "条未读消息",
            "条未读",
            "条新消息",
            " unread messages",
            " unread message",
            " unread",
            " new messages",
        ]
        .iter()
        .find_map(|suffix| line.strip_suffix(suffix))?
    };
    let digits = number.trim().trim_end_matches('+');
    digits
        .bytes()
        .all(|ch| ch.is_ascii_digit())
        .then(|| digits.parse().ok())
        .flatten()
}

fn is_time_label(line: &str) -> bool {
    line.split_whitespace().all(|part| {
        if let Some((hour, minute)) = part.split_once(':') {
            return (1..=2).contains(&hour.len())
                && minute.len() == 2
                && hour.parse::<u8>().is_ok_and(|h| h < 24)
                && minute.parse::<u8>().is_ok_and(|m| m < 60);
        }
        let numeric = part.split(['/', '-']).collect::<Vec<_>>();
        (2..=3).contains(&numeric.len())
            && numeric.iter().all(|value| {
                (1..=4).contains(&value.len()) && value.bytes().all(|ch| ch.is_ascii_digit())
            })
            || [
                "昨天",
                "前天",
                "刚刚",
                "Yesterday",
                "AM",
                "PM",
                "Mon",
                "Tue",
                "Wed",
                "Thu",
                "Fri",
                "Sat",
                "Sun",
            ]
            .contains(&part)
            || part
                .strip_prefix("星期")
                .or_else(|| part.strip_prefix("周"))
                .is_some_and(|day| ["一", "二", "三", "四", "五", "六", "日", "天"].contains(&day))
    })
}

pub(super) fn new_previews(
    before: &[Conversation],
    after: &[Conversation],
    limit: usize,
) -> Vec<ChatPreview> {
    let previous: HashMap<_, _> = before.iter().map(|row| (row.key.as_str(), row)).collect();
    after
        .iter()
        .filter(|row| {
            if row.preview.body.is_empty() || row.muted && !row.mentioned {
                return false;
            }
            // A different preview without new unread evidence can be the user's own reply.
            let old = previous.get(row.key.as_str());
            row.unread > old.map_or(0, |row| row.unread)
                || row.mentioned && old.is_none_or(|old| !old.mentioned)
        })
        .take(limit)
        .map(|row| row.preview.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(key: &str, name: &str) -> Conversation {
        parse_row(key.into(), name).unwrap()
    }

    #[test]
    fn parses_a_private_chat_and_retains_a_group_sender() {
        let dm = row("1", "小林\r\n[2条]\r\n下午开会吗？\r\n12:41");
        assert_eq!(
            (
                dm.preview.contact.as_str(),
                dm.preview.body.as_str(),
                dm.unread
            ),
            ("小林", "下午开会吗？", 2)
        );
        let group = row("2", "项目群\n[3]\n李四: 请看附件\n昨天 18:00\n消息免打扰");
        assert_eq!(group.preview.body, "李四: 请看附件");
        assert!(group.muted);
        assert_eq!(
            row("3", "Alex\n2 unread messages\nHello\n9:45 AM").unread,
            2
        );
    }

    #[test]
    fn ignores_own_replies_muted_chats_and_repeated_flashes() {
        let before = [
            row("1", "小林\n[2条]\n上午好\n8:15"),
            row("2", "项目群\n李四: 请看附件\n昨天\n消息免打扰"),
        ];
        let after = [
            row("1", "小林\n[2条]\n我晚点回复\n8:18"),
            row("2", "项目群\n[2条]\n李四: 有事@我\n8:19\n消息免打扰"),
        ];
        assert!(new_previews(&before, &after, 20).is_empty());
        let mention = [
            row("1", "小林\n[3条]\n我晚点回复\n8:19"),
            row(
                "2",
                "项目群\n[2条]\n[有人@我] 李四: 请查收\n8:19\n消息免打扰",
            ),
        ];
        assert_eq!(new_previews(&after, &mention, 20).len(), 2);
        assert!(new_previews(&mention, &mention, 20).is_empty());
    }
}
