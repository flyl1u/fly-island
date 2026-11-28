use super::*;

/// A TTML file as Apple sends it: word times on the spans, the translations
/// and the pinyin under the metadata.
const TTML: &str = r#"<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" itunes:timing="Word" xml:lang="zh-Hans">
<head><metadata><ttm:agent type="person" xml:id="v1"/><ttm:agent type="group" xml:id="v1000"/>
<iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal" leadingSilence="0.520"><translations/>
<songwriters><songwriter>薛之谦</songwriter></songwriters>
<transliterations><transliteration xml:lang="zh-Latn-pinyin"><text for="L1"><span begin="14.342" end="14.619">wo</span></text></transliteration></transliterations>
</iTunesMetadata></metadata></head>
<body><div>
<p begin="4:45.248" end="4:57.524" itunes:key="L37" ttm:agent="v2"><span begin="4:45.248" end="4:45.756">不然</span><span begin="4:45.756" end="4:47.203">只爱着</span><span begin="4:47.203" end="4:48.093">你</span> <span begin="4:49.129" end="4:50.072">我怎么</span></p>
</div></body></tt>"#;

/// The same line, with the translations Apple sends.
fn ttml_with(translations: &str) -> String {
    TTML.replace(
        "<translations/>",
        &format!("<translations>{translations}</translations>"),
    )
}

#[test]
fn times_are_read_in_every_shape() {
    assert_eq!(parse_time_ms("1:02.5"), Some(62_500));
    assert_eq!(parse_time_ms("1:02:03.25"), Some(3_723_250));
    assert_eq!(parse_time_ms("14.342"), Some(14_342));
    assert_eq!(parse_time_ms("12.5s"), Some(12_500));
    assert_eq!(parse_time_ms(" 4:45.248 "), Some(285_248));
    // A tenth of a millisecond is rounded to the nearest millisecond.
    assert_eq!(parse_time_ms("12.3456"), Some(12_346));
    assert_eq!(parse_time_ms(""), None);
    assert_eq!(parse_time_ms("soon"), None);
}

#[test]
fn the_words_of_a_line_carry_their_own_times() {
    let (lines, translations) = parse_ttml(TTML).unwrap();
    assert_eq!(lines.len(), 1);
    assert_eq!(lines[0].0, 284_248);
    assert_eq!(
        lines[0].1,
        "<04:44.24>不然<04:44.75><04:44.75>只爱着<04:46.20><04:46.20>你 <04:47.09><04:48.12>我怎么<04:49.07>"
    );
    // The pinyin under the metadata is not a translation of the line.
    assert_eq!(translations, [""]);
}

#[test]
fn a_line_without_words_stays_plain_text() {
    let ttml = r#"<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1.5" end="3">整晚的星</p></div></body></tt>"#;
    let (lines, _) = parse_ttml(ttml).unwrap();
    assert_eq!(lines, [(500, "整晚的星".to_string())]);
}

#[test]
fn a_translation_follows_the_line_it_belongs_to() {
    let ttml = ttml_with(
        r#"<translation type="subtitle" xml:lang="en"><text for="L37">Otherwise I only love you</text></translation>"#,
    );
    let (lines, translations) = parse_ttml(&ttml).unwrap();
    assert_eq!(translations, ["Otherwise I only love you"]);
    assert!(lines[0].1.contains('<'));
}

#[test]
fn a_subtitle_wins_over_a_replacement() {
    let ttml = ttml_with(
        r#"<translation type="replacement" xml:lang="en"><text for="L37">Otherwise</text></translation>
<translation type="subtitle" xml:lang="en"><text for="L37">Otherwise I only love you</text></translation>"#,
    );
    let (lines, translations) = parse_ttml(&ttml).unwrap();
    assert_eq!(translations, ["Otherwise I only love you"]);
    assert!(lines[0].1.contains("不然"));
}

#[test]
fn a_replacement_takes_the_place_of_the_line() {
    let ttml = ttml_with(r#"<translation type="replacement" xml:lang="en"><text for="L37">Otherwise</text></translation>"#);
    let (lines, translations) = parse_ttml(&ttml).unwrap();
    assert_eq!(lines[0].1, "Otherwise");
    assert_eq!(translations, [""]);
}

#[test]
fn broken_xml_has_no_lyrics() {
    assert!(parse_ttml("not xml at all").is_none());
    assert!(parse_ttml(r#"<tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1">x"#).is_none());
    assert!(parse_ttml(r#"<tt xmlns="http://www.w3.org/ns/ttml"><body><div/></body></tt>"#).is_none());
    // Word times that overlap cannot be shown, so the line falls back to plain text.
    let ttml = r#"<tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1"><span begin="1" end="2">a</span><span begin="1.5" end="2">b</span></p></body></tt>"#;
    assert_eq!(parse_ttml(ttml).unwrap().0, [(0, "ab".to_string())]);
}

#[test]
fn the_background_voice_is_not_a_line() {
    let ttml = r#"<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><p begin="1" ttm:role="x-bg">hey</p><p begin="2">hey</p></body></tt>"#;
    let (lines, _) = parse_ttml(ttml).unwrap();
    assert_eq!(lines, [(1000, "hey".to_string())]);
}

#[test]
fn every_time_moves_ahead_so_the_lyrics_land_with_the_music() {
    let ttml = r#"<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="5.000" end="6">晚</p></div></body></tt>"#;
    let (lines, _) = parse_ttml(ttml).unwrap();
    assert_eq!(lines, [(5_000 - LEAD_MS, "晚".to_string())]);
    // A line that starts before the lead is not pushed before the song.
    let early = r#"<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0.500">晚</p></div></body></tt>"#;
    assert_eq!(parse_ttml(early).unwrap().0, [(0, "晚".to_string())]);
}
