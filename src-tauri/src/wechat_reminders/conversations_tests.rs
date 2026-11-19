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
fn muted_chats_pass_only_a_mention_of_me_and_explain_their_own_flashes() {
    let rows = |dm: &str, group: &str| {
        [
            row("dm", &format!("小林\n{dm}\n8:15")),
            row("g", &format!("大群\n{group}\n8:16\n消息免打扰")),
        ]
    };
    let before = rows("上午好", "张三: 早");
    let everyone = rows("上午好", "[@所有人] 群主: 通知");
    assert!(new_previews(&before, &everyone, ReadTrigger::Poll, 20).is_empty());
    assert!(only_muted_changed(&before, &everyone));
    let me = rows("上午好", "[有人@我] 李四: 看下");
    assert_eq!(new_previews(&everyone, &me, ReadTrigger::Poll, 20).len(), 1);
    assert!(!only_muted_changed(&everyone, &me));
    assert!(!only_muted_changed(&everyone, &rows("[1条]\n在吗", "王五: 好")));
    assert!(!only_muted_changed(&before, &before));
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
