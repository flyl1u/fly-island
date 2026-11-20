//! Tests of the Apple Music source: the token, the search and the addresses are pure
//! functions, so they are checked without a network.

use super::*;
use serde_json::json;

#[test]
fn the_developer_token_is_the_whole_three_part_jwt() {
    let script = "const t=\"eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJhcHBsZSIsInN1YiI6InRlc3QifQ.abc-DEF_123\";";
    assert_eq!(
        find_jwt(script),
        Some("eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJhcHBsZSIsInN1YiI6InRlc3QifQ.abc-DEF_123".to_string())
    );
    // A token without its two dots is not a token.
    assert_eq!(find_jwt("eyJonlyonepart"), None);
    assert_eq!(find_jwt("eyJhbGciOiJIUzI1NiJ9..signature"), None);
    assert_eq!(find_jwt("nothing here"), None);
}

#[test]
fn the_script_of_the_web_app_is_found_in_its_page() {
    let html = "<html><script src=\"/assets/index-4f2a91c.js\"></script></html>";
    assert_eq!(find_script_url(html), Some("https://music.apple.com/assets/index-4f2a91c.js".to_string()));
    assert_eq!(find_script_url("<html></html>"), None);
}

#[test]
fn the_right_song_is_picked_out_of_the_same_name() {
    // Apple's search nests the songs in an object of their own.
    let answer = json!({ "results": { "songs": { "href": "https://example.test/songs", "data": [
        { "id": "1", "type": "songs", "attributes": { "name": "余香", "artistName": "小匆匆", "durationInMillis": 244_000 } },
        { "id": "2", "type": "songs", "attributes": { "name": "余香", "artistName": "张小九", "durationInMillis": 228_816 } },
        { "id": "3", "type": "songs", "attributes": { "name": "余香", "artistName": "张小九", "durationInMillis": 246_019 } },
    ] } } });
    assert_eq!(best_song(&answer, "余香", "张小九", 246_000), Some(("3".to_string(), 246_019)));
    assert_eq!(best_song(&answer, "七里香", "周杰伦", 0), None);
}

#[test]
fn the_addresses_carry_the_storefront_the_language_and_the_term() {
    assert_eq!(
        search_url("cn", "zh-Hans-CN", "余香 张小九"),
        "https://amp-api.music.apple.com/v1/catalog/cn/search?term=%E4%BD%99%E9%A6%99%20%E5%BC%A0%E5%B0%8F%E4%B9%9D&types=songs&limit=20&l=zh-Hans-CN"
    );
    assert_eq!(
        song_url("us", "en-US", "12345"),
        "https://amp-api.music.apple.com/v1/catalog/us/songs/12345?include[songs]=lyrics,syllable-lyrics&l=en-US"
    );
    assert_eq!(
        lyrics_urls("us", "en-US", "12345"),
        [
            "https://amp-api.music.apple.com/v1/catalog/us/songs/12345/syllable-lyrics?l=en-US&extend=ttmlLocalizations",
            "https://amp-api.music.apple.com/v1/catalog/us/songs/12345?include[songs]=lyrics,syllable-lyrics&l=en-US",
            "https://amp-api.music.apple.com/v1/catalog/us/songs/12345/lyrics?l=en-US",
        ]
    );
    assert_eq!(encode_query("a b&c"), "a%20b%26c");
}

#[test]
fn the_official_lyrics_come_as_ttml() {
    let ttml = "<tt xmlns=\"http://www.w3.org/ns/ttml\"><body><div><p begin=\"00:00:01.000\" itunes:key=\"k1\">Hello world</p></div></body>                <translation type=\"subtitle\"><text for=\"k1\">你好世界</text></translation></tt>";
    let answer = json!({ "data": [{ "relationships": { "syllable-lyrics": { "data": [{ "attributes": { "ttml": ttml } }] } } }] });
    let found = lyrics_of(&answer, "Song").unwrap();
    assert_eq!(found.lrc, "[00:01.00]Hello world\n");
    assert_eq!(found.translation.as_deref(), Some("[00:01.00]你好世界\n"));
    // The per-language copy is used when there is no whole-file one.
    let localized = json!({ "data": [{ "relationships": { "lyrics": { "data": [{ "attributes": {
        "ttmlLocalizations": { "en-US": { "ttml": ttml } } } }] } } }] });
    assert!(lyrics_of(&localized, "Song").is_some());
    assert_eq!(lyrics_of(&json!({ "data": [] }), "Song"), None);
}

#[test]
fn the_lyrics_of_a_sub_resource_are_read_from_its_own_attributes() {
    // The sub-resource holds the words right away, the way the Windows client caches them.
    let ttml = "<tt xmlns=\"http://www.w3.org/ns/ttml\"><body><div><p begin=\"00:00:01.000\" itunes:key=\"k1\">Hello world</p></div></body>                <translation type=\"subtitle\"><text for=\"k1\">你好世界</text></translation></tt>";
    let answer = json!({ "data": [{ "id": "1", "type": "syllable-lyrics", "attributes": { "ttml": ttml } }] });
    let found = lyrics_of(&answer, "Song").unwrap();
    assert_eq!(found.lrc, "[00:01.00]Hello world\n");
    assert_eq!(found.translation.as_deref(), Some("[00:01.00]你好世界\n"));
    // The same file may come as the string of the whole localization.
    let plain = json!({ "data": [{ "id": "1", "type": "syllable-lyrics", "attributes": { "ttmlLocalizations": ttml } }] });
    assert!(lyrics_of(&plain, "Song").is_some());
}
