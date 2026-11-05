import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MAIL_ACCOUNTS, normalizeMailAccounts, orderMailboxes, rememberMailbox, totalUnread, upsertMailbox,
} from "../../src/features/messages/qq-mail/mailAccounts.ts";

const box = (email, extra = {}) => ({
  revision: 1, email, configured: true, enabled: true, syncing: false, status: "connected",
  unreadCount: 0, items: [], lastSyncedAt: null, error: null, ...extra,
});
const removed = (email) => box(email, { configured: false, enabled: false, status: "disconnected" });

test("saved mail settings migrate from the single-account format", () => {
  assert.deepEqual(normalizeMailAccounts({ email: " A@QQ.com ", enabled: false }), [{ email: "a@qq.com", host: "", enabled: false }]);
  assert.deepEqual(normalizeMailAccounts({ accounts: [
    { email: "a@qq.com", host: "imap.qq.com", enabled: true },
    { email: "A@qq.com", enabled: false },
    { email: "b@163.com", enabled: "yes" },
    { email: "c@163.com", enabled: true },
  ] }), [
    { email: "a@qq.com", host: "imap.qq.com", enabled: true },
    { email: "c@163.com", host: "", enabled: true },
  ]);
  for (const stored of [null, "x", 3, {}, { accounts: "x" }, { email: "", enabled: true }]) {
    assert.deepEqual(normalizeMailAccounts(stored), []);
  }
  const many = Array.from({ length: 9 }, (_, i) => ({ email: `u${i}@qq.com`, enabled: true }));
  assert.equal(normalizeMailAccounts({ accounts: many }).length, MAX_MAIL_ACCOUNTS);
});

test("snapshots update in place, append and drop forgotten mailboxes", () => {
  const a = box("a@qq.com");
  const b = box("b@163.com");
  let list = upsertMailbox(upsertMailbox([], a), b);
  assert.deepEqual(list.map((s) => s.email), ["a@qq.com", "b@163.com"]);
  list = upsertMailbox(list, box("a@qq.com", { unreadCount: 3 }));
  assert.equal(list[0].unreadCount, 3);
  list = upsertMailbox(list, removed("a@qq.com"));
  assert.deepEqual(list.map((s) => s.email), ["b@163.com"]);
  assert.equal(upsertMailbox(list, box(null)), list);
});

test("mailboxes follow the saved order and the saved list tracks connections", () => {
  const saved = [{ email: "b@163.com", host: "", enabled: true }, { email: "a@qq.com", host: "", enabled: true }];
  assert.deepEqual(orderMailboxes([box("x@126.com"), box("a@qq.com"), box("b@163.com")], saved).map((s) => s.email),
    ["b@163.com", "a@qq.com", "x@126.com"]);
  let next = rememberMailbox(saved, box("c@126.com"), "imap.126.com");
  assert.deepEqual(next.at(-1), { email: "c@126.com", host: "imap.126.com", enabled: true });
  next = rememberMailbox(next, box("b@163.com", { enabled: false }), "ignored");
  assert.deepEqual(next[0], { email: "b@163.com", host: "", enabled: false });
  assert.equal(rememberMailbox(next, box("d@qq.com", { configured: false, status: "connecting" })), next);
  assert.deepEqual(rememberMailbox(next, removed("a@qq.com")).map((a) => a.email), ["b@163.com", "c@126.com"]);
});

test("the unread total counts only mailboxes that are receiving", () => {
  assert.equal(totalUnread([box("a@qq.com", { unreadCount: 2 }), box("b@163.com", { unreadCount: 5, enabled: false }), box("c@126.com", { unreadCount: null })]), 2);
});
