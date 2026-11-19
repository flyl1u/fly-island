//! The glass materials' live backdrop: what is behind the island right now, blurred
//! (docs/investigations/glass-live-backdrop.md). One long-lived thread duplicates the island's
//! monitor (win32/desktop_duplication.rs), reads the region behind the island back at 1/4 size
//! when something changed there, blurs it and sends it to the page as raw RGBA over a channel,
//! at most 30 times a second. The island window is left out of the duplication, so it never
//! blurs itself, while screenshots and recordings through other paths still show it.
//!
//! It runs only while the page asks (a glass material, the island not tucked) and the window is
//! visible; it pauses while a full-screen app covers the island's monitor, and an error (the lock
//! screen, a mode change, a lost device) drops the duplication and tries again a second later.

use serde::Deserialize;
use std::{
    sync::{Condvar, Mutex, MutexGuard, OnceLock, PoisonError},
    thread,
    time::{Duration, Instant},
};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    AppHandle,
};
use windows::Win32::Foundation::HWND;

use crate::win32::desktop_duplication::{Duplication, Frame, Readback, ScreenRect};

/// At most this often a frame goes to the page.
const FRAME_INTERVAL: Duration = Duration::from_millis(33);
/// How long one wait for a desktop frame lasts: also how soon a moved window is noticed.
const FRAME_WAIT_MS: u32 = 50;
/// Before trying a failed duplication again, and between checks while paused for a full-screen app.
const RETRY: Duration = Duration::from_millis(1000);
/// Blur radius at full strength, in backdrop pixels (a quarter of screen pixels): about 80 screen
/// pixels per pass, so the strongest setting leaves only soft colour behind the text.
const MAX_RADIUS: f32 = 20.0;
/// Bytes before the pixels: the rectangle from the window's corner (4 × i32) and the pixel size (2 × u32).
const HEADER: usize = 24;

/// The region behind the island, in physical pixels from the window's top-left corner.
/// Matches GlassCaptureRegion in src/windows/island/api.ts.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GlassCaptureRegion {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
}

#[derive(Default)]
struct Control {
    channel: Option<Channel<InvokeResponseBody>>,
    /// The island window's handle, as an integer (HWND is not Send).
    window: isize,
    region: Option<GlassCaptureRegion>,
    blur: u8,
    /// Set by a pause: the page drops its picture then, so the next region gets a frame even
    /// when nothing behind the island changed.
    resend: bool,
}

impl Control {
    fn active(&self) -> bool {
        self.channel.is_some() && self.region.is_some() && self.window != 0
    }
}

static CONTROL: Mutex<Control> = Mutex::new(Control { channel: None, window: 0, region: None, blur: 0, resend: false });
static WAKE: Condvar = Condvar::new();
static THREAD: OnceLock<()> = OnceLock::new();

fn control() -> MutexGuard<'static, Control> {
    CONTROL.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Starts sending frames to `on_frame`. False where the island cannot be left out of the
/// capture (Windows before 10 1709): the glass then stays a tint, with no blur.
#[tauri::command]
pub fn start_glass_capture(app: AppHandle, on_frame: Channel<InvokeResponseBody>) -> Result<bool, String> {
    let window = super::main_window(&app)?.hwnd().map_err(|error| error.to_string())?;
    if !crate::win32::desktop_duplication::exclude_from_capture(window, true) {
        return Ok(false);
    }
    {
        let mut control = control();
        control.channel = Some(on_frame);
        control.window = window.0 as isize;
    }
    THREAD.get_or_init(|| {
        if let Err(error) = thread::Builder::new().name("glass-capture".into()).spawn(run) {
            eprintln!("glass capture thread could not start: {error}");
        }
    });
    WAKE.notify_all();
    Ok(true)
}

/// Where the island is in its window, and how strong the blur; `None` pauses (tucked).
#[tauri::command]
pub fn set_glass_capture_region(region: Option<GlassCaptureRegion>, blur: u8) {
    let mut control = control();
    control.region = region.filter(|region| region.width > 0 && region.height > 0);
    control.resend |= control.region.is_none();
    control.blur = blur.min(100);
    drop(control);
    WAKE.notify_all();
}

#[tauri::command]
pub fn stop_glass_capture(app: AppHandle) {
    let window = {
        let mut control = control();
        control.channel = None;
        control.region = None;
        std::mem::take(&mut control.window)
    };
    WAKE.notify_all();
    if window != 0 {
        crate::win32::desktop_duplication::exclude_from_capture(HWND(window as *mut _), false);
    } else if let Ok(Ok(window)) = super::main_window(&app).map(|window| window.hwnd()) {
        crate::win32::desktop_duplication::exclude_from_capture(window, false);
    }
}

