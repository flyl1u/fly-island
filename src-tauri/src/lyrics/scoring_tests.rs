use super::*;

fn playing<'a>(title: &'a str, artist: &'a str, duration_ms: i64) -> Playing<'a> {
    Playing { title, artist, album: "", duration_ms }
}

fn listed<'a>(name: &'a str, singer: &'a str, duration_ms: i64) -> Listed<'a> {
    Listed { name, singer, album: "", duration_ms }
}

fn rated(p: &Playing, name: &str, singer: &str, duration_ms: i64) -> u32 {
    score(p, &listed(name, singer, duration_ms))
}

#[test]
fn titles_lose_noise_notes_and_featured_parts_but_keep_other_brackets() {
    assert_eq!(normalize_title("Yesterday - Remastered 2009"), "yesterday");
    assert_eq!(normalize_title("Song (feat. Someone)"), "song");
    assert_eq!(normalize_title("Song feat. Someone"), "song");
    assert_eq!(normalize_title("Song [Explicit]"), "song");
    assert_eq!(normalize_title("七里香 (周杰伦)"), "七里香 周杰伦");
    assert_eq!(normalize_title("ＡＢＣ　（Deluxe Edition）"), "abc");
    assert_eq!(normalize_title("晴天 - 周杰倫"), "晴天 周杰伦");
}

#[test]
fn traditional_and_simplified_titles_are_the_same() {
    assert_eq!(title_similarity("餘香", "余香"), 100);
    assert!(title_similarity("Yesterday", "yesterday (Remastered 2015)") >= 95);
}

#[test]
fn unrelated_titles_do_not_match() {
    assert_eq!(title_similarity("晴天", "七里香"), 0);
    assert_eq!(title_similarity("", "x"), 0);
}

#[test]
fn jaro_winkler_rewards_shared_prefixes() {
    assert_eq!(jaro_winkler("abc", "abc"), 1.0);
    assert_eq!(jaro_winkler("abc", ""), 0.0);
    assert!(jaro_winkler("martha", "marhta") > 0.95);
    assert!(jaro_winkler("dixon", "dicksonx") > 0.8);
    assert!(jaro_winkler("abc", "xyz") < 0.1);
}

#[test]
fn version_words_name_other_recordings_but_a_remaster_does_not() {
    assert!(version_tags("晴天 (Live)").contains("live"));
    assert!(version_tags("Song - Remix").contains("remix"));
    assert!(version_tags("Song (DJ版)").contains("special"));
    assert!(version_tags("Song (Acoustic Version)").contains("acoustic"));
    assert!(version_tags("Song (抖音版)").contains("clip"));
    assert!(version_tags("Song (AI)").contains("ai"));
    assert!(version_tags("Yesterday - Remastered 2009").is_empty());
    assert!(version_tags("Song (Deluxe Edition)").is_empty());
    // A word inside a longer one is not a version word.
    assert!(version_tags("Alive Again").is_empty());
    assert!(version_tags("Brain Damage").is_empty());
}

#[test]
fn duration_falls_from_a_second_to_eight() {
    assert_eq!(duration_similarity(200_000, 200_900), Some(1.0));
    assert!((duration_similarity(200_000, 203_000).unwrap() - 0.8).abs() < 1e-9);
    assert!(duration_similarity(200_000, 205_500).unwrap() < 0.5);
    assert_eq!(duration_similarity(200_000, 208_000).map(|v| v.round()), Some(0.0));
    assert_eq!(duration_similarity(200_000, 208_001), None);
}

#[test]
fn the_same_recording_scores_high_from_any_source() {
    let p = playing("晴天", "周杰伦", 269_000);
    assert!(rated(&p, "晴天", "周杰伦", 269_000) >= 98);
    assert!(rated(&p, "晴天", "周杰倫", 268_000) >= 95);
    // A source without a length is judged on title and singer alone.
    assert!(rated(&p, "晴天", "周杰伦", 0) >= 95);
    assert!(rated(&playing("晴天", "周杰伦", 0), "晴天", "周杰伦", 269_000) >= 95);
}

#[test]
fn another_version_of_the_song_is_rejected() {
    let p = playing("晴天", "周杰伦", 269_000);
    assert!(rated(&p, "晴天 (Live)", "周杰伦", 300_000) < SCORE_THRESHOLD);
    assert!(rated(&p, "晴天 (DJ版)", "周杰伦", 269_000) < SCORE_THRESHOLD);
    assert!(rated(&p, "晴天 (抖音版)", "周杰伦", 269_000) < SCORE_THRESHOLD);
    let live = playing("晴天 (Live)", "周杰伦", 300_000);
    assert!(rated(&live, "晴天 (Live)", "周杰伦", 300_000) >= 95);
    assert!(rated(&live, "晴天", "周杰伦", 300_000) < SCORE_THRESHOLD);
}

