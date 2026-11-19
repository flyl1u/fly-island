//! Album art shrunk to the size the island shows it at.
//!
//! NetEase Cloud Music with InfLink-rs hands Windows the original cover bytes, often a few
//! thousand pixels and several MB. Each state read then sent that whole picture as a data URL to
//! the page, and a cover over the old 4 MB limit counted as missing and was read again every
//! second, the player copying it across processes each time (issue #93: 22% CPU in NetEase and 31%
//! in the media session service while music played).

use windows::{
    Graphics::Imaging::{BitmapDecoder, BitmapEncoder, BitmapInterpolationMode},
    Storage::Streams::{DataReader, DataWriter, IInputStream, IRandomAccessStream, InMemoryRandomAccessStream},
    core::Interface,
};

/// The longest side kept: the cover is at most about 120 CSS px on a 2x screen.
const MAX_SIDE: u32 = 320;
/// Smaller files are passed through without decoding them.
const PASS_THROUGH_BYTES: usize = 96 * 1024;

/// `bytes` re-encoded with its longest side at most [`MAX_SIDE`], in the same format; the bytes
/// as they are when they are small already or cannot be decoded.
pub(super) fn shrink(bytes: Vec<u8>) -> Vec<u8> {
    if bytes.len() <= PASS_THROUGH_BYTES {
        return bytes;
    }
    transcode(&bytes).unwrap_or(bytes)
}

fn transcode(bytes: &[u8]) -> windows::core::Result<Vec<u8>> {
    let source = InMemoryRandomAccessStream::new()?;
    let writer = DataWriter::CreateDataWriter(&source)?;
    writer.WriteBytes(bytes)?;
    pollster::block_on(writer.StoreAsync()?)?;
    writer.DetachStream()?;
    source.Seek(0)?;

    let source: IRandomAccessStream = source.cast()?;
    let decoder = pollster::block_on(BitmapDecoder::CreateAsync(&source)?)?;
    let (width, height) = (decoder.PixelWidth()?, decoder.PixelHeight()?);
    let longest = width.max(height);
    if longest <= MAX_SIDE || width == 0 || height == 0 {
        return Ok(bytes.to_vec());
    }
    let scale = f64::from(MAX_SIDE) / f64::from(longest);
    let scaled = |side: u32| ((f64::from(side) * scale).round() as u32).max(1);

    let target = InMemoryRandomAccessStream::new()?;
    let target_stream: IRandomAccessStream = target.cast()?;
    let encoder = pollster::block_on(BitmapEncoder::CreateForTranscodingAsync(&target_stream, &decoder)?)?;
    let transform = encoder.BitmapTransform()?;
    transform.SetScaledWidth(scaled(width))?;
    transform.SetScaledHeight(scaled(height))?;
    transform.SetInterpolationMode(BitmapInterpolationMode::Fant)?;
    pollster::block_on(encoder.FlushAsync()?)?;

    let size = target.Size()?;
    target.Seek(0)?;
    let input: IInputStream = target.cast()?;
    let reader = DataReader::CreateDataReader(&input)?;
    let loaded = pollster::block_on(reader.LoadAsync(size as u32)?)?;
    let mut output = vec![0u8; loaded as usize];
    reader.ReadBytes(&mut output)?;
    // A transcode that grew the file (an already small JPEG at a large size) is not worth it.
    Ok(if output.is_empty() || output.len() >= bytes.len() { bytes.to_vec() } else { output })
}
