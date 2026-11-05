//! A WebView2 page that is not a Tauri webview, for plugin pages (P8).
//!
//! Tauri injects its IPC script and invoke key into every frame of the
//! webviews it creates (docs/architecture/p8-webview-validation.md), so plugin
//! markup never goes into one of them. This page is a separate WebView2
//! controller on the same environment: nothing of Tauri is added to it, it
//! runs InPrivate (no storage shared with the island or kept on disk), and
//! every request, navigation, new window, permission and download goes
//! through the `PageHost` the caller gives, which refuses anything it does not
//! serve itself. Everything here runs on the window's (main) thread.

use std::rc::Rc;
use webview2_com::{
    take_pwstr, AddScriptToExecuteOnDocumentCreatedCompletedHandler, CreateCoreWebView2ControllerCompletedHandler,
    DownloadStartingEventHandler, Microsoft::Web::WebView2::Win32::*, NavigationStartingEventHandler,
    NewWindowRequestedEventHandler, PermissionRequestedEventHandler, WebMessageReceivedEventHandler,
    WebResourceRequestedEventHandler,
};
use windows::{
    core::{Interface, HSTRING, PWSTR},
    Win32::{
        Foundation::{HWND, RECT},
        UI::Shell::SHCreateMemStream,
    },
};

pub(crate) use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Controller, ICoreWebView2Environment};

/// An answer to one request of the page.
pub(crate) struct Resource {
    pub status: u16,
    /// "Name: value" lines.
    pub headers: Vec<String>,
    pub body: Vec<u8>,
}

/// What the page may do; called on the main thread.
pub(crate) trait PageHost {
    /// Every request the page makes (documents, frames, scripts, images,
    /// fetch, workers). None refuses it with 403; nothing reaches the network.
    fn resource(&self, url: &str) -> Option<Resource>;
    /// Whether the top document (`frame` false) or a frame may navigate to `url`.
    fn may_navigate(&self, url: &str, frame: bool) -> bool;
    /// A message the top document posted with `chrome.webview.postMessage`, as JSON.
    fn message(&self, source: &str, json: String);
}

pub(crate) struct PageOptions {
    pub start_url: String,
    /// Runs before any page script, in every frame.
    pub init_script: String,
    /// Developer tools, the context menu and browser keys (F12, F5) for plugins
    /// loaded in development mode.
    pub dev_tools: bool,
}

/// A live page; closed when dropped.
pub(crate) struct Page {
    controller: ICoreWebView2Controller,
    webview: ICoreWebView2,
}

/// The window a Tauri webview sits in, to put a page in the same window.
pub(crate) fn parent_window(controller: &ICoreWebView2Controller) -> Result<HWND, String> {
    let mut hwnd = HWND::default();
    // SAFETY: `controller` is a live controller and `hwnd` a valid out pointer.
    unsafe { controller.ParentWindow(&mut hwnd) }.map_err(|error| format!("Could not find the island window: {error}"))?;
    Ok(hwnd)
}

/// Starts creating a page in `parent`; `done` gets it (hidden, with zero size)
/// once WebView2 has made it and the start page is loading.
pub(crate) fn create(
    env: &ICoreWebView2Environment,
    parent: HWND,
    options: PageOptions,
    host: Rc<dyn PageHost>,
    done: impl FnOnce(Result<Page, String>) + 'static,
) -> Result<(), String> {
    let env10: ICoreWebView2Environment10 = env
        .cast()
        .map_err(|_| "Plugin pages need a newer WebView2 runtime.".to_string())?;
    let page_env = env.clone();
    let handler = CreateCoreWebView2ControllerCompletedHandler::create(Box::new(move |result, controller| {
        let page = result
            .map_err(|error| format!("WebView2 could not create the page: {error}"))
            .and_then(|()| controller.ok_or_else(|| "WebView2 returned no page.".to_string()))
            .and_then(|controller| set_up(&page_env, controller, options, host));
        done(page);
        Ok(())
    }));
    // SAFETY: `env10` is a live environment, `parent` a window of this thread,
    // and the options and handler are live COM objects kept alive by the calls.
    unsafe {
        let controller_options = env10
            .CreateCoreWebView2ControllerOptions()
            .map_err(|error| format!("Could not set up the page: {error}"))?;
        controller_options
            .SetIsInPrivateModeEnabled(true)
            .map_err(|error| format!("Could not set up the page: {error}"))?;
        env10
            .CreateCoreWebView2ControllerWithOptions(parent, &controller_options, &handler)
            .map_err(|error| format!("Could not create the page: {error}"))
    }
}

