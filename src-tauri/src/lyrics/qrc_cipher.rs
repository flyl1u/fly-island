//! QQ cloud QRC uses DES EDE with swapped 32-bit byte order, a shifted PC2 right half,
//! and two historical S-box values. These protocol constants are not standard DES.
//! Format cross-check: EllanStudio/qqmusic-api, QQMusicQrcCipher.java.

use flate2::read::ZlibDecoder;
use std::io::Read;

const IP: [u8; 64] = [
    58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6,
    64, 56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61,
    53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];
const PC1: [u8; 56] = [
    57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60,
    52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29,
    21, 13, 5, 28, 20, 12, 4,
];
const PC2: [u8; 48] = [
    14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52,
    31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];
const E: [u8; 48] = [
    32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18,
    19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];
const P: [u8; 32] = [
    16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19,
    13, 30, 6, 22, 11, 4, 25,
];
const S: [[u8; 64]; 8] = [
    [
        14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12,
        11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9,
        1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
    ],
    [
        15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 15, 12, 0, 1,
        10, 6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15,
        4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
    ],
    [
        10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5,
        14, 12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6,
        9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
    ],
    [
        7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2,
        12, 1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10,
        10, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
    ],
    [
        2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15,
        10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14,
        2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
    ],
    [
        12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13,
        14, 0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5,
        15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
    ],
    [
        4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5,
        12, 2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4,
        10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
    ],
    [
        13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6,
        11, 0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10,
        8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
    ],
];

fn permute(value: u64, width: u8, table: &[u8]) -> u64 {
    table
        .iter()
        .fold(0, |out, bit| (out << 1) | ((value >> (width - bit)) & 1))
}

fn swapped(bytes: [u8; 8]) -> u64 {
    let [a, b, c, d, e, f, g, h] = bytes;
    u64::from_be_bytes([d, c, b, a, h, g, f, e])
}

fn schedule(key: [u8; 8], decrypt: bool) -> [u64; 16] {
    let chosen = permute(swapped(key), 64, &PC1);
    let (mut c, mut d) = (chosen >> 28, chosen & 0x0fff_ffff);
    let mut keys = [0; 16];
    for (round, shift) in [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]
        .into_iter()
        .enumerate()
    {
        c = ((c << shift) | (c >> (28 - shift))) & 0x0fff_ffff;
        d = ((d << shift) | (d >> (28 - shift))) & 0x0fff_ffff;
        // QRC reads the right half one bit later, including its trailing zero bit.
        let key = PC2.iter().fold(0, |out, bit| {
            let value = if *bit <= 28 {
                (c >> (28 - bit)) & 1
            } else {
                ((d << 1) >> (56 - bit)) & 1
            };
            (out << 1) | value
        });
        keys[if decrypt { 15 - round } else { round }] = key;
    }
    keys
}

fn block(value: u64, keys: &[u64; 16]) -> u64 {
    let input = permute(value, 64, &IP);
    let (mut left, mut right) = ((input >> 32) as u32, input as u32);
    for key in keys {
        let expanded = permute(right as u64, 32, &E) ^ key;
        let substituted = S.iter().enumerate().fold(0u32, |out, (i, table)| {
            let six = ((expanded >> (42 - i * 6)) & 63) as usize;
            let at = (six & 32) | ((six & 1) << 4) | ((six >> 1) & 15);
            (out << 4) | table[at] as u32
        });
        (left, right) = (right, left ^ permute(substituted as u64, 32, &P) as u32);
    }
    let joined = ((right as u64) << 32) | left as u64;
    IP.iter().enumerate().fold(0, |out, (i, bit)| {
        out | (((joined >> (63 - i)) & 1) << (64 - bit))
    })
}

pub(super) fn decrypt(hex: &str) -> Option<String> {
    let hex = hex.trim().as_bytes();
    if hex.is_empty() || hex.len() > 2 * 1024 * 1024 || !hex.len().is_multiple_of(16) {
        return None;
    }
    let nibble = |b: u8| (b as char).to_digit(16).map(|n| n as u8);
    let bytes = hex
        .as_chunks::<2>().0.iter()
        .map(|b| Some(nibble(b[0])? * 16 + nibble(b[1])?))
        .collect::<Option<Vec<_>>>()?;
    let keys = [
        schedule(*b"!@#)(NHL", true),
        schedule(*b"123ZXC!@", false),
        schedule(*b"!@#)(*$%", true),
    ];
    let mut plain = Vec::with_capacity(bytes.len());
    for chunk in bytes.as_chunks::<8>().0 {
        let mut value = swapped(*chunk);
        for key in &keys {
            value = block(value, key);
        }
        plain.extend_from_slice(&swapped(value.to_be_bytes()).to_be_bytes());
    }
    let mut text = String::new();
    ZlibDecoder::new(plain.as_slice())
        .take(1024 * 1024 + 1)
        .read_to_string(&mut text)
        .ok()?;
    (text.len() <= 1024 * 1024).then_some(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn independent_cloud_cipher_vector_and_invalid_blocks() {
        // Independent synthetic LRC vector from QQMusicLyricParserTest.java (not generated by this cipher).
        let hex = "32dabb4c5e9846fa6f3a98a26231e62faa2f92527b4b66399aceac954ccbb7bce2d996df595836a57589df8de3f46727";
        let plain = decrypt(hex).unwrap();
        assert_eq!(plain, "[00:01.23]第一行\n[00:05.50]第二行");
        // A second independent vector exercises compressed XML and postfix QRC word timing.
        let xml = decrypt(concat!(
            "c90db2e3f6940a43538b45865eb6753863c981f936a71a093b450246d48b65f0b",
            "ca0d019ca6bbd156e3ebffa6fd6edbca8844d4a71cc99957d1e4828a5d387d33",
            "34ba1a902b1b105ea9e737bd1ca2f5862f78ca9c540375d0f3e038dfdeecd6e7",
            "da089e3812bfcdc66a4cc0c1b9cdfa4a20f956ffd8bccc00848137285a5169f"
        )).unwrap();
        let lines = super::super::word_formats::qrc(&xml);
        assert_eq!(lines[0].0, 1000);
        assert!(lines[0].1.contains("<00:01.40>"));
        for broken in ["", "00", "zzzzzzzzzzzzzzzz", "0000000000000000"] {
            assert_eq!(decrypt(broken), None);
        }
    }
}
