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
fn filters_official_accounts_by_internal_id_and_name() {
    for (key, contact) in [
        ("gh_example", "品牌账号"),
        ("brandsessionholder", "订阅号消息"),
        ("brandservicesessionholder", "服务号"),
        ("notifymessage", "服务通知"),
        ("officialaccounts", "公众号"),
        ("wechat-pay", "微信支付"),
        ("wechat-sports", "微信运动"),
        ("wechat-team", "微信团队"),
        ("tencent-news", "腾讯新闻"),
        ("ordinary-key", "Official Accounts"),
        ("ordinary-public", "Public Account"),
        ("ordinary-public-message", "Public Account Message"),
        ("ordinary-subscription-message", "Subscription Account Message"),
        ("ordinary-service", "Service Notice"),
        ("ordinary-service-message", "Service Account Message"),
    ] {
        let conversation = row(key, &format!("{contact}\n[1条]\n公告\n12:00"));
        assert!(conversation.official_account, "{key}: {contact}");
        assert!(!conversation.can_preview(), "{key}: {contact}");
    }
}

#[test]
fn keeps_contacts_groups_and_file_helper_eligible() {
    for (key, name) in [
        ("wxid_contact", "小林\n[1条]\n下午开会吗？\n12:41"),
        ("room_project", "项目群\n[1条]\n李四: 请看附件\n12:42"),
        ("filehelper", "文件传输助手\n[1条]\n报告.pdf\n12:43"),
    ] {
        let conversation = row(key, name);
        assert!(!conversation.official_account, "{key}");
        assert!(conversation.can_preview(), "{key}");
    }
}

#[test]
fn an_official_only_change_is_explained_like_a_muted_change() {
    for (key, contact) in [("gh_example", "公众号"), ("notifymessage", "服务通知")] {
        let before = [row(
            key,
            &format!("{contact}\n[1条]\n旧通知\n12:00"),
        )];
        let after = [row(
            key,
            &format!("{contact}\n[2条]\n新通知\n12:01"),
        )];
        assert!(new_previews(&before, &after, ReadTrigger::Poll, 20).is_empty());
        assert!(only_muted_changed(&before, &after));
    }
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

#[test]
fn the_folded_chats_row_stays_quiet_like_a_muted_chat() {
    for (key, contact) in [
        ("session_item_折叠的聊天", "折叠的聊天"),
        ("session_item_@placeholder_foldgroup", "Folded Chats"),
    ] {
        let rows = |unread: &str, body: &str| {
            [
                row("dm", "小林\n上午好\n8:15"),
                row(key, &format!("{contact}\n{unread}\n{body}\n8:16")),
            ]
        };
        let before = rows("[1条]", "大群: 张三: 早");
        let after = rows("[3条]", "大群: 李四: 好");
        assert!(after[1].muted);
        assert!(new_previews(&before, &after, ReadTrigger::Poll, 20).is_empty());
        let flash = ReadTrigger::Flash {
            allow_selected: true,
        };
        assert!(new_previews(&before, &after, flash, 20).is_empty());
        assert!(only_muted_changed(&before, &after));
        let me = rows("[4条]", "[有人@我] 大群: 王五: 看下");
        assert_eq!(new_previews(&after, &me, ReadTrigger::Poll, 20).len(), 1);
    }
    assert!(row("f", "大群\n折叠的聊天\n张三: 早\n8:16").muted);
}

#[test]
fn a_count_in_front_of_the_summary_is_read_as_unread() {
    // WeChat 4.1.9.35, 2026-11-19: muted rows carry their count on the summary line.
    let group = row(
        "g",
        "🎵vibe-motion 1群\n[28条] GG: [视频号] 激光小野牛的动态\n06:08\n消息免打扰\n",
    );
    assert_eq!(
        (group.unread, group.preview.body.as_str(), group.muted),
        (28, "GG: [视频号] 激光小野牛的动态", true)
    );
    let mention = row("g", "大群\n[29条] [有人@我] 李四: 看下\n06:09\n消息免打扰");
    assert!(mention.mentions_me);
    assert_eq!(mention.preview.body, "[有人@我] 李四: 看下");
    assert_eq!(row("e", "小林\n[动画表情] \n03:17").preview.body, "[动画表情]");
}
