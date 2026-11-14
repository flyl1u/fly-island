import test from "node:test";
import assert from "node:assert/strict";
import { weChatOpenErrorText } from "../../src/features/messages/wechat/openError.ts";
import { en, zhCN } from "../../src/i18n/sections/wechat.ts";

test("open_wechat error codes become hints in the UI language", () => {
  assert.equal(weChatOpenErrorText("wechat-open:restore-failed", zhCN.openErrors), zhCN.openErrors["restore-failed"]);
  assert.equal(weChatOpenErrorText("wechat-open:not-installed", en.openErrors), en.openErrors["not-installed"]);
});

test("unknown codes and other errors pass through unchanged", () => {
  assert.equal(weChatOpenErrorText("wechat-open:toString", en.openErrors), "wechat-open:toString");
  assert.equal(weChatOpenErrorText("微信提醒状态不可用。", en.openErrors), "微信提醒状态不可用。");
});
