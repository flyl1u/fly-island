//! DXGI Desktop Duplication of one monitor, for the glass's live backdrop (island/glass_capture.rs),
//! after atrium-desktop's native/core/render/capture.cpp. Each changed desktop frame is copied whole
//! on the GPU (so a moved or resized region can be read again while the screen is still), and only
//! the region behind the island goes through a mip chain and comes back to the CPU, at 1/4 size.
//!
//! `exclude_from_capture` leaves the island window out of Desktop Duplication alone
//! (WCA_EXCLUDED_FROM_DDA): screenshots and recordings that use other paths still show it.

use windows::{
    core::{Interface, BOOL, PCSTR},
    Win32::{
        Foundation::{HMODULE, HWND, RECT},
        Graphics::{
            Direct3D::{D3D_DRIVER_TYPE_UNKNOWN, D3D11_SRV_DIMENSION_TEXTURE2D},
            Direct3D11::{
                D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11ShaderResourceView, ID3D11Texture2D,
                D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE, D3D11_BOX, D3D11_CPU_ACCESS_READ,
                D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE,
                D3D11_RESOURCE_MISC_GENERATE_MIPS, D3D11_SDK_VERSION, D3D11_SHADER_RESOURCE_VIEW_DESC,
                D3D11_SHADER_RESOURCE_VIEW_DESC_0, D3D11_TEX2D_SRV, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
                D3D11_USAGE_STAGING,
            },
            Dxgi::{
                Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_MODE_ROTATION_IDENTITY, DXGI_MODE_ROTATION_UNSPECIFIED, DXGI_SAMPLE_DESC},
                CreateDXGIFactory1, IDXGIFactory1, IDXGIOutput1, IDXGIOutputDuplication, IDXGIResource,
                DXGI_ERROR_WAIT_TIMEOUT, DXGI_OUTDUPL_FRAME_INFO, DXGI_OUTDUPL_MOVE_RECT,
            },
        },
        System::LibraryLoader::{GetModuleHandleW, GetProcAddress},
    },
};

/// The mip level read back: 2 is a quarter of the width and height.
const READ_LEVEL: u32 = 2;
const MIP_LEVELS: u32 = READ_LEVEL + 1;

/// A rectangle in physical screen pixels: left, top, right, bottom.
pub(crate) type ScreenRect = (i32, i32, i32, i32);

pub(crate) enum Frame {
    /// Nothing new within the timeout.
    Timeout,
    /// A new frame; `touches` says whether anything changed inside the given region.
    New { touches: bool },
}

/// The region behind the island at a quarter size, rows of BGRA with no padding.
pub(crate) struct Readback {
    /// The screen region it covers (clamped to the monitor).
    pub(crate) rect: ScreenRect,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) bgra: Vec<u8>,
}

struct RegionTextures {
    size: (u32, u32),
    mips: ID3D11Texture2D,
    view: ID3D11ShaderResourceView,
    staging: ID3D11Texture2D,
}

pub(crate) struct Duplication {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    duplication: IDXGIOutputDuplication,
    /// The monitor in screen pixels.
    pub(crate) monitor: ScreenRect,
    /// The last desktop image, kept so a region can be read again with no new frame.
    desktop: Option<ID3D11Texture2D>,
    region: Option<RegionTextures>,
    metadata: Vec<u8>,
}

fn contains(rect: ScreenRect, point: (i32, i32)) -> bool {
    point.0 >= rect.0 && point.0 < rect.2 && point.1 >= rect.1 && point.1 < rect.3
}

pub(crate) fn intersects(a: ScreenRect, b: ScreenRect) -> bool {
    a.0 < b.2 && b.0 < a.2 && a.1 < b.3 && b.1 < a.3
}

fn from_rect(rect: RECT) -> ScreenRect {
    (rect.left, rect.top, rect.right, rect.bottom)
}

