use super::*;

#[test]
fn running_wechat_overrides_stale_registry_for_both_generations() {
    for (registered, running) in [
        (r"C:\Old\WeChat\WeChat.exe", r"D:\New\Weixin\Weixin.exe"),
        (r"C:\New\Weixin\Weixin.exe", r"E:\Portable\WeChat.exe"),
        (r"C:\Weixin\Weixin.exe", r"D:\SecondInstance\Weixin.exe"),
    ] {
        assert!(is_wechat_executable(running));
        assert_eq!(
            select_executable(Some(registered.into()), Some(running.into())),
            Some(PathBuf::from(running)),
        );
    }
}

#[test]
fn registry_is_only_used_without_a_running_wechat() {
    let registered = PathBuf::from(r"C:\Weixin\Weixin.exe");
    assert_eq!(
        select_executable(Some(registered.clone()), None),
        Some(registered)
    );
    assert_eq!(select_executable(None, None), None);
    let portable = PathBuf::from(r"D:\Portable\WeChat.exe");
    assert_eq!(
        select_executable(None, Some(portable.clone())),
        Some(portable)
    );
}

#[test]
fn wechat_matching_accepts_aliases_case_and_extended_paths() {
    for path in [
        r"C:\Junction\Weixin.exe",
        r"D:\RealFolder\Weixin.exe",
        r"C:\PROGRA~1\WeChat\WeChat.exe",
        r"\\?\D:\Apps\WEIXIN.EXE",
        "d:/portable/wEcHaT.eXe",
    ] {
        assert!(is_wechat_executable(path), "{path}");
    }
}

#[test]
fn unrelated_processes_cannot_become_wechat() {
    for path in [
        r"C:\Weixin.exe\Other.exe",
        r"C:\Apps\QQ.exe",
        r"C:\Apps\WeixinHelper.exe",
        r"C:\Apps\WeChat.exe.bak",
        r"C:\Apps\NotWeixin.exe",
        "",
    ] {
        assert!(!is_wechat_executable(path), "{path}");
    }
}
