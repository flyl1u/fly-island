import features from "../../release-features.json" with { type: "json" };

/** Shared with the native build; saved preferences survive temporary unavailability. */
export const PLUGINS_ENABLED: boolean = features.plugins;
export const MAIL_OTP_ENABLED: boolean = features.mailOtp;
