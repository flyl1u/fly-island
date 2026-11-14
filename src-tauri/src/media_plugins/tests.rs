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
fn downloads_try_mirrors_before_github() {
    let urls = download::candidate_urls(manifest::PLUGIN.url);
    assert_eq!(urls.len(), 3);
    assert!(urls[0].starts_with("https://ghfast.top/https://github.com/"));
    assert!(urls[1].starts_with("https://gh-proxy.com/https://github.com/"));
    assert_eq!(urls[2], manifest::PLUGIN.url);
}
#[test]
fn bundled_files_are_used_without_downloading() {
    let t = Temp::new(); let bundled = t.0.join("bundled"); fs::create_dir_all(&bundled).unwrap();
    fs::write(bundled.join("test"), b"abc").unwrap();
    let a = manifest::Asset { name: "test", url: "http://127.0.0.1:9/unreachable", size: 3,
        sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" };
    let path = tauri::async_runtime::block_on(download::fetch(&t.0.join("download"), Some(&bundled), &a)).unwrap();
    assert_eq!(path, bundled.join("test"));
    assert!(!t.0.join("download").exists(), "a verified bundled file needs no download folder");
}
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
#[test]
fn helper_exit_codes_round_trip_and_name_the_cause() {
    use helper_exit::HelperFailure as F;
    for failure in [F::Unknown, F::InvalidArgs, F::TargetUnavailable, F::InvalidTarget, F::HashMismatch,
        F::LoaderExists, F::AccessDenied, F::FileLocked, F::VirusBlocked, F::NeedsClose] {
        assert_eq!(F::from_code(failure.code() as u32), failure);
    }
    // Unknown codes, and the plain 1 every older helper returned, stay generic.
    assert_eq!(F::from_code(1), F::Unknown);
    assert_eq!(F::from_code(0xC000_0005), F::Unknown);
    let kind = |code: u32| F::from_code(code).to_error(code, None).kind;
    assert_eq!(kind(F::TargetUnavailable.code() as u32), "DriveUnavailable");
    for blocked in [F::AccessDenied, F::FileLocked, F::VirusBlocked] { assert_eq!(kind(blocked.code() as u32), "Blocked"); }
    assert_eq!(kind(F::LoaderExists.code() as u32), "LoaderExists");
    assert_eq!(kind(F::NeedsClose.code() as u32), "NeedsClose");
    assert_eq!(kind(1), "Io");
    // The helper's own message wins over the bare exit code when it could write one.
    assert_eq!(F::Unknown.to_error(1, None).detail, "Plugin helper exited with 1");
    assert_eq!(F::Unknown.to_error(1, Some("disk full".into())).detail, "disk full");
    assert_eq!(F::Unknown.to_error(1, Some("  ".into())).detail, "Plugin helper exited with 1");
}
#[test]
fn io_errors_from_security_software_are_recognised() {
    use helper_exit::HelperFailure as F;
    use std::io::{Error, ErrorKind};
    assert_eq!(F::of_io(&Error::from_raw_os_error(5)), F::AccessDenied);
    assert_eq!(F::of_io(&Error::from_raw_os_error(32)), F::FileLocked);
    assert_eq!(F::of_io(&Error::from_raw_os_error(225)), F::VirusBlocked);
    assert_eq!(F::of_io(&Error::from_raw_os_error(226)), F::VirusBlocked);
    assert_eq!(F::of_io(&Error::new(ErrorKind::PermissionDenied, "x")), F::AccessDenied);
    assert_eq!(F::of_io(&Error::from_raw_os_error(2)), F::Unknown);
}
#[test]
fn helper_report_argument_is_optional_and_absolute() {
    let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    let plain = args(&["--media-plugin-remove", r"C:\x\msimg32.dll", "h"]);
    assert_eq!(helper_exit::split_report(&plain), (&plain[..], None));
    let with = args(&["--media-plugin-remove", r"C:\x\msimg32.dll", "h", r"--report=C:\t\focusd-plugin-helper-1.txt"]);
    let (rest, report) = helper_exit::split_report(&with);
    assert_eq!(rest, &with[..3]);
    assert_eq!(report, Some(PathBuf::from(r"C:\t\focusd-plugin-helper-1.txt")));
    let relative = args(&["--media-plugin-remove", "h", "--report=report.txt"]);
    assert_eq!(helper_exit::split_report(&relative).1, None);
}
#[test]
fn only_our_own_temp_files_are_cleaned_up() {
    assert!(elevated::is_own_temp("msimg32.focusd-tmp", "msimg32.dll"));
    assert!(elevated::is_own_temp("MSIMG32.FOCUSD-TMP", "msimg32.dll"));
    assert!(elevated::is_own_temp("msimg32.dll.123-456.focusd-tmp", "msimg32.dll"));
    for other in ["msimg32.dll", "msimg32.dll.focusd-tmp", "msimg32.tmp", "cloudmusic.focusd-tmp", "other.dll.1-2.focusd-tmp", "msimg32.dll.1-2.tmp"] {
        assert!(!elevated::is_own_temp(other, "msimg32.dll"), "{other}");
    }
    let t = Temp::new(); let source = t.0.join("source"); let target = t.0.join("InfLink.dll");
    fs::write(&source, b"abc").unwrap();
    fs::write(t.0.join("InfLink.focusd-tmp"), b"stale").unwrap();
    fs::write(t.0.join("InfLink.dll.1-2.focusd-tmp"), b"stale").unwrap();
    fs::write(t.0.join("keep.focusd-tmp"), b"other").unwrap();
    elevated::atomic_copy(&source, &target, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad").unwrap();
    assert_eq!(fs::read(&target).unwrap(), b"abc");
    let mut left: Vec<_> = fs::read_dir(&t.0).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
    left.sort();
    assert_eq!(left, ["InfLink.dll", "keep.focusd-tmp", "source"]);
}
