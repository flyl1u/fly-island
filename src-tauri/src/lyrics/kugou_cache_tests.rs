use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use flate2::{write::ZlibEncoder, Compression};
use std::io::Write;

fn fixture(raw: &str) -> Vec<u8> {
    let key = [
        0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e,
        0x69,
    ];
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(raw.as_bytes()).unwrap();
    let mut bytes = b"krc1".to_vec();
    bytes.extend(
        encoder
            .finish()
            .unwrap()
            .iter()
            .enumerate()
            .map(|(i, b)| b ^ key[i % 16]),
    );
    bytes
}

#[test]
fn ini_encodings_and_cache_filename() {
    let ini = "[Download]\r\nLyricPath=D:\\音乐\\歌词\\\r\n";
    let bytes = [
        vec![0xff, 0xfe],
        ini.encode_utf16().flat_map(u16::to_le_bytes).collect(),
    ]
    .concat();
    assert_eq!(
        directory_from_ini(ini.as_bytes()),
        directory_from_ini(&bytes)
    );
    assert_eq!(
        directory_from_ini(&bytes),
        Some(PathBuf::from("D:\\音乐\\歌词\\"))
    );
    assert_eq!(directory_from_ini(b"LyricPath="), None);
    assert_eq!(
        identity("歌手 - 歌-0123456789abcdef0123456789abcdef-1-0000DA"),
        Some(("歌", "歌手"))
    );
    assert_eq!(identity("歌手 - 歌-invalid"), None);
    assert_eq!(directory_from_ini(ini.as_bytes()), directory_from_ini(&bytes[2..]));
    let big = ini.encode_utf16().flat_map(u16::to_be_bytes).collect::<Vec<_>>();
    assert_eq!(directory_from_ini(&big), directory_from_ini(&bytes));
    assert!(super::super::matching::native_artist_subset("甲/乙", "甲"));
    assert!(!super::super::matching::native_artist_subset("甲/乙", "甲/丙"));
}

#[test]
fn native_krc_checks_headers_offset_and_corruption() {
    let raw =
        "[ti:测试歌]\n[ar:歌手]\n[total:120000]\n[offset:25]\n[1000,500]<0,200,0>你<300,200,0>好";
    let bytes = fixture(raw);
    assert_eq!(krc::decrypt_bytes(&bytes).as_deref(), Some(raw));
    assert_eq!(krc::decrypt(&STANDARD.encode(&bytes)).as_deref(), Some(raw));
    for bad in [b"".as_slice(), b"krc1broken", b"lrc1invalid"] {
        assert!(krc::decrypt_bytes(bad).is_none());
    }
    assert!(krc::decrypt_bytes(&fixture(&"x".repeat(1024 * 1024 + 1))).is_none());
    let dir = std::env::temp_dir().join(format!("focusd-native-krc-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("歌手 - 测试歌-0123456789abcdef0123456789abcdef.krc");
    fs::write(&path, bytes).unwrap();
    let found = read_directory(&dir, "测试歌", "歌手", 120_000).unwrap();
    assert!(found
        .lrc
        .contains("[00:01.02]<00:01.02>你<00:01.22><00:01.32>好<00:01.52>"));
    for (title, artist, duration) in [
        ("测试歌 (Live)", "歌手", 120_000),
        ("测试歌", "其他", 120_000),
        ("测试歌", "歌手", 150_000),
    ] {
        assert!(read_directory(&dir, title, artist, duration).is_none());
    }
    fs::write(&path, fixture(&raw.replace("[ar:歌手]", "[ar:其他]"))).unwrap();
    assert!(read_directory(&dir, "测试歌", "歌手", 120_000).is_none());
    fs::remove_file(path).unwrap();
    fs::remove_dir(dir).unwrap();
}
