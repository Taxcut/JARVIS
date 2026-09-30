fn main() {
    println!("cargo:rerun-if-changed=resources/Info.plist");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let root = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        println!("cargo:rustc-link-arg-bin=jarvis-runtime=-Wl,-sectcreate,__TEXT,__info_plist,{root}/resources/Info.plist");
    }
}
