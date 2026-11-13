import assert from "node:assert/strict";
import test from "node:test";
import { formatMessageCardTime, splitMessageSender } from "../../src/features/messages/messageCardText.ts";
import { zhCN, en } from "../../src/i18n/sections/messages.ts";

const date = (year, month, day, hour = 14, minute = 5) => new Date(year, month - 1, day, hour, minute).getTime();
for (const [locale, text] of [["zh-CN", zhCN], ["en", en]]) {
  test(`${locale}: today, yesterday and older notifications use 24-hour local dates`, () => {
    const now = date(2026, 11, 12, 20);
    assert.equal(formatMessageCardTime(date(2026, 11, 12), now, text.yesterday), "14:05");
    assert.equal(formatMessageCardTime(date(2026, 11, 11), now, text.yesterday), `${text.yesterday} 14:05`);
    assert.equal(formatMessageCardTime(date(2026, 11, 10), now, text.yesterday), "11/10 14:05");
    assert.equal(formatMessageCardTime(date(2026, 12, 31, 0, 0), date(2027, 1, 1), text.yesterday), `${text.yesterday} 00:00`);
    assert.equal(formatMessageCardTime(date(2026, 3, 8, 0, 5), date(2026, 3, 9, 0, 1), text.yesterday), `${text.yesterday} 00:05`);
    assert.equal(formatMessageCardTime(NaN, now, text.yesterday), "");
  });
}

test("splits the first Chinese or English colon and preserves the original text", () => {
  for (const body of ["李四：请看附件", "Alice: please see https://example.com", " 张三 ： 内容: 保留冒号", `${"甲".repeat(24)}:content`]) {
    const result = splitMessageSender(body);
    assert.ok(result);
    assert.equal(result.sender + result.separator + result.content, body);
  }
  assert.equal(splitMessageSender("李四：请看附件").sender, "李四");
  assert.equal(splitMessageSender("Alice: hello").sender, "Alice");
});

test("ambiguous prefixes stay unmodified", () => {
  for (const body of ["普通消息", "", ":hello", " :hello", "Alice: ", `${"甲".repeat(25)}:hello`, "line\nbreak:hello", "https://example.com", "14:05", "Really? yes"]) {
    assert.equal(splitMessageSender(body), null, body);
  }
});
