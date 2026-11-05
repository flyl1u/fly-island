import assert from "node:assert/strict";
import test from "node:test";
import { hasQQMailHelp, mailWebUrl } from "../../src/features/messages/qq-mail/mailDomain.ts";

test("the webmail link follows the mailbox domain and falls back to QQ Mail", () => {
  assert.equal(mailWebUrl("x@163.com"), "https://mail.163.com/");
  assert.equal(mailWebUrl(" X@Example.EDU.cn "), "https://mail.example.edu.cn/");
  assert.equal(mailWebUrl("x@qq.com"), "https://mail.qq.com/");
  assert.equal(mailWebUrl("x@foxmail.com"), "https://mail.qq.com/");
  assert.equal(mailWebUrl(null), "https://mail.qq.com/");
  assert.equal(mailWebUrl("x@evil.com/path"), "https://mail.qq.com/");
});

test("the QQ Mail help shows while the address is empty or a QQ address", () => {
  assert.equal(hasQQMailHelp(""), true);
  assert.equal(hasQQMailHelp("x@qq.com"), true);
  assert.equal(hasQQMailHelp("x@foxmail.com"), true);
  assert.equal(hasQQMailHelp("x@163.com"), false);
});
