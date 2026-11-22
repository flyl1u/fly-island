//! Compile-time switches from the shared release-features.json.

pub const PLUGINS_ENABLED: bool = cfg!(fly_island_plugins);
pub const MAIL_OTP_ENABLED: bool = cfg!(fly_island_mail_otp);

pub fn plugin_market_enabled() -> bool {
    serde_json::from_str::<serde_json::Value>(include_str!("../../release-features.json"))
        .is_ok_and(|features| features["pluginMarket"] == true)
}
