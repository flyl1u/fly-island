import assert from "node:assert/strict";
import test from "node:test";
import { latestMessagePreview, mailBadgeCount, messagePreviewText } from "../../src/features/messages/messagePreview.ts";

test("collapsed previews use source-specific copy and blank-content fallbacks", () => {
  assert.equal(messagePreviewText({ source: "wechat", title: "", body: "", receivedAt: 0 }), "你收到了一条消息");
  assert.equal(messagePreviewText({ source: "wechat", title: "小林", body: "下午见", receivedAt: 0 }), "小林：下午见");
  assert.equal(messagePreviewText({ source: "qq", title: " 小林 ", body: " 下午一起开会 ", receivedAt: 0 }), "小林：下午一起开会");
  assert.equal(messagePreviewText({ source: "qqMail", title: "发件人", body: " 项目周报 ", receivedAt: 0 }), "项目周报");
  assert.equal(messagePreviewText({ source: "qq", title: " ", body: " ", receivedAt: 0 }), "QQ：收到一条新消息");
  assert.equal(messagePreviewText({ source: "qqMail", title: "", body: "", receivedAt: 0 }), "收到一封新邮件");
});

test("QQ, WeChat and mail share the preview by most recent arrival", () => {
  const qq = { source: "qq", title: "QQ", body: "message", receivedAt: 100 };
  const wechat = { source: "wechat", title: "微信", body: "reminder", receivedAt: 200 };
  const mail = { source: "qqMail", title: "sender", body: "subject", receivedAt: 300 };
  assert.equal(latestMessagePreview([qq, wechat, mail]), mail);
  assert.equal(latestMessagePreview([mail, { ...qq, receivedAt: 400 }, wechat]).source, "qq");
  assert.equal(latestMessagePreview([qq, mail, { ...wechat, receivedAt: 500 }]).source, "wechat");
  assert.equal(latestMessagePreview([null, qq, null]), qq);
  assert.equal(latestMessagePreview([null, null, null]), null);
});

test("mail badges bound the width without changing actual unread counts", () => {
  assert.equal(mailBadgeCount(0), "0");
  assert.equal(mailBadgeCount(99), "99");
  assert.equal(mailBadgeCount(100), "99+");
  assert.equal(mailBadgeCount(12345), "99+");
});

test("an expired newer message never reveals an older source again", () => {
  const older = { source: "wechat", title: "微信", body: "reminder", receivedAt: 100 };
  const newer = { source: "qq", title: "好友", body: "message", receivedAt: 200 };
  assert.equal(latestMessagePreview([older, newer], 200), newer);
  assert.equal(latestMessagePreview([older, null], 200), null);
  assert.equal(latestMessagePreview([{ ...older, receivedAt: 300 }, null], 200).source, "wechat");
});
