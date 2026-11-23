fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=../release-features.json");
    let features: serde_json::Value = serde_json::from_str(include_str!("../release-features.json"))?;
    for (key, cfg) in [("plugins", "fly_island_plugins"), ("mailOtp", "fly_island_mail_otp")] {
        println!("cargo:rustc-check-cfg=cfg({cfg})");
        if features[key].as_bool().ok_or("release feature must be a boolean")? {
            println!("cargo:rustc-cfg={cfg}");
        }
    }
    tauri_build::build();
    println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
    println!("cargo:rustc-link-lib=delayimp");
    Ok(())
}