impl Duplication {
    /// Duplicates the monitor that holds `point`, on the adapter that drives it.
    pub(crate) fn open(point: (i32, i32)) -> windows::core::Result<Self> {
        // SAFETY: plain DXGI / D3D11 factory and device calls; every out pointer is a live local.
        unsafe {
            let factory: IDXGIFactory1 = CreateDXGIFactory1()?;
            let mut adapter_index = 0;
            while let Ok(adapter) = factory.EnumAdapters1(adapter_index) {
                adapter_index += 1;
                let mut output_index = 0;
                while let Ok(output) = adapter.EnumOutputs(output_index) {
                    output_index += 1;
                    let description = output.GetDesc()?;
                    let monitor = from_rect(description.DesktopCoordinates);
                    if !contains(monitor, point) {
                        continue;
                    }
                    let mut device = None;
                    let mut context = None;
                    D3D11CreateDevice(
                        &adapter,
                        D3D_DRIVER_TYPE_UNKNOWN,
                        HMODULE::default(),
                        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                        None,
                        D3D11_SDK_VERSION,
                        Some(&mut device),
                        None,
                        Some(&mut context),
                    )?;
                    let (Some(device), Some(context)) = (device, context) else {
                        return Err(windows::core::Error::from_hresult(windows::Win32::Foundation::E_FAIL));
                    };
                    let duplication = output.cast::<IDXGIOutput1>()?.DuplicateOutput(&device)?;
                    let rotation = duplication.GetDesc().Rotation;
                    if rotation != DXGI_MODE_ROTATION_IDENTITY && rotation != DXGI_MODE_ROTATION_UNSPECIFIED {
                        // A rotated screen comes unrotated; not worth turning back for a backdrop.
                        return Err(windows::core::Error::from_hresult(windows::Win32::Foundation::E_NOTIMPL));
                    }
                    return Ok(Self { device, context, duplication, monitor, desktop: None, region: None, metadata: Vec::new() });
                }
            }
            Err(windows::core::Error::from_hresult(windows::Win32::Graphics::Dxgi::DXGI_ERROR_NOT_FOUND))
        }
    }

    /// Waits up to `timeout_ms` for a new desktop frame and keeps a copy of it. An error
    /// (the secure desktop, a mode change, a lost device) means this duplication is done.
    pub(crate) fn next_frame(&mut self, timeout_ms: u32, region: ScreenRect) -> windows::core::Result<Frame> {
        let mut info = DXGI_OUTDUPL_FRAME_INFO::default();
        let mut resource: Option<IDXGIResource> = None;
        // SAFETY: out pointers are live locals; the frame is released below on every path.
        match unsafe { self.duplication.AcquireNextFrame(timeout_ms, &mut info, &mut resource) } {
            Ok(()) => {}
            Err(error) if error.code() == DXGI_ERROR_WAIT_TIMEOUT => return Ok(Frame::Timeout),
            Err(error) => return Err(error),
        }
        let result = self.take_frame(&info, resource, region);
        // SAFETY: a frame was acquired above and is released exactly once.
        let released = unsafe { self.duplication.ReleaseFrame() };
        let frame = result?;
        released?;
        Ok(frame)
    }

    fn take_frame(&mut self, info: &DXGI_OUTDUPL_FRAME_INFO, resource: Option<IDXGIResource>, region: ScreenRect) -> windows::core::Result<Frame> {
        if info.LastPresentTime == 0 {
            // Only the pointer moved; the desktop image is unchanged.
            return Ok(Frame::New { touches: false });
        }
        let Some(resource) = resource else { return Ok(Frame::New { touches: false }) };
        let texture: ID3D11Texture2D = resource.cast()?;
        let first = self.desktop.is_none();
        if first {
            let mut description = D3D11_TEXTURE2D_DESC::default();
            // SAFETY: the description is written into a live local.
            unsafe { texture.GetDesc(&mut description) };
            description.Usage = D3D11_USAGE_DEFAULT;
            description.BindFlags = 0;
            description.CPUAccessFlags = 0;
            description.MiscFlags = 0;
            let mut copy = None;
            // SAFETY: a valid description; the out pointer is a live local.
            unsafe { self.device.CreateTexture2D(&description, None, Some(&mut copy)) }?;
            self.desktop = copy;
        }
        let Some(desktop) = &self.desktop else { return Ok(Frame::New { touches: false }) };
        // SAFETY: both textures are the monitor's size and format.
        unsafe { self.context.CopyResource(desktop, &texture) };
        let touches = first || self.changed_inside(info, region)?;
        Ok(Frame::New { touches })
    }

