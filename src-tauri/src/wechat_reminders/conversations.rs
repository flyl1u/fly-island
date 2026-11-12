//! Parse the accessible names of WeChat's conversation rows and compare unread state.

use serde::Serialize;
use std::collections::HashMap;
use windows::Win32::Foundation::HWND;

use crate::win32::uia_list::{named_list_rows, ListRow};

pub(super) const SESSION_PREFIX: &str = "session_item_";

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(super) struct ChatPreview {
    #[serde(skip)]
    pub(super) key: String,
    pub(super) contact: String,
    pub(super) body: String,
}

pub(super) struct Conversation {
    preview: ChatPreview,
    unread: u32,
    muted: bool,
    mentioned: bool,
    selected: bool,
    pinned: bool,
    time: String,
}

impl Conversation {
    fn can_preview(&self) -> bool {
        !self.preview.body.is_empty() && (!self.muted || self.mentioned)
    }

    pub(super) fn matches_selected_preview(&self, preview: &ChatPreview) -> bool {
        self.selected && self.can_preview() && self.preview == *preview
    }
}

const MUTED: &[&str] = &["消息免打扰", "免打扰", "静音", "Muted", "Do Not Disturb"];
const PINNED: &[&str] = &["已置顶", "置顶聊天", "Pinned"];
const LABELS: &[&str] = &[
    "折叠的聊天",
    "有新消息",
    "以下为新消息",
    "服务号",
    "New messages",
];
const MENTIONS: &[&str] = &["有人@我", "@我", "@所有人", "Mentioned you", "@You", "@All"];

pub(super) fn read(window: HWND) -> Option<Vec<Conversation>> {
    let rows = named_list_rows(window, SESSION_PREFIX)?;
    let conversations: Vec<_> = rows.into_iter().filter_map(parse_row).collect();
    (!conversations.is_empty()).then_some(conversations)
}

