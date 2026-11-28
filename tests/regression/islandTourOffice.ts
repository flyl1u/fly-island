import type { OfficeClientState, OfficeImSnapshot } from "../../src/features/messages/office-im/api";
import { DEFAULT_CENTERED_CLOCK_SETTINGS } from "../../src/features/centered-clock/model.ts";
import { CENTERED_CLOCK_KEY } from "../../src/features/centered-clock/storage.ts";

const client = (pending: boolean): OfficeClientState => ({
  enabled: true, status: "listening", pending, lastAttentionAt: pending ? Date.now() - 90_000 : null, error: null,
});

/** DingTalk flashing, Feishu and WeCom quiet (or all quiet with ?empty=1). */
export function tourOffice(empty: boolean): OfficeImSnapshot {
  return { revision: 1, dingtalk: client(!empty), feishu: client(false), wecom: client(false) };
}

/** Every market plugin installed, office clients on, tabs in the default order. */
export function installTourPlugins() {
  const plugins = ["dingtalk", "feishu", "wecom", "cursor", "kimiCode", "zcode", "hermes"];
  if (new URLSearchParams(location.search).has("centeredClock")) {
    plugins.push("clockWeather", "centeredClock");
    localStorage.setItem("fly-island-clock-weather", JSON.stringify({ showClock: true, showWeather: false, location: null }));
    localStorage.setItem(CENTERED_CLOCK_KEY, JSON.stringify({ ...DEFAULT_CENTERED_CLOCK_SETTINGS, showDate: true }));
  }
  localStorage.setItem("fly-island-native-plugins", JSON.stringify(plugins));
  localStorage.removeItem("fly-island-office-im-enabled");
  localStorage.removeItem("fly-island-message-source-order");
}