    /// Whether the frame's dirty or moved rectangles reach `region` (screen pixels).
    fn changed_inside(&mut self, info: &DXGI_OUTDUPL_FRAME_INFO, region: ScreenRect) -> windows::core::Result<bool> {
        let size = info.TotalMetadataBufferSize as usize;
        if size == 0 {
            return Ok(true);
        }
        let local = (region.0 - self.monitor.0, region.1 - self.monitor.1, region.2 - self.monitor.0, region.3 - self.monitor.1);
        if self.metadata.len() < size {
            self.metadata.resize(size, 0);
        }
        let mut used = 0u32;
        // SAFETY: the buffer holds `size` bytes, enough for all of the frame's metadata, and
        // RECT / DXGI_OUTDUPL_MOVE_RECT are plain integers, so any alignment of u8 data is
        // read through the API that writes it.
        unsafe {
            self.duplication.GetFrameMoveRects(size as u32, self.metadata.as_mut_ptr().cast::<DXGI_OUTDUPL_MOVE_RECT>(), &mut used)?;
        }
        let moves = used as usize / std::mem::size_of::<DXGI_OUTDUPL_MOVE_RECT>();
        let mut rects: Vec<ScreenRect> = (0..moves)
            .map(|index| {
                // SAFETY: index < moves, inside the bytes the call above wrote.
                let moved = unsafe { std::ptr::read_unaligned(self.metadata.as_ptr().cast::<DXGI_OUTDUPL_MOVE_RECT>().add(index)) };
                from_rect(moved.DestinationRect)
            })
            .collect();
        // SAFETY: as above, for the dirty rectangles.
        unsafe {
            self.duplication.GetFrameDirtyRects(size as u32, self.metadata.as_mut_ptr().cast::<RECT>(), &mut used)?;
        }
        let dirty = used as usize / std::mem::size_of::<RECT>();
        rects.extend((0..dirty).map(|index| {
            // SAFETY: index < dirty, inside the bytes the call above wrote.
            from_rect(unsafe { std::ptr::read_unaligned(self.metadata.as_ptr().cast::<RECT>().add(index)) })
        }));
        Ok(rects.into_iter().any(|rect| intersects(rect, local)))
    }

