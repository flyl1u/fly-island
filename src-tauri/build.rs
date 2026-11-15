fn main() {
    tauri_build::build();
    println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
    println!("cargo:rustc-link-lib=delayimp");
}
