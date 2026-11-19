import features from "../../release-features.json" with { type: "json" };

/** Shared with the native build; saved preferences survive temporary unavailability. */
export const PLUGINS_ENABLED: boolean = features.plugins;
export const MAIL_OTP_ENABLED: boolean = features.mailOtp;
/**
 * The built-in plugin market (DingTalk / Feishu / WeCom, Cursor, Kimi Code, Hermes, Z Code). Off in
 * stable releases until it has had a beta (用户要求 2026-11-19：3.2.7 不带插件，3.2.8-beta 带);
 * while off nothing counts as installed, so the island and settings look as they did in 3.2.6.
 */
export const PLUGIN_MARKET_ENABLED: boolean = features.pluginMarket;