    /// The region (screen pixels, clamped to the monitor) from the last frame, at 1/4 size.
    pub(crate) fn read_region(&mut self, region: ScreenRect) -> windows::core::Result<Option<Readback>> {
        let Some(desktop) = self.desktop.clone() else { return Ok(None) };
        let clamped = (
            region.0.max(self.monitor.0),
            region.1.max(self.monitor.1),
            region.2.min(self.monitor.2),
            region.3.min(self.monitor.3),
        );
        let width = (clamped.2 - clamped.0).max(0) as u32;
        let height = (clamped.3 - clamped.1).max(0) as u32;
        if width < 8 || height < 8 {
            return Ok(None);
        }
        let textures = self.region_textures((width, height))?;
        let source = D3D11_BOX {
            left: (clamped.0 - self.monitor.0) as u32,
            top: (clamped.1 - self.monitor.1) as u32,
            front: 0,
            right: (clamped.2 - self.monitor.0) as u32,
            bottom: (clamped.3 - self.monitor.1) as u32,
            back: 1,
        };
        let (out_width, out_height) = ((width >> READ_LEVEL).max(1), (height >> READ_LEVEL).max(1));
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        // SAFETY: the box lies inside the desktop copy (clamped above) and fits mip 0 exactly;
        // mip READ_LEVEL is the staging texture's size; the mapping is released below.
        unsafe {
            self.context.CopySubresourceRegion(&textures.mips, 0, 0, 0, 0, &desktop, 0, Some(&source));
            self.context.GenerateMips(&textures.view);
            self.context.CopySubresourceRegion(&textures.staging, 0, 0, 0, 0, &textures.mips, READ_LEVEL, None);
            self.context.Map(&textures.staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
        }
        let row = out_width as usize * 4;
        let mut bgra = vec![0u8; row * out_height as usize];
        for (line, target) in bgra.chunks_exact_mut(row).enumerate() {
            // SAFETY: the mapping holds out_height rows of RowPitch bytes, each at least `row` long.
            let source = unsafe { std::slice::from_raw_parts((mapped.pData as *const u8).add(line * mapped.RowPitch as usize), row) };
            target.copy_from_slice(source);
        }
        // SAFETY: mapped above.
        unsafe { self.context.Unmap(&textures.staging, 0) };
        Ok(Some(Readback { rect: clamped, width: out_width, height: out_height, bgra }))
    }

    fn region_textures(&mut self, size: (u32, u32)) -> windows::core::Result<RegionTextures> {
        if let Some(textures) = &self.region {
            if textures.size == size {
                return Ok(RegionTextures { size, mips: textures.mips.clone(), view: textures.view.clone(), staging: textures.staging.clone() });
            }
        }
        let base = D3D11_TEXTURE2D_DESC {
            Width: size.0,
            Height: size.1,
            MipLevels: MIP_LEVELS,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: D3D11_RESOURCE_MISC_GENERATE_MIPS.0 as u32,
        };
        let staging_description = D3D11_TEXTURE2D_DESC {
            Width: (size.0 >> READ_LEVEL).max(1),
            Height: (size.1 >> READ_LEVEL).max(1),
            MipLevels: 1,
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
            ..base
        };
        let view_description = D3D11_SHADER_RESOURCE_VIEW_DESC {
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            ViewDimension: D3D11_SRV_DIMENSION_TEXTURE2D,
            Anonymous: D3D11_SHADER_RESOURCE_VIEW_DESC_0 { Texture2D: D3D11_TEX2D_SRV { MostDetailedMip: 0, MipLevels: MIP_LEVELS } },
        };
        let (mut mips, mut staging, mut view) = (None, None, None);
        // SAFETY: valid descriptions; out pointers are live locals.
        unsafe {
            self.device.CreateTexture2D(&base, None, Some(&mut mips))?;
            self.device.CreateTexture2D(&staging_description, None, Some(&mut staging))?;
        }
        let (Some(mips), Some(staging)) = (mips, staging) else {
            return Err(windows::core::Error::from_hresult(windows::Win32::Foundation::E_FAIL));
        };
        // SAFETY: the view matches the texture's format and mip count.
        unsafe { self.device.CreateShaderResourceView(&mips, Some(&view_description), Some(&mut view)) }?;
        let Some(view) = view else { return Err(windows::core::Error::from_hresult(windows::Win32::Foundation::E_FAIL)) };
        self.region = Some(RegionTextures { size, mips: mips.clone(), view: view.clone(), staging: staging.clone() });
        Ok(RegionTextures { size, mips, view, staging })
    }
}

#[repr(C)]
struct CompositionData {
    attribute: u32,
    data: *mut std::ffi::c_void,
    size: usize,
}

type SetCompositionFn = unsafe extern "system" fn(HWND, *mut CompositionData) -> BOOL;

/// WCA_EXCLUDED_FROM_DDA (Windows 10 1709+): the window is left out of Desktop Duplication only.
const WCA_EXCLUDED_FROM_DDA: u32 = 24;

/// Leaves `window` out of (or back in) Desktop Duplication. False where Windows has no such
/// attribute; the glass must then not capture, or it would blur itself.
pub(crate) fn exclude_from_capture(window: HWND, exclude: bool) -> bool {
    // SAFETY: user32 is loaded in every GUI process; the export is looked up by name and,
    // when present, has this signature (documented, though not in the SDK headers).
    unsafe {
        let Ok(user32) = GetModuleHandleW(windows::core::w!("user32.dll")) else { return false };
        let Some(function) = GetProcAddress(user32, PCSTR(c"SetWindowCompositionAttribute".as_ptr().cast())) else { return false };
        let set: SetCompositionFn = std::mem::transmute(function);
        let mut value = BOOL::from(exclude);
        let mut data = CompositionData {
            attribute: WCA_EXCLUDED_FROM_DDA,
            data: (&mut value as *mut BOOL).cast(),
            size: std::mem::size_of::<BOOL>(),
        };
        set(window, &mut data).as_bool()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn process_cpu_ms() -> f64 {
        use windows::Win32::{Foundation::FILETIME, System::Threading::{GetCurrentProcess, GetProcessTimes}};
        let (mut a, mut b, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
        // SAFETY: out pointers are live locals; the pseudo handle needs no closing.
        unsafe { GetProcessTimes(GetCurrentProcess(), &mut a, &mut b, &mut kernel, &mut user) }.unwrap();
        let ticks = |time: FILETIME| ((time.dwHighDateTime as u64) << 32 | time.dwLowDateTime as u64) as f64;
        (ticks(kernel) + ticks(user)) / 10_000.0
    }

    /// Manual measurement for docs/investigations/glass-live-backdrop.md:
    /// cargo test --release --manifest-path src-tauri/Cargo.toml capture_cost -- --ignored --nocapture
    /// Reads an 840×460 region at the top centre of the primary monitor for 10 s each: once
    /// only when it changes (as the glass does), once every 33 ms whatever happens (the worst case).
    #[test]
    #[ignore]
    fn capture_cost() {
        for forced in [false, true] {
            let mut duplication = Duplication::open((1, 1)).unwrap();
            let monitor = duplication.monitor;
            let left = (monitor.0 + monitor.2) / 2 - 420;
            let region = (left, monitor.1, left + 840, monitor.1 + 460);
            let (cpu_start, start) = (process_cpu_ms(), std::time::Instant::now());
            let (mut frames, mut touched, mut reads, mut read_ms, mut bytes) = (0, 0, 0, 0.0, 0usize);
            let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
            let mut pending = false;
            while start.elapsed().as_secs() < 10 {
                match duplication.next_frame(if forced { 5 } else { 50 }, region).unwrap() {
                    Frame::Timeout => {}
                    Frame::New { touches } => {
                        frames += 1;
                        if touches { touched += 1; pending = true; }
                    }
                }
                if (pending || forced) && last.elapsed().as_millis() >= 33 {
                    let at = std::time::Instant::now();
                    // Read back, then blur and pack as the glass does (60% blur).
                    if let Some(read) = duplication.read_region(region).unwrap() {
                        let message = crate::island::glass_capture::encode(read, 60, (0, 0));
                        bytes += message.len();
                        reads += 1;
                    }
                    read_ms += at.elapsed().as_secs_f64() * 1000.0;
                    pending = false;
                    last = std::time::Instant::now();
                }
            }
            let cpu = process_cpu_ms() - cpu_start;
            let wall = start.elapsed().as_secs_f64() * 1000.0;
            println!(
                "forced={forced} frames={frames} touched={touched} reads={reads} bytes/frame={} read+blur avg={:.2}ms cpu={:.1}ms ({:.2}% of one core)",
                bytes.checked_div(reads).unwrap_or(0),
                if reads > 0 { read_ms / reads as f64 } else { 0.0 },
                cpu,
                cpu / wall * 100.0
            );
        }
    }

    #[test]
    fn rectangles_meet_only_when_they_overlap() {
        assert!(intersects((0, 0, 10, 10), (5, 5, 20, 20)));
        assert!(!intersects((0, 0, 10, 10), (10, 0, 20, 10)));
        assert!(contains((0, 0, 10, 10), (0, 9)));
        assert!(!contains((0, 0, 10, 10), (10, 5)));
    }
}