fn set_up(env: &ICoreWebView2Environment, controller: ICoreWebView2Controller, options: PageOptions, host: Rc<dyn PageHost>) -> Result<Page, String> {
    let fail = |error: windows::core::Error| format!("Could not set up the page: {error}");
    // SAFETY: every call is on a live controller / webview of this thread, with
    // owned HSTRINGs and handler objects that WebView2 keeps alive itself.
    let webview = unsafe {
        controller.SetIsVisible(false).map_err(fail)?;
        if let Ok(controller2) = controller.cast::<ICoreWebView2Controller2>() {
            controller2.SetDefaultBackgroundColor(COREWEBVIEW2_COLOR { A: 0, R: 0, G: 0, B: 0 }).map_err(fail)?;
        }
        let webview = controller.CoreWebView2().map_err(fail)?;
        harden(&webview, options.dev_tools).map_err(fail)?;
        guard_requests(&webview, env, host.clone()).map_err(fail)?;
        guard_navigation(&webview, host.clone()).map_err(fail)?;
        listen_for_messages(&webview, host).map_err(fail)?;
        webview
    };
    let page = Page { controller, webview };
    let navigate_webview = page.webview.clone();
    let start_url = HSTRING::from(options.start_url);
    // Navigate only after the script is registered, so it runs before the page's own.
    let after_script = AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(move |_, _| {
        // SAFETY: the webview is live (the handler holds a reference) and on this thread.
        unsafe { navigate_webview.Navigate(&start_url) }
    }));
    // SAFETY: as above; the script text is an owned HSTRING.
    unsafe { page.webview.AddScriptToExecuteOnDocumentCreated(&HSTRING::from(options.init_script), &after_script) }.map_err(fail)?;
    Ok(page)
}

/// Turns off what a plugin page does not need: host objects, dialogs, zoom,
/// autofill, swipe navigation, and (outside development) tools and menus.
///
/// # Safety
/// `webview` must be a live webview of the calling thread.
unsafe fn harden(webview: &ICoreWebView2, dev_tools: bool) -> windows::core::Result<()> {
    // Handled without a new window: window.open gets null.
    let new_window = NewWindowRequestedEventHandler::create(Box::new(|_, args| {
        if let Some(args) = args {
            // SAFETY: event args are valid during the event.
            unsafe { args.SetHandled(true)? };
        }
        Ok(())
    }));
    let permission = PermissionRequestedEventHandler::create(Box::new(|_, args| {
        if let Some(args) = args {
            // SAFETY: event args are valid during the event.
            unsafe { args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)? };
        }
        Ok(())
    }));
    let download = DownloadStartingEventHandler::create(Box::new(|_, args| {
        if let Some(args) = args {
            // SAFETY: event args are valid during the event.
            unsafe { args.SetCancel(true)? };
        }
        Ok(())
    }));
    // SAFETY: the caller guarantees a live webview on this thread.
    unsafe {
        let settings = webview.Settings()?;
        settings.SetIsScriptEnabled(true)?;
        settings.SetIsWebMessageEnabled(true)?;
        settings.SetAreHostObjectsAllowed(false)?;
        settings.SetAreDefaultScriptDialogsEnabled(false)?;
        settings.SetIsStatusBarEnabled(false)?;
        settings.SetIsZoomControlEnabled(false)?;
        settings.SetAreDevToolsEnabled(dev_tools)?;
        settings.SetAreDefaultContextMenusEnabled(dev_tools)?;
        if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
            settings3.SetAreBrowserAcceleratorKeysEnabled(dev_tools)?;
        }
        if let Ok(settings5) = settings.cast::<ICoreWebView2Settings5>() {
            settings5.SetIsPinchZoomEnabled(false)?;
        }
        if let Ok(settings6) = settings.cast::<ICoreWebView2Settings6>() {
            settings6.SetIsSwipeNavigationEnabled(false)?;
        }
        let mut token = 0i64;
        webview.add_NewWindowRequested(&new_window, &mut token)?;
        webview.add_PermissionRequested(&permission, &mut token)?;
        if let Ok(webview4) = webview.cast::<ICoreWebView2_4>() {
            webview4.add_DownloadStarting(&download, &mut token)?;
        }
        Ok(())
    }
}

