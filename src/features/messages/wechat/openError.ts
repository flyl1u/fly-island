import type { WechatText } from "../../../i18n/sections/wechat";

const PREFIX = "wechat-open:";

/** Turns an error code from open_wechat (wechat_reminders/launch.rs) into a hint in the UI language; other errors pass through. */
export function weChatOpenErrorText(error: unknown, text: WechatText["openErrors"]) {
  const message = String(error);
  if (!message.startsWith(PREFIX)) return message;
  const code = message.slice(PREFIX.length);
  return Object.prototype.hasOwnProperty.call(text, code) ? text[code as keyof WechatText["openErrors"]] : message;
}
