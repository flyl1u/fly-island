//! Compile-time switches from the shared release-features.json.

pub const PLUGINS_ENABLED: bool = cfg!(focusd_plugins);
pub const MAIL_OTP_ENABLED: bool = cfg!(focusd_mail_otp);