#[test]
fn a_cover_by_someone_else_is_rejected() {
    let p = playing("晴天", "周杰伦", 269_000);
    assert_eq!(rated(&p, "晴天", "别人", 269_000), 0);
    assert_eq!(rated(&p, "晴天", "张学友 (翻唱)", 269_000), 0);
}

#[test]
fn a_length_far_off_is_another_recording() {
    let p = playing("Song", "Artist", 200_000);
    assert!(rated(&p, "Song", "Artist", 203_000) >= SCORE_THRESHOLD);
    assert_eq!(rated(&p, "Song", "Artist", 209_000), 0);
    assert_eq!(rated(&p, "Song", "Artist", 150_000), 0);
}

#[test]
fn a_remaster_and_a_featured_singer_still_match() {
    let p = playing("Yesterday", "The Beatles", 125_000);
    assert!(rated(&p, "Yesterday - Remastered 2009", "The Beatles", 125_000) >= 95);
    let p = playing("Get Lucky (feat. Pharrell Williams)", "Daft Punk", 369_000);
    assert!(rated(&p, "Get Lucky", "Daft Punk, Pharrell Williams", 369_000) >= SCORE_THRESHOLD);
}

#[test]
fn unknown_singers_do_not_rule_a_result_out() {
    let p = playing("Song", "", 200_000);
    assert!(rated(&p, "Song", "Anyone", 200_000) >= 95);
    let p = playing("Song", "Unknown Artist", 200_000);
    assert!(rated(&p, "Song", "Anyone", 200_000) >= 95);
}

#[test]
fn the_album_only_breaks_ties() {
    let p = Playing { title: "Song", artist: "Artist", album: "Greatest Hits", duration_ms: 200_000 };
    let same = score(&p, &Listed { name: "Song", singer: "Artist", album: "Greatest Hits", duration_ms: 200_000 });
    let other = score(&p, &Listed { name: "Song", singer: "Artist", album: "Another", duration_ms: 200_000 });
    assert!(same >= other);
    assert!(same - other <= 3);
}

#[test]
fn ranking_orders_by_score_and_drops_weak_results() {
    let p = playing("晴天", "周杰伦", 269_000);
    let candidate = |id: u32, name: &str, singer: &str, ms: i64| Candidate { id, name: name.into(), singer: singer.into(), album: String::new(), duration_ms: ms };
    let results = [
        candidate(1, "晴天 (Live)", "周杰伦", 300_000),
        candidate(2, "晴天", "周杰伦", 272_000),
        candidate(3, "晴天", "周杰伦", 269_000),
        candidate(3, "晴天", "周杰伦", 269_000),
        candidate(4, "晴天", "别人", 269_000),
    ];
    let order: Vec<u32> = ranked(&p, &results).into_iter().map(|(_, id)| id).collect();
    assert_eq!(order, [3, 2]);
}

#[test]
fn search_words_start_with_the_title_and_artist_as_given() {
    let words = search_keywords("晴天", "周杰伦", 5);
    assert_eq!(words[0], "晴天 周杰伦");
    assert!(words.len() <= 5);
}

#[test]
fn search_words_drop_version_notes_and_featured_singers() {
    let words = search_keywords("Get Lucky (feat. Pharrell Williams)", "Daft Punk feat. Pharrell Williams", 8);
    assert!(words.contains(&"Get Lucky Daft Punk".to_string()) || words.iter().any(|word| word.starts_with("get lucky daft punk")), "{words:?}");
    assert!(words.iter().all(|word| !word.is_empty()));
    let unique: std::collections::HashSet<_> = words.iter().collect();
    assert_eq!(unique.len(), words.len());
}

#[test]
fn search_words_write_traditional_names_in_simplified() {
    let words = search_keywords("餘香", "張小九", 8);
    assert!(words.contains(&"余香 张小九".to_string()), "{words:?}");
}

#[test]
fn search_words_do_not_repeat_the_artist_a_title_already_ends_with() {
    let words = search_keywords("Song - Artist", "Artist", 4);
    assert_eq!(words[0], "Song - Artist");
}

#[test]
fn search_words_are_limited() {
    assert_eq!(search_keywords("Song (Live) (feat. X)", "A feat. B", 2).len(), 2);
    assert!(search_keywords("", "", 3).is_empty());
}
