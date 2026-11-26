use super::*;
use std::{sync::mpsc, time::Duration};

#[test]
#[ignore = "Requires an interactive desktop; opens an isolated window to verify repeated focus without mouse input"]
fn overlay_focus_on_rapid_reopen() {
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().identifier = "com.flyisland.focus-probe".into();
    let data = std::env::temp_dir().join("fly-island-focus-probe");
    std::fs::create_dir_all(&data).unwrap();
    let (sender, receiver) = mpsc::channel();
    let app = tauri::Builder::default().any_thread().setup(move |app| {
        WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::External("about:blank".parse()?))
            .title("Fly Island focus probe").inner_size(440.0, 160.0).center()
            .decorations(true).always_on_top(true).focused(false).visible(true).data_directory(data).build()?;
        let handle = app.handle().clone();
        std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let overlay = handle.get_webview_window(WINDOW_LABEL).unwrap();
                std::thread::sleep(Duration::from_millis(300));
                overlay.eval("window.probeRunning=false; document.body.innerHTML='<button id=probe style=\"font:18px sans-serif;margin:24px;padding:16px\">Start rapid screenshot focus test</button>'; document.getElementById('probe').onclick=()=>document.title='start'; window.addEventListener('focus',()=>{if(window.probeRunning)document.title=document.hasFocus()?'focused':'pending'}); window.addEventListener('blur',()=>{if(window.probeRunning)document.title='blurred'}); document.title='Fly Island focus probe';").unwrap();
                // A real first input gives this test process the same foreground rights
                // as the real screenshot hotkey. Subsequent cycles inject no input.
                println!("focus probe ready: click Start once; six reopens then run without mouse input");
                let started = std::time::Instant::now();
                while overlay.title().unwrap() != "start" {
                    assert!(started.elapsed() < Duration::from_secs(120), "probe requires one initial input");
                    std::thread::sleep(Duration::from_millis(30));
                }
                overlay.eval("window.probeRunning=true").unwrap();
                for cycle in 0..6 {
                    if cycle == 0 { show_overlay(&handle).unwrap(); }
                    let activation = tauri::async_runtime::block_on(screenshot_activate(overlay.clone()));
                    println!("activation {cycle}: visible={:?}, foreground_available={}, focused={}", overlay.is_visible(),
                        !crate::win32::window::foreground_window().is_invalid(),
                        overlay.hwnd().is_ok_and(|handle| crate::win32::window::foreground_window() == handle));
                    activation.expect("native activation");
                    let mut focused = false;
                    for _ in 0..20 {
                        if overlay.title().unwrap() == "focused" { focused = true; break; }
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    assert!(focused, "cycle {cycle}: WebView document did not receive focus without a click");
                    let close = tauri::async_runtime::spawn(screenshot_dismiss(handle.clone(), overlay.clone()));
                    for _ in 0..100 {
                        if !SESSION.active() { break; }
                        std::thread::sleep(Duration::from_millis(1));
                    }
                    show_overlay(&handle).unwrap();
                    tauri::async_runtime::block_on(close).unwrap().unwrap();
                    println!("rapid reopen {cycle}: WebView focus received without mouse input");
                }
                tauri::async_runtime::block_on(screenshot_dismiss(handle.clone(), overlay)).unwrap();
            }));
            let _ = sender.send(result.is_ok()); handle.exit(0);
        });
        Ok(())
    }).build(context).unwrap();
    app.run_return(|_, _| {});
    assert!(receiver.recv_timeout(Duration::from_secs(5)).unwrap());
}