pub(super) fn parse_row(
    ListRow {
        key,
        name,
        selected,
    }: ListRow,
) -> Option<Conversation> {
    let mut lines = name.lines().map(str::trim).filter(|line| !line.is_empty());
    let contact = lines.next()?;
    let mut row = Conversation {
        preview: ChatPreview {
            key,
            contact: contact.chars().take(128).collect(),
            body: String::new(),
        },
        unread: 0,
        muted: false,
        mentioned: false,
        selected,
        pinned: false,
        time: String::new(),
    };
    let labels: Vec<_> = lines.collect();
    let last_time = labels.iter().rposition(|line| is_time_label(line));
    let mut summary = None;
    for (index, line) in labels.into_iter().enumerate() {
        if MUTED.contains(&line) {
            row.muted = true;
        } else if PINNED.contains(&line) {
            row.pinned = true;
        } else if Some(index) == last_time {
            row.time = line.to_owned();
        } else if last_time.is_none_or(|time| index < time) {
            if let Some(count) = unread_count(line) {
                row.unread = count;
            } else if LABELS.contains(&line) {
                continue;
            } else if MENTIONS.contains(&line) {
                row.mentioned = true;
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

#[derive(Clone, Copy)]
pub(super) enum ReadTrigger {
    Flash { allow_selected: bool },
    Poll,
}

fn promoted_to_top<'a>(before: &[Conversation], after: &'a [Conversation]) -> Option<&'a str> {
    let was_top = &before.iter().find(|row| !row.pinned)?.preview.key;
    let mut unpinned = after.iter().filter(|row| !row.pinned);
    let top = &unpinned.next()?.preview.key;
    (top != was_top && &unpinned.next()?.preview.key == was_top).then_some(top)
}

fn selected_changed(row: &Conversation, old: &Conversation, promoted: Option<&str>) -> bool {
    row.selected
        && old.selected
        && (old.preview.body != row.preview.body
            || old.time != row.time
            || promoted == Some(row.preview.key.as_str()))
}

/// An open chat can update while its unread count stays at zero.
pub(super) fn selected_change(
    before: &[Conversation],
    after: &[Conversation],
) -> Option<ChatPreview> {
    let promoted = promoted_to_top(before, after);
    let current = after.iter().find(|row| row.selected && row.can_preview())?;
    let old = before
        .iter()
        .find(|row| row.preview.key == current.preview.key)?;
    selected_changed(current, old, promoted).then(|| current.preview.clone())
}

pub(super) fn new_previews(
    before: &[Conversation],
    after: &[Conversation],
    trigger: ReadTrigger,
    limit: usize,
) -> Vec<ChatPreview> {
    let previous: HashMap<_, _> = before
        .iter()
        .map(|row| (row.preview.key.as_str(), row))
        .collect();
    let promoted = promoted_to_top(before, after);
    after
        .iter()
        .filter(|row| {
            if !row.can_preview() {
                return false;
            }
            let key = row.preview.key.as_str();
            let old = previous.get(key).copied();
            let changed_unread = row.unread > old.map_or(0, |row| row.unread)
                || row.mentioned && old.is_none_or(|old| !old.mentioned);
            if changed_unread
                && (old.is_some()
                    || promoted == Some(key)
                    || matches!(trigger, ReadTrigger::Flash { .. }))
            {
                return true;
            }
            // WeChat keeps the selected chat's unread count at zero. A real flash can identify it
            // while the user has been away, but a background poll cannot distinguish a synced reply.
            matches!(
                trigger,
                ReadTrigger::Flash {
                    allow_selected: true
                }
            ) && old.is_some_and(|old| selected_changed(row, old, promoted))
        })
        .take(limit)
        .map(|row| row.preview.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(key: &str, name: &str) -> Conversation {
        parse_row(ListRow {
            key: key.into(),
            name: name.into(),
            selected: false,
        })
        .unwrap()
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
        assert!(new_previews(&before, &after, ReadTrigger::Poll, 20).is_empty());
        let mention = [
            row("1", "小林\n[3条]\n我晚点回复\n8:19"),
            row(
                "2",
                "项目群\n[2条]\n[有人@我] 李四: 请查收\n8:19\n消息免打扰",
            ),
        ];
        assert_eq!(
            new_previews(&after, &mention, ReadTrigger::Poll, 20).len(),
            2
        );
        assert!(new_previews(&mention, &mention, ReadTrigger::Poll, 20).is_empty());
    }

    #[test]
    fn selected_chat_needs_a_flash_and_no_visit_to_count_without_unread() {
        let selected = |name: &str| Conversation {
            selected: true,
            ..row("open", name)
        };
        let before = [
            row("other", "其他会话\n上一次\n12:00"),
            selected("当前会话\n好的\n12:05"),
        ];
        let after = [
            selected("当前会话\n好的\n12:05"),
            row("other", "其他会话\n上一次\n12:00"),
        ];
        assert_eq!(
            new_previews(
                &before,
                &after,
                ReadTrigger::Flash {
                    allow_selected: true
                },
                20
            )[0]
            .key,
            "open"
        );
        assert!(new_previews(
            &before,
            &after,
            ReadTrigger::Flash {
                allow_selected: false
            },
            20
        )
        .is_empty());
        assert!(new_previews(&before, &after, ReadTrigger::Poll, 20).is_empty());
        assert_eq!(selected("当前会话\n12:06\n12:07").preview.body, "12:06");
    }

    #[test]
    fn a_poll_notices_a_new_top_chat_without_replaying_other_old_unread_rows() {
        let before = [row("known", "现有会话\n上一次\n12:00")];
        let after = [
            row("new", "新会话\n[1条]\n收到\n12:05"),
            row("known", "现有会话\n上一次\n12:00"),
            row("older", "旧会话\n[3条]\n内容\n昨天"),
        ];
        let previews = new_previews(&before, &after, ReadTrigger::Poll, 20);
        assert_eq!(previews.len(), 1);
        assert_eq!(previews[0].key, "new");
    }
}