struct Job {
    channel: Channel<InvokeResponseBody>,
    window: HWND,
    region: GlassCaptureRegion,
    blur: u8,
    resend: bool,
}

/// Blocks until there is something to capture for.
fn wait_for_job() -> Job {
    let mut control = control();
    loop {
        if control.active() {
            if let (Some(channel), Some(region)) = (control.channel.clone(), control.region) {
                let resend = std::mem::take(&mut control.resend);
                return Job { channel, window: HWND(control.window as *mut _), region, blur: control.blur, resend };
            }
        }
        control = WAKE.wait(control).unwrap_or_else(PoisonError::into_inner);
    }
}

fn pause(duration: Duration) {
    let control = control();
    let _ = WAKE.wait_timeout(control, duration).unwrap_or_else(PoisonError::into_inner);
}

fn run() {
    let mut duplication: Option<Duplication> = None;
    // What the page last got: the region and blur, and whether it is showing a frame at all.
    let mut sent: Option<(ScreenRect, u8)> = None;
    let mut showing = false;
    let mut pending = false;
    let mut last_send = Instant::now() - FRAME_INTERVAL;
    loop {
        let job = wait_for_job();
        if job.resend {
            sent = None;
        }
        let paused = !crate::win32::window::is_visible(job.window)
            || crate::system::fullscreen::get_foreground_fullscreen().covers_island();
        let Some(window) = crate::win32::window::window_rect(job.window).filter(|_| !paused) else {
            // Hidden in the tray, or a game in front: no frames, and no duplication held.
            duplication = None;
            if showing && job.channel.send(InvokeResponseBody::Raw(Vec::new())).is_ok() {
                showing = false;
            }
            sent = None;
            pause(RETRY);
            continue;
        };
        let region = (
            window.left + job.region.left,
            window.top + job.region.top,
            window.left + job.region.left + job.region.width,
            window.top + job.region.top + job.region.height,
        );
        let centre = ((region.0 + region.2) / 2, (region.1 + region.3) / 2);
        let on_monitor = duplication.as_ref().is_some_and(|current| {
            let monitor = current.monitor;
            centre.0 >= monitor.0 && centre.0 < monitor.2 && centre.1 >= monitor.1 && centre.1 < monitor.3
        });
        if !on_monitor {
            duplication = match Duplication::open(centre) {
                Ok(opened) => Some(opened),
                Err(error) => {
                    // The lock screen or UAC (the secure desktop), or no output under the island.
                    eprintln!("glass capture: duplication unavailable ({error})");
                    if showing && job.channel.send(InvokeResponseBody::Raw(Vec::new())).is_ok() {
                        showing = false;
                    }
                    pause(RETRY);
                    continue;
                }
            };
            sent = None;
        }
        let Some(current) = duplication.as_mut() else { continue };
        match current.next_frame(FRAME_WAIT_MS, region) {
            Ok(Frame::New { touches: true }) => pending = true,
            Ok(_) => {}
            Err(error) => {
                eprintln!("glass capture: duplication ended ({error})");
                duplication = None;
                pause(RETRY);
                continue;
            }
        }
        if sent != Some((region, job.blur)) {
            pending = true;
        }
        if !pending || last_send.elapsed() < FRAME_INTERVAL {
            continue;
        }
        match current.read_region(region) {
            Ok(Some(readback)) => {
                let message = encode(readback, job.blur, (window.left, window.top));
                if job.channel.send(InvokeResponseBody::Raw(message)).is_err() {
                    // The page went away (reloaded): wait for it to start again.
                    control().channel = None;
                    continue;
                }
                showing = true;
                sent = Some((region, job.blur));
                pending = false;
                last_send = Instant::now();
            }
            Ok(None) => pending = false,
            Err(error) => {
                eprintln!("glass capture: read failed ({error})");
                duplication = None;
            }
        }
    }
}

