//! Every Windows API call of the engine. This is the only module that contains `unsafe`;
//! everything it returns is plain Rust data, so the readers and their proofs stay pure.
pub(crate) mod bluetooth;
pub(crate) mod hid_meta;
pub(crate) mod paths;
pub(crate) mod xinput;

/// UTF-16 up to the first NUL.
fn from_wide(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

fn to_wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}
