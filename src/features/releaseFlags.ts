import features from "../../release-features.json" with { type: "json" };

/** Shared with the native build; saved preferences survive temporary unavailability. */
export const PLUGINS_ENABLED: boolean = features.plugins;
export const MAIL_OTP_ENABLED: boolean = features.mailOtp;
/**
 * The built-in plugin market (DingTalk / Feishu / WeCom, Cursor, Kimi Code, Hermes, Z Code, time and
 * weather). It had a beta first (3.2.7 without it, 3.2.8-beta with it) and is on from 3.2.8 (用户要求
 * 2026-11-19); while off nothing counts as installed, so the island and settings look as they did in 3.2.6.
 */
export const PLUGIN_MARKET_ENABLED: boolean = features.pluginMarket;
export const PLUGIN_RUNTIME_ENABLED = PLUGINS_ENABLED || PLUGIN_MARKET_ENABLED;