/// Header, then RGBA rows: blurred, a little more saturated (vibrancy), opaque. The rectangle
/// is from the window's top-left corner (`origin`), so the page places it without knowing where
/// the window is; while the window is dragged the picture moves with it until the next frame.
pub(crate) fn encode(readback: Readback, blur: u8, origin: (i32, i32)) -> Vec<u8> {
    let Readback { rect, width, height, mut bgra } = readback;
    // Squared, so the low end stays nearly sharp and the top end is clearly stronger (a linear
    // 0–7 range felt the same at both ends).
    let strength = f32::from(blur.min(100)) / 100.0;
    let radius = (strength * strength * MAX_RADIUS).round() as usize;
    box_blur(&mut bgra, width as usize, height as usize, radius);
    let mut message = Vec::with_capacity(HEADER + bgra.len());
    for value in [rect.0 - origin.0, rect.1 - origin.1, rect.2 - origin.0, rect.3 - origin.1] {
        message.extend_from_slice(&value.to_le_bytes());
    }
    message.extend_from_slice(&width.to_le_bytes());
    message.extend_from_slice(&height.to_le_bytes());
    for pixel in bgra.as_chunks::<4>().0 {
        let (b, g, r) = (pixel[0] as f32, pixel[1] as f32, pixel[2] as f32);
        let grey = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let vivid = |channel: f32| (grey + (channel - grey) * 1.18).clamp(0.0, 255.0) as u8;
        message.extend_from_slice(&[vivid(r), vivid(g), vivid(b), 255]);
    }
    message
}

/// Three passes of a box blur, across then down: close to a Gaussian, linear in the pixels
/// whatever the radius. The picture is small (a quarter of the island's pixels each way).
fn box_blur(pixels: &mut [u8], width: usize, height: usize, radius: usize) {
    if radius == 0 || width == 0 || height == 0 {
        return;
    }
    let mut scratch = vec![0u8; pixels.len()];
    for _ in 0..3 {
        blur_lines(pixels, &mut scratch, width, height, radius, true);
        blur_lines(&scratch, pixels, width, height, radius, false);
    }
}

fn blur_lines(source: &[u8], target: &mut [u8], width: usize, height: usize, radius: usize, across: bool) {
    let (lines, length) = if across { (height, width) } else { (width, height) };
    let index = |line: usize, position: usize| if across { (line * width + position) * 4 } else { (position * width + line) * 4 };
    let span = (radius * 2 + 1) as u32;
    for line in 0..lines {
        let mut sums = [0u32; 3];
        // The edge pixel repeats past the ends.
        for offset in 0..=radius * 2 {
            let at = index(line, offset.saturating_sub(radius).min(length - 1));
            for channel in 0..3 {
                sums[channel] += source[at + channel] as u32;
            }
        }
        for position in 0..length {
            let at = index(line, position);
            for channel in 0..3 {
                target[at + channel] = (sums[channel] / span) as u8;
            }
            target[at + 3] = 255;
            let leaving = index(line, position.saturating_sub(radius));
            let entering = index(line, (position + radius + 1).min(length - 1));
            for channel in 0..3 {
                sums[channel] = sums[channel] + source[entering + channel] as u32 - source[leaving + channel] as u32;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_blur_keeps_a_flat_picture_flat_and_spreads_an_edge() {
        let (width, height) = (16, 4);
        let mut flat = vec![80u8; width * height * 4];
        box_blur(&mut flat, width, height, 3);
        assert!(flat.as_chunks::<4>().0.iter().all(|pixel| pixel[..3] == [80, 80, 80]));

        let mut edge: Vec<u8> = (0..width * height).flat_map(|index| if index % width < 8 { [0, 0, 0, 255] } else { [240, 240, 240, 255] }).collect();
        box_blur(&mut edge, width, height, 2);
        let row: Vec<u8> = edge.as_chunks::<4>().0.iter().take(width).map(|pixel| pixel[0]).collect();
        assert!(row[0] < 10 && row[15] > 230, "the far ends keep their colour: {row:?}");
        assert!(row[7] > 40 && row[8] < 200, "the edge is spread: {row:?}");
    }

    #[test]
    fn a_frame_carries_its_rectangle_size_and_opaque_rgba() {
        let readback = Readback { rect: (-10, 0, 30, 8), width: 2, height: 1, bgra: vec![10, 20, 30, 0, 10, 20, 30, 0] };
        let message = encode(readback, 0, (-20, 0));
        assert_eq!(message.len(), HEADER + 8);
        assert_eq!(i32::from_le_bytes([message[0], message[1], message[2], message[3]]), 10);
        assert_eq!(u32::from_le_bytes([message[16], message[17], message[18], message[19]]), 2);
        assert_eq!(&message[HEADER + 3..HEADER + 4], &[255]);
        assert!(message[HEADER] > message[HEADER + 2], "BGRA becomes RGBA: red first");
    }
}
