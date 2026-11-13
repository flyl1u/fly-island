use super::*;
use std::{fs, path::PathBuf};
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!("focusd-plugin-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&p).unwrap(); Self(p)
    }
}
impl Drop for Temp { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
#[test]
fn pe_machine() {
    let mut b = vec![0;100]; b[..2].copy_from_slice(b"MZ"); b[60]=80; b[80..84].copy_from_slice(b"PE\0\0");
    b[84..86].copy_from_slice(&0x8664u16.to_le_bytes()); assert_eq!(netease::arch(&b),Some("x64"));
    b[84..86].copy_from_slice(&0x14cu16.to_le_bytes()); assert_eq!(netease::arch(&b),Some("x86"));
    for n in 0..86 { assert_eq!(netease::arch(&b[..n]),None); }
    b[60..64].copy_from_slice(&u32::MAX.to_le_bytes()); assert_eq!(netease::arch(&b),None);
}
#[test]
fn support_boundaries() {
    for v in ["3.1.20","3.1.41.205564"] { assert_eq!(netease::support(Some(v),Some("x64")),(true,true)); }
    for v in ["3.0.0","3.1.19","3.1.42","3.2.0"] { assert_eq!(netease::support(Some(v),Some("x64")),(true,false)); }
    assert_eq!(netease::support(Some("2.10.13"),Some("x86")),(true,true));
    for (v,a) in [("2.10.12","x86"),("2.10.13","x64"),("3.1.41","x86"),("4.0.0","x64"),("bad","x64")] { assert_eq!(netease::support(Some(v),Some(a)),(false,false)); }
}
#[test]
fn manifest_verification() {
    let t=Temp::new(); let p=t.0.join("asset"); fs::write(&p,b"abc").unwrap();
    let a=manifest::Asset { name:"test",url:"",size:3,sha256:"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" };
    assert!(download::verify(&p,&a)); fs::write(&p,b"abd").unwrap(); assert!(!download::verify(&p,&a));
    fs::write(&p,b"abcd").unwrap(); assert!(!download::verify(&p,&a));
    for a in [&manifest::X64,&manifest::X86,&manifest::PLUGIN] { assert_eq!(a.sha256.len(),64); assert!(a.sha256.bytes().all(|b| b.is_ascii_hexdigit())); assert!(a.size>0); }
}
#[test]
fn elevated_validation() {
    let t=Temp::new(); let p=t.0.join("msimg32.dll"); assert!(!elevated::valid_target(&p));
    fs::write(t.0.join("cloudmusic.exe"),b"test").unwrap(); assert!(elevated::valid_target(&p));
    assert!(!elevated::valid_target(&t.0.join("bad.dll"))); assert!(!elevated::valid_target(&t.0.join("../msimg32.dll")));
    assert!(elevated::execute(&[]).is_err());
    assert!(elevated::execute(&["--media-plugin-remove".into(),p.to_string_lossy().into_owned(),"bad".into()]).is_err());
}
#[test]
fn foreign_and_legacy() {
    let t=Temp::new(); let plugins=t.0.join("plugins"); fs::create_dir(&plugins).unwrap();
    assert_eq!(netease::state_at(&t.0,&plugins),("none",false)); fs::write(t.0.join("msimg32.dll"),b"foreign").unwrap();
    assert_eq!(netease::state_at(&t.0,&plugins),("foreignLoader",false)); fs::write(plugins.join("InfLink.plugin"),b"old").unwrap();
    assert_eq!(netease::state_at(&t.0,&plugins),("foreignLoader",true));
    assert!(manifest::loader_hash(manifest::X64.sha256)); assert!(!manifest::loader_hash(manifest::PLUGIN.sha256));
}
#[test]
fn uninstall_ownership() {
    let t=Temp::new(); let one=t.0.join("one"); let two=t.0.join("two"); let other=t.0.join("other");
    for p in [&one,&two,&other] { fs::write(p,b"original").unwrap(); }
    let hash=download::hash(&one).unwrap();
    let r=record::Record { version:1,installed_at:0,files:vec![record::InstalledFile { path:one.clone(),sha256:hash.clone() },record::InstalledFile { path:two.clone(),sha256:hash }] };
    fs::write(&two,b"changed").unwrap(); let kept=service::remove_recorded(&r, |_| true).unwrap();
    assert!(!one.exists()); assert!(two.exists()); assert!(other.exists()); assert_eq!(kept,vec![two.to_string_lossy().into_owned()]);
}
#[test]
fn tolerant_record() {
    let t=Temp::new(); let p=t.0.join("record.json"); assert!(record::read(&p).files.is_empty());
    for s in ["invalid","{}",r#"{"version":2,"files":[],"installedAt":0}"#] { fs::write(&p,s).unwrap(); assert!(record::read(&p).files.is_empty()); }
    record::write(&p,&record::Record { version:1,installed_at:123,files:vec![] }).unwrap(); assert_eq!(record::read(&p).installed_at,123);
}