/// Sends every request of the page, from any frame or worker, to the host.
///
/// # Safety
/// `webview` must be a live webview of the calling thread.
unsafe fn guard_requests(webview: &ICoreWebView2, env: &ICoreWebView2Environment, host: Rc<dyn PageHost>) -> windows::core::Result<()> {
    let filter = HSTRING::from("*");
    let env = env.clone();
    let handler = WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
        let Some(args) = args else { return Ok(()) };
        // SAFETY: event args, the request and the environment are live during the event.
        unsafe {
            let mut uri = PWSTR::null();
            args.Request()?.Uri(&mut uri)?;
            let uri = take_pwstr(uri);
            let response = match host.resource(&uri) {
                Some(resource) => {
                    let stream = if resource.body.is_empty() { None } else { SHCreateMemStream(Some(&resource.body)) };
                    env.CreateWebResourceResponse(
                        stream.as_ref(),
                        i32::from(resource.status),
                        &HSTRING::from(reason(resource.status)),
                        &HSTRING::from(resource.headers.join("\r\n")),
                    )?
                }
                None => env.CreateWebResourceResponse(None, 403, &HSTRING::from("Forbidden"), &HSTRING::new())?,
            };
            args.SetResponse(&response)
        }
    }));
    // SAFETY: the caller guarantees a live webview on this thread.
    unsafe {
        match webview.cast::<ICoreWebView2_22>() {
            // Also covers shared and service workers, which the older call misses.
            Ok(webview22) => webview22.AddWebResourceRequestedFilterWithRequestSourceKinds(
                &filter,
                COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
                COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
            )?,
            Err(_) => webview.AddWebResourceRequestedFilter(&filter, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)?,
        }
        let mut token = 0i64;
        webview.add_WebResourceRequested(&handler, &mut token)
    }
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        404 => "Not Found",
        _ => "Forbidden",
    }
}

/// Cancels navigations of the page or its frames that the host does not allow.
///
/// # Safety
/// `webview` must be a live webview of the calling thread.
unsafe fn guard_navigation(webview: &ICoreWebView2, host: Rc<dyn PageHost>) -> windows::core::Result<()> {
    let handler = |frame: bool, host: Rc<dyn PageHost>| {
        NavigationStartingEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            // SAFETY: event args are valid during the event.
            unsafe {
                let mut uri = PWSTR::null();
                args.Uri(&mut uri)?;
                if !host.may_navigate(&take_pwstr(uri), frame) {
                    args.SetCancel(true)?;
                }
            }
            Ok(())
        }))
    };
    let mut token = 0i64;
    // SAFETY: the caller guarantees a live webview on this thread.
    unsafe {
        webview.add_NavigationStarting(&handler(false, host.clone()), &mut token)?;
        webview.add_FrameNavigationStarting(&handler(true, host), &mut token)
    }
}

/// Hands the top document's `chrome.webview.postMessage` calls to the host.
///
/// # Safety
/// `webview` must be a live webview of the calling thread.
unsafe fn listen_for_messages(webview: &ICoreWebView2, host: Rc<dyn PageHost>) -> windows::core::Result<()> {
    let handler = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
        let Some(args) = args else { return Ok(()) };
        // SAFETY: event args are valid during the event.
        unsafe {
            let mut source = PWSTR::null();
            args.Source(&mut source)?;
            let mut json = PWSTR::null();
            args.WebMessageAsJson(&mut json)?;
            host.message(&take_pwstr(source), take_pwstr(json));
        }
        Ok(())
    }));
    let mut token = 0i64;
    // SAFETY: the caller guarantees a live webview on this thread.
    unsafe { webview.add_WebMessageReceived(&handler, &mut token) }
}

impl Page {
    /// Places the page at `x`, `y` (physical pixels in the window's client
    /// area) with the given size, and shows it.
    pub(crate) fn place(&self, x: i32, y: i32, width: i32, height: i32) {
        let bounds = RECT { left: x, top: y, right: x + width.max(0), bottom: y + height.max(0) };
        // SAFETY: a live controller of this thread.
        unsafe {
            let _ = self.controller.SetBounds(bounds);
            let _ = self.controller.SetIsVisible(width > 0 && height > 0);
        }
    }

    /// Sends JSON to the page (`chrome.webview` "message" event).
    pub(crate) fn post_json(&self, json: &str) -> Result<(), String> {
        // SAFETY: a live webview of this thread and an owned HSTRING.
        unsafe { self.webview.PostWebMessageAsJson(&HSTRING::from(json)) }.map_err(|error| format!("Could not reach the page: {error}"))
    }
}

impl Drop for Page {
    fn drop(&mut self) {
        // SAFETY: closing a live controller once; it is not used afterwards.
        unsafe {
            let _ = self.controller.Close();
        }
    }
}
