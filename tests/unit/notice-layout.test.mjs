import assert from "node:assert/strict";
import test from "node:test";
import { getNoticeSize } from "../../src/windows/island/noticeLayout.ts";
import { noticeText } from "../../src/features/messages/messagePreview.ts";

const limits = { maxWidth: 520, maxHeight: 180, baseWidth: 340, baseHeight: 38, fontScale: 1, collapsedScale: 1 };

test("a message that fits the one-line preview does not grow the island", () => {
  assert.equal(getNoticeSize({ sender: "张三", body: "好的" }, limits), null);
});

test("a longer message widens the island first, then wraps and grows taller", () => {
  const medium = getNoticeSize({ sender: "张三", body: "明天下午三点在三楼会议室开会，记得带电脑" }, limits);
  assert.ok(medium && medium.width > limits.baseWidth && medium.width <= limits.maxWidth);
  assert.equal(medium.reader, false);
  assert.equal(medium.height, limits.baseHeight);
  const long = getNoticeSize({ sender: "张三", body: "这是一条很长的消息。".repeat(12) }, limits);
  assert.equal(long.width, 516);
  assert.equal(long.reader, true);
  assert.ok(long.height > medium.height && long.height <= limits.maxHeight);
});

test("past the limits the reader scrolls, and the stage bounds the size at any scale", () => {
  const huge = getNoticeSize({ sender: "群", body: "很长的消息".repeat(200) }, limits);
  assert.equal(huge.height, 180);
  assert.equal(huge.scrolls, true);
  const scaled = getNoticeSize({ sender: "群", body: "很长的消息".repeat(200) }, { ...limits, maxWidth: 720, maxHeight: 360, collapsedScale: 1.4 });
  assert.ok(scaled.width * 1.4 <= 780 && scaled.height * 1.4 <= 436);
  assert.equal((scaled.width - 4) % 8, 0);
});

test("line breaks in a message each start a line", () => {
  const lines = getNoticeSize({ sender: "a", body: "1\n2\n3\n4" }, limits);
  const one = getNoticeSize({ sender: "a", body: "1\n2" }, limits);
  assert.ok(lines.height > one.height);
});

test("mail always has a reader, preserving blank lines and respecting a smaller maximum width", () => {
  const mail = getNoticeSize({ sender: "Mail", body: "Code 123456" }, { ...limits, forceReader: true });
  assert.equal(mail.reader, true);
  assert.ok(mail.height > limits.baseHeight);
  const narrow = getNoticeSize({ sender: "Mail", body: "Long text ".repeat(60) }, { ...limits, baseWidth: 480, maxWidth: 320 });
  assert.ok(narrow.width <= 320);
  const blank = getNoticeSize({ sender: "Mail", body: "a\n\n\nb" }, limits);
  const plain = getNoticeSize({ sender: "Mail", body: "a\nb" }, limits);
  assert.ok(blank.height > plain.height);
});

test("game notice opt-in overrides tuck preferences only while quiet", async () => {
  const { canPreviewNotice } = await import("../../src/windows/island/noticeRules.ts");
  const settings = { gameShowNotices: false, revealOnMessage: false };
  assert.equal(canPreviewNotice(settings, true, "collapsed", false), false);
  assert.equal(canPreviewNotice({ ...settings, gameShowNotices: true }, true, "collapsed", true), true);
  assert.equal(canPreviewNotice({ ...settings, gameShowNotices: true }, false, "collapsed", true), false);
  assert.equal(canPreviewNotice({ ...settings, gameShowNotices: true }, true, "expanded", false), false);
});

test("notice text keeps the sender apart from the whole message", () => {
  assert.deepEqual(noticeText({ source: "qqMail", title: "GitHub", body: "Your PR was merged", receivedAt: 1 }), { sender: "GitHub", body: "Your PR was merged" });
  assert.equal(noticeText({ source: "wechat", title: "", body: "", receivedAt: 1 }).sender, "微信");
});

test("preview seconds: game mode's own while quiet, the adaptive preview's, else the usual", async () => {
  const { previewSecondsFor, noticePassesClicks } = await import("../../src/windows/island/noticeRules.ts");
  const settings = { messagePreviewSeconds: 5, messageAutoExpand: false, messageExpandSeconds: 12, gameShowNotices: true, gameNoticeSeconds: 3 };
  assert.equal(previewSecondsFor(settings, false), 5);
  assert.equal(previewSecondsFor({ ...settings, messageAutoExpand: true }, false), 12);
  assert.equal(previewSecondsFor({ ...settings, messageAutoExpand: true }, true), 3);
  assert.equal(previewSecondsFor({ ...settings, gameShowNotices: false }, true), 5);
  assert.equal(noticePassesClicks(true, true, "collapsed"), true);
  assert.equal(noticePassesClicks(true, false, "collapsed"), false);
  assert.equal(noticePassesClicks(false, true, "collapsed"), false);
});

test("game mode previews only when asked to; otherwise a tucked island needs reveal-on-message", async () => {
  const { canPreviewNotice } = await import("../../src/windows/island/noticeRules.ts");
  const on = { gameShowNotices: true, revealOnMessage: false };
  assert.equal(canPreviewNotice(on, true, "collapsed", true), true);
  assert.equal(canPreviewNotice({ ...on, gameShowNotices: false }, true, "collapsed", false), false);
  assert.equal(canPreviewNotice(on, false, "collapsed", true), false);
  assert.equal(canPreviewNotice({ ...on, revealOnMessage: true }, false, "collapsed", true), true);
  assert.equal(canPreviewNotice(on, true, "expanded", false), false);
});

test("a mail notice adds the loaded body, as plain text, under the subject", async () => {
  const body = noticeText({ source: "qqMail", title: "GitHub", body: "PR merged", detail: "  Details here  ", receivedAt: 1 }).body;
  assert.equal(body, "PR merged\n\nDetails here");
  const { mailContentText } = await import("../../src/features/messages/mail/mailText.ts");
  assert.equal(mailContentText({ id: "1", content: "  hi\n", contentType: "text/plain", attachments: [] }), "hi");
});

test("what the laid-out preview still overflowed by grows the island past the estimate", () => {
  // The estimate says it fits; status icons beside the text cut it off, as measured.
  const short = { sender: "张三", body: "好的" };
  assert.equal(getNoticeSize(short, limits), null);
  const widened = getNoticeSize(short, { ...limits, measuredOverflow: 60 });
  assert.ok(widened && widened.width >= limits.baseWidth + 60 && widened.reader === false);
  // Past the width limit it turns into the reader instead of staying cut off.
  const medium = { sender: "张三", body: "明天下午三点在三楼会议室开会，记得带电脑" };
  assert.equal(getNoticeSize(medium, { ...limits, measuredOverflow: 300 }).reader, true);
});

test("a short message's reader is only as wide as the message, even narrower than a wide island", () => {
  const short = getNoticeSize({ sender: "安好", body: "换手机呢" }, { ...limits, baseWidth: 480, forceReader: true });
  assert.ok(short.reader && short.width < 480 && short.width >= 240);
  const long = getNoticeSize({ sender: "安好", body: "明天下午三点在三楼会议室开项目评审会，请准备材料".repeat(2) }, { ...limits, baseWidth: 480, forceReader: true });
  assert.ok(long.width > short.width);
});
