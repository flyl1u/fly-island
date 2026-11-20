//! Compile-time switches from the shared release-features.json.

pub const PLUGINS_ENABLED: bool = cfg!(fly_island_plugins);
pub const MAIL_OTP_ENABLED: bool = cfg!(fly_island_mail_otp);
