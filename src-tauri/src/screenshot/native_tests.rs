//! Isolated desktop probe: no app services, settings, hotkey registration or clipboard writes.
use super::*;
use crate::screenshot::capture::{capture_rgba, capture_rgba_fresh};
use std::{sync::mpsc, time::Duration};
use tauri::window::Color;

fn brightness(region: (i32, i32, i32, i32), fresh: bool) -> f64 {
    let (width, height, rgba) = if fresh { capture_rgba_fresh(region) } else { capture_rgba(region) }.expect("capture");
    assert_eq!(rgba.len(), width as usize * height as usize * 4);
    rgba.as_chunks::<4>().0.iter().map(|pixel| f64::from(pixel[0])).sum::<f64>() / f64::from(width * height)
}

#[test]
#[ignore = "Requires an interactive Windows desktop; briefly displays an isolated capture probe"]
fn repeated_overlay_capture_keeps_clean_desktop() {
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().identifier = "com.flyisland.capture-probe".into();
    let probe_data = std::env::temp_dir().join("fly-island-capture-probe-webview");
    std::fs::create_dir_all(&probe_data).expect("isolated WebView data");
    let (sender, receiver) = mpsc::channel();
    let app = tauri::Builder::default().any_thread().setup(move |app| {
        WebviewWindowBuilder::new(app, "capture-probe-background", WebviewUrl::External("about:blank".parse()?))
            .title("Fly Island capture probe").decorations(false).shadow(false).always_on_top(true)
            .focused(false).position(40.0, 80.0).inner_size(320.0, 220.0)
            .data_directory(probe_data.clone())
            .background_color(Color(242, 242, 242, 255)).build().map_err(|error| format!("background: {error}"))?;
        // Use an empty WebView instead of the app page: only production native lifecycle runs here.
        WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External("about:blank".parse()?))
            .decorations(false).shadow(false).always_on_top(true).focused(false).visible(false)
            .data_directory(probe_data)
            .background_color(Color(0, 0, 0, 255)).build().map_err(|error| format!("overlay: {error}"))?;
        let handle = app.handle().clone();
        std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let background = handle.get_webview_window("capture-probe-background").expect("background");
                let overlay = handle.get_webview_window(WINDOW_LABEL).expect("overlay");
                std::thread::sleep(Duration::from_millis(400));
                background.eval("document.documentElement.style.background='#f2f2f2'").expect("paint background");
                overlay.eval("document.documentElement.style.background='#000'").expect("paint overlay");
                std::thread::sleep(Duration::from_millis(200));
                let origin = background.inner_position().expect("position");
                let region = (origin.x + 60, origin.y + 60, origin.x + 160, origin.y + 140);
                let baseline = brightness(region, true);
                assert!(baseline > 230.0, "probe background should be bright: {baseline}");
                for cycle in 0..6 {
                    show_overlay(&handle).expect("arm");
                    tauri::async_runtime::block_on(hide_and_settle(overlay.clone())).expect("prepare");
                    let clean = brightness(region, true);
                    assert!((clean - baseline).abs() < 3.0, "cycle {cycle}: baseline={baseline}, clean={clean}");
                    // Seed the persistent worker with an actual black overlay, reproducing old self-capture.
                    crate::win32::desktop_duplication::exclude_from_capture(overlay.hwnd().expect("hwnd"), false);
                    overlay.show().expect("show");
                    std::thread::sleep(Duration::from_millis(150));
                    let dark = brightness(region, true);
                    assert!(dark < 20.0, "probe overlay must really be black: {dark}");
                    tauri::async_runtime::block_on(hide_and_settle(overlay.clone())).expect("hide contaminated overlay");
                    let recovered = brightness(region, true);
                    assert!((recovered - baseline).abs() < 3.0, "cycle {cycle}: recovered={recovered}");
                    // Self must never be offered as a candidate, even while visible.
                    overlay.show().expect("show excluded overlay");
                    std::thread::sleep(Duration::from_millis(80));
                    assert!(overlay.is_visible().expect("visible"));
                    let excluded = brightness(region, true);
                    assert!((excluded - baseline).abs() < 3.0, "visible overlay must not capture itself: {excluded}");
                    let all = crate::win32::window_rects::visible_window_rects(None);
                    let rects = crate::win32::window_rects::visible_window_rects(overlay.hwnd().ok());
                    assert_eq!(all.len(), rects.len() + 1, "own overlay must be excluded from candidates");
                    tauri::async_runtime::block_on(screenshot_dismiss(handle.clone(), overlay.clone())).expect("dismiss");
                    println!("cycle {cycle}: baseline={baseline:.1}, overlay={dark:.1}, clean={clean:.1}, recovered={recovered:.1}, excluded={excluded:.1}");
                }
            }));
            let _ = sender.send(result.map_err(|_| "native capture probe failed"));
            handle.exit(0);
        });
        Ok(())
    }).build(context).expect("isolated runtime");
    app.run_return(|_, _| {});
    receiver.recv_timeout(Duration::from_secs(5)).expect("probe finished").expect("native probe passed");
}
