import type { OfficeClientState, OfficeImSnapshot } from "../../src/features/messages/office-im/api";

const client = (pending: boolean): OfficeClientState => ({
  enabled: true, status: "listening", pending, lastAttentionAt: pending ? Date.now() - 90_000 : null, error: null,
});

/** DingTalk flashing, Feishu and WeCom quiet (or all quiet with ?empty=1). */
export function tourOffice(empty: boolean): OfficeImSnapshot {
  return { revision: 1, dingtalk: client(!empty), feishu: client(false), wecom: client(false) };
}

/** Every market plugin installed, office clients on, tabs in the default order. */
export function installTourPlugins() {
  localStorage.setItem("focusd-island-native-plugins", JSON.stringify(["dingtalk", "feishu", "wecom", "cursor", "kimiCode", "zcode", "hermes"]));
  localStorage.removeItem("focusd-island-office-im-enabled");
  localStorage.removeItem("focusd-island-message-source-order");
}
