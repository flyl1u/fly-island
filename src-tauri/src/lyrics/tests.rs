//! The lyrics cache, the source order and the display text, checked without Tauri.

use super::*;

fn found(lrc: &str, translation: Option<&str>) -> FoundLyrics {
    FoundLyrics { lrc: lrc.into(), translation: translation.map(Into::into), duration_ms: None }
}

#[test]
fn the_cache_keeps_lyrics_with_their_source_and_recent_misses() {
    let dir = std::env::temp_dir().join(format!("focusd-lyrics-cache-{}", std::process::id()));
    let now = 1_800_000_000;
    assert_eq!(read_cache(&dir, "a", now), None);
    write_cache(&dir, "a", Some(&("kugou", found("[00:01.00]x", Some("[00:01.00]译")))), now);
    write_cache(&dir, "b", None, now);
    assert_eq!(read_cache(&dir, "a", now + 999_999_999), Some(Some(("kugou", found("[00:01.00]x", Some("[00:01.00]译"))))));
    assert_eq!(read_cache(&dir, "b", now + 60), Some(None));
    // A miss is asked about again after a week.
    assert_eq!(read_cache(&dir, "b", now + MISSING_TTL.as_secs()), None);
    // Entries without a source came from LRCLIB.
    fs::write(cache_path(&dir, "old"), r#"{"key":"old","lrc":"[00:01.00]y","durations":true,"fetchedAt":1}"#).unwrap();
    assert_eq!(read_cache(&dir, "old", now), Some(Some(("lrclib", found("[00:01.00]y", None)))));
    // The song's length is kept; lyrics cached before lengths were are fetched again.
    let timed = FoundLyrics { duration_ms: Some(246_000), ..found("[00:01.00]t", None) };
    write_cache(&dir, "t", Some(&("netease", timed.clone())), now);
    assert_eq!(read_cache(&dir, "t", now), Some(Some(("netease", timed))));
    fs::write(cache_path(&dir, "untimed"), r#"{"key":"untimed","lrc":"[00:01.00]u","source":"netease","fetchedAt":1}"#).unwrap();
    assert_eq!(read_cache(&dir, "untimed", now), None);
    // Kugou lyrics cached before word times were kept are fetched again.
    fs::write(cache_path(&dir, "k"), r#"{"key":"k","lrc":"[00:01.00]z","source":"kugou","fetchedAt":1}"#).unwrap();
    assert_eq!(read_cache(&dir, "k", now), None);
    fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn traditional_lyrics_are_shown_simplified_for_a_track_named_in_simplified() {
    let lrc = "[00:31.50] 劃一根火柴 將慵倦的夜點亮";
    let shown = for_display("lrclib", found(lrc, Some("[00:31.50] 劃一根火柴 將慵倦的夜點亮")), "余香", "张小九");
    assert_eq!(shown.lrc, "[00:31.50] 划一根火柴 将慵倦的夜点亮");
    assert_eq!(shown.translation.as_deref(), Some("[00:31.50] 划一根火柴 将慵倦的夜点亮"));
    assert_eq!(for_display("lrclib", found(lrc, None), "餘香", "張小九").lrc, lrc);
}

#[test]
fn chinese_songs_ask_the_chinese_sources_first() {
    let query = |title: &str, chinese: bool, track_id: Option<&str>| LyricsQuery {
        title: title.into(),
        artist: String::new(),
        album: String::new(),
        duration_ms: 0,
        folder: String::new(),
        online: true,
        chinese,
        track_id: track_id.map(Into::into),
        source_app_id: None,
        word_fill: false,
        apple_music: false,
    };
    assert_eq!(source_order(&query("余香", false, None)), ["lrclib"]);
    assert_eq!(source_order(&query("余香", true, None)), ["kugou", "netease", "qqmusic", "lrclib"]);
    assert_eq!(source_order(&query("Yesterday", true, None)), ["lrclib", "kugou", "netease", "qqmusic"]);
    assert_eq!(source_order(&query("Yesterday", true, Some("NCM-1"))), ["netease", "kugou", "qqmusic", "lrclib"]);
    assert_eq!(source_order(&query("Yesterday", true, Some("QQ-123")))[0], "qqmusic");
}

#[test]
fn apple_music_is_asked_first_only_when_the_player_is_it() {
    let query = |chinese: bool, player: Option<&str>, apple_music: bool| LyricsQuery {
        title: "Yesterday".into(),
        artist: String::new(),
        album: String::new(),
        duration_ms: 0,
        folder: String::new(),
        online: true,
        chinese,
        track_id: None,
        source_app_id: player.map(Into::into),
        word_fill: false,
        apple_music,
    };
    // The official lyrics come first, for English songs as well.
    assert_eq!(source_order(&query(false, Some("AppleMusic.exe"), true)), ["applemusic", "lrclib"]);
    assert_eq!(source_order(&query(true, Some("AppleMusic.exe"), true))[0], "applemusic");
    // Another player, or the source turned off, keeps the old order.
    assert_eq!(source_order(&query(false, Some("Spotify.exe"), true)), ["lrclib"]);
    assert_eq!(source_order(&query(false, Some("AppleMusic.exe"), false)), ["lrclib"]);
    assert_eq!(source_order(&query(false, None, true)), ["lrclib"]);
}

#[test]
fn apple_music_lyrics_get_their_own_cache_key() {
    let query = |apple_music: bool| LyricsQuery {
        title: "Yesterday".into(),
        artist: "The Beatles".into(),
        album: String::new(),
        duration_ms: 200_000,
        folder: String::new(),
        online: true,
        chinese: false,
        track_id: None,
        source_app_id: Some("AppleMusic.exe".into()),
        word_fill: false,
        apple_music,
    };
    let off = query(false);
    let on = query(true);
    // Turning the setting on must not read the lyric another source cached before.
    assert_ne!(cache_scoped_key(&on, true), cache_scoped_key(&off, true));
    // With it off the key is the one used before, so the old cache still works.
    assert_eq!(cache_scoped_key(&off, true), format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}",
        cache_key("Yesterday", "The Beatles", 200_000),
        "Yesterday",
        "AppleMusic.exe",
        ""
    ));
    // The fallback key stays the old one for both, so upgrading users keep their lyrics.
    assert_eq!(cache_base_key(&off), cache_key("Yesterday", "The Beatles", 200_000));
    assert_eq!(cache_base_key(&on), cache_base_key(&off));
}

#[test]
fn a_removed_token_gets_its_own_cache_key() {
    let query = |apple_music: bool| LyricsQuery {
        title: "Yesterday".into(),
        artist: "The Beatles".into(),
        album: String::new(),
        duration_ms: 200_000,
        folder: String::new(),
        online: true,
        chinese: false,
        track_id: None,
        source_app_id: Some("AppleMusic.exe".into()),
        word_fill: false,
        apple_music,
    };
    // Without a token Apple is not asked, and the miss written then must not hide the real
    // lyric for the week a miss is kept once the token comes back.
    assert_ne!(cache_scoped_key(&query(true), true), cache_scoped_key(&query(true), false));
    // The other sources do not depend on the token.
    assert_eq!(cache_scoped_key(&query(false), true), cache_scoped_key(&query(false), false));
}

#[test]
fn apple_lyrics_cached_under_the_plain_key_are_dropped_when_they_may_not_be_used() {
    let apple = || ("applemusic", found("[00:01.00]a", None));
    assert!(cache_answer(Some(Some(apple())), false).is_none(), "setting off, or token removed");
    assert!(cache_answer(Some(Some(apple())), true).is_some());
    assert!(cache_answer(Some(Some(("lrclib", found("[00:01.00]b", None)))), false).is_some(),
        "other sources are not Apple's to hold back");
    assert!(cache_answer(Some(None), false).is_some(), "a cached miss stays a miss");
    assert!(cache_answer(None, false).is_none());
}

#[test]
fn pruning_keeps_the_newest_files() {
    let dir = std::env::temp_dir().join(format!("focusd-lyrics-prune-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    for name in ["1", "2", "3"] {
        fs::write(dir.join(name), name).unwrap();
        std::thread::sleep(Duration::from_millis(20));
    }
    prune_cache(&dir, 2);
    let mut left: Vec<String> = fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into()).collect();
    left.sort();
    assert_eq!(left, ["2", "3"]);
    fs::remove_dir_all(&dir).unwrap();
}
