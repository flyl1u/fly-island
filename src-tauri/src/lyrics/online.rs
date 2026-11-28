//! Asking the online sources for a track. All of them are asked at once and the answers compared:
//! each source scores its own best result against the playing track (scoring.rs), the highest
//! score wins, a tie goes to the source the track most likely lives on, and with word-by-word
//! display on a word-timed answer beats a line-timed one. The wait ends early at a sure answer
//! from the preferred source, and never lasts past `DEADLINE`.

use std::time::Duration;

use tokio::{sync::mpsc, time::Instant};

use super::found::FoundLyrics;
use super::scoring::Playing;
use super::{kugou, lrclib, netease, qqmusic, Answer, LyricsQuery};

/// How long the sources are given in all.
const DEADLINE: Duration = Duration::from_secs(10);
/// An answer scoring this much is taken without waiting for the others.
const SURE: u32 = 95;
/// Lyrics may begin and end this far past the track's length before they are taken as another recording's.
const LYRICS_OVERRUN_MS: u64 = 15_000;

/// The online sources to ask, most likely first. A song named in Chinese asks Kugou and NetEase
/// first, as LRCLIB has few Chinese songs; a song id the player gave puts its service first.
pub(super) fn source_order(query: &LyricsQuery) -> Vec<&'static str> {
    let mut sources = fallback_source_order(query);
    let player = query.source_app_id.as_deref().unwrap_or_default().to_ascii_lowercase();
    if query.apple_music && ["applemusic", "apple.music", "music.ui"].iter().any(|sign| player.contains(sign))
        && super::applemusic::read_token().is_some() { sources.insert(0, "applemusic"); }
    sources
}
fn fallback_source_order(query: &LyricsQuery) -> Vec<&'static str> {
    if !query.chinese {
        return vec!["lrclib"];
    }
    let player = query.source_app_id.as_deref().unwrap_or_default().to_ascii_lowercase();
    if qqmusic::track_id(query.track_id.as_deref()).is_some() || player.contains("qqmusic") {
        return vec!["qqmusic", "kugou", "netease", "lrclib"];
    }
    let chinese_named = format!("{}{}", query.title, query.artist).chars().any(|c| ('\u{4E00}'..='\u{9FFF}').contains(&c));
    match (netease::track_id(query.track_id.as_deref()).is_some(), chinese_named) {
        (true, _) => vec!["netease", "kugou", "qqmusic", "lrclib"],
        (false, true) => vec!["kugou", "netease", "qqmusic", "lrclib"],
        (false, false) => vec!["lrclib", "kugou", "netease", "qqmusic"],
    }
}

/// The start of the last timed line of LRC text, in ms.
fn last_line_ms(lrc: &str) -> Option<u64> {
    lrc.lines()
        .filter_map(|line| {
            let stamp = line.strip_prefix('[')?.split(']').next()?;
            let (minutes, seconds) = stamp.split_once(':')?;
            let seconds: f64 = seconds.parse().ok()?;
            Some(minutes.parse::<u64>().ok()? * 60_000 + (seconds * 1000.0) as u64)
        })
        .max()
}

/// Whether lyrics can belong to a track of this length: a lyric that runs on well past the end
/// is another, longer recording's (a live version, an extended mix).
fn fits_length(found: &FoundLyrics, duration_ms: i64) -> bool {
    duration_ms <= 0 || last_line_ms(&found.lrc).is_none_or(|last| last <= duration_ms as u64 + LYRICS_OVERRUN_MS)
}

/// One source's answer to compare.
struct Offer {
    index: usize,
    source: &'static str,
    found: FoundLyrics,
    score: u32,
}

impl Offer {
    fn has_words(&self) -> bool {
        self.found.lrc.contains('<')
    }

    /// Higher is better: word times when asked for, then the score; an earlier source breaks ties.
    fn rank(&self, word_fill: bool) -> (bool, u32, std::cmp::Reverse<usize>) {
        (word_fill && self.has_words(), self.score, std::cmp::Reverse(self.index))
    }

    fn is_sure(&self, word_fill: bool) -> bool {
        self.score >= SURE && (!word_fill || self.has_words())
    }
}

/// What one source said.
type Reply = (usize, &'static str, Result<Option<(FoundLyrics, u32)>, String>);

async fn ask(source: &'static str, query: &LyricsQuery) -> Result<Option<(FoundLyrics, u32)>, String> {
    let playing = Playing { title: &query.title, artist: &query.artist, album: &query.album, duration_ms: query.duration_ms };
    let id = query.track_id.as_deref();
    match source {
        "kugou" => kugou::fetch(&playing).await,
        "netease" => netease::fetch(&playing, id).await,
        "qqmusic" => qqmusic::fetch(&playing, id).await,
        "applemusic" => match super::applemusic::read_token() {
            Some(token) => super::applemusic::fetch(&query.title, &query.artist, &query.album, query.duration_ms, &token)
                .await.map(|found| found.map(|found| (found, 100))),
            None => Ok(None),
        },
        _ => lrclib::fetch(&playing).await,
    }
}

/// The best answer of the online sources. `Err` only when no source could be asked.
pub(super) async fn fetch(query: &LyricsQuery) -> Result<Option<Answer>, String> {
    let sources = source_order(query);
    let deadline = Instant::now() + DEADLINE;
    let (sender, mut receiver) = mpsc::unbounded_channel::<Reply>();
    let mut tasks = Vec::new();
    for (index, source) in sources.iter().copied().enumerate() {
        let (sender, query) = (sender.clone(), query.clone());
        tasks.push(tauri::async_runtime::spawn(async move {
            let _ = sender.send((index, source, ask(source, &query).await));
        }));
    }
    drop(sender);
    let (mut best, mut pending, mut errors, mut answered) = (None::<Offer>, vec![true; sources.len()], Vec::new(), false);
    let mut summary = Vec::new();
    while pending.iter().any(|&waiting| waiting) {
        let Ok(Some((index, source, result))) = tokio::time::timeout_at(deadline, receiver.recv()).await else { break };
        pending[index] = false;
        match result {
            Ok(Some((found, score))) if fits_length(&found, query.duration_ms) => {
                answered = true;
                summary.push(format!("{source} {score}"));
                let offer = Offer { index, source, found, score };
                if best.as_ref().is_none_or(|current| offer.rank(query.word_fill) > current.rank(query.word_fill)) {
                    best = Some(offer);
                }
            }
            Ok(_) => {
                answered = true;
                summary.push(format!("{source} -"));
            }
            Err(error) => {
                summary.push(format!("{source} error"));
                errors.push(error);
            }
        }
        // A sure answer ends the wait once every source that outranks it has replied.
        if best.as_ref().is_some_and(|offer| offer.is_sure(query.word_fill) && pending[..offer.index].iter().all(|&waiting| !waiting)) {
            break;
        }
    }
    for task in tasks {
        task.abort();
    }
    eprintln!(
        "[lyrics] {} - {}: {} -> {}",
        query.title,
        query.artist,
        summary.join(", "),
        best.as_ref().map_or("none", |offer| offer.source)
    );
    match best {
        Some(offer) => Ok(Some((offer.source, offer.found))),
        None if answered => Ok(None),
        None => Err(if errors.is_empty() { "No lyrics source answered in time".to_string() } else { errors.join("; ") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(title: &str, chinese: bool, track_id: Option<&str>) -> LyricsQuery {
        LyricsQuery {
            title: title.into(),
            artist: String::new(),
            album: String::new(),
            duration_ms: 0,
            folder: String::new(),
            online: true,
            chinese,
            track_id: track_id.map(Into::into),
            source_app_id: None,
            lx_port: None,
            word_fill: false,
            apple_music: false,
        }
    }

    fn offer(index: usize, score: u32, lrc: &str) -> Offer {
        Offer { index, source: "x", found: FoundLyrics { lrc: lrc.into(), translation: None, duration_ms: None }, score }
    }

    #[test]
    fn chinese_songs_ask_the_chinese_sources_first() {
        assert_eq!(source_order(&query("余香", false, None)), ["lrclib"]);
        assert_eq!(source_order(&query("余香", true, None)), ["kugou", "netease", "qqmusic", "lrclib"]);
        assert_eq!(source_order(&query("Yesterday", true, None)), ["lrclib", "kugou", "netease", "qqmusic"]);
        assert_eq!(source_order(&query("Yesterday", true, Some("NCM-1"))), ["netease", "kugou", "qqmusic", "lrclib"]);
        assert_eq!(source_order(&query("Yesterday", true, Some("QQ-123")))[0], "qqmusic");
    }

    #[test]
    fn the_higher_score_wins_and_an_earlier_source_breaks_ties() {
        assert!(offer(2, 96, "[00:01.00]a").rank(false) > offer(0, 90, "[00:01.00]a").rank(false));
        assert!(offer(0, 90, "[00:01.00]a").rank(false) > offer(2, 90, "[00:01.00]a").rank(false));
    }

    #[test]
    fn word_timed_lyrics_win_when_word_by_word_is_on() {
        let words = offer(3, 85, "[00:01.00]<00:01.00>a<00:01.50>");
        let lines = offer(0, 99, "[00:01.00]a");
        assert!(words.rank(true) > lines.rank(true));
        assert!(lines.rank(false) > words.rank(false));
        assert!(lines.is_sure(false));
        assert!(!lines.is_sure(true));
        assert!(!offer(0, 94, "[00:01.00]a").is_sure(false));
    }

    #[test]
    fn lyrics_far_longer_than_the_track_are_another_recording() {
        let found = |lrc: &str| FoundLyrics { lrc: lrc.into(), translation: None, duration_ms: None };
        let lrc = "[00:01.00]a\n[03:50.00]b\n";
        assert_eq!(last_line_ms(lrc), Some(230_000));
        assert!(fits_length(&found(lrc), 240_000));
        assert!(fits_length(&found(lrc), 0));
        assert!(!fits_length(&found(lrc), 200_000));
        assert!(fits_length(&found("no timestamps"), 100_000));
    }

    #[test]
    #[ignore = "Requires the anonymous online sources; run by hand to check the recognition rate"]
    fn live_variants_of_the_same_songs_are_found() {
        // (title, artist, duration ms): tracks as players write them, with notes and extra singers.
        let tracks = [
            ("晴天", "周杰伦", 269_000),
            ("晴天 (Live)", "周杰伦", 0),
            ("Get Lucky (feat. Pharrell Williams & Nile Rodgers)", "Daft Punk", 369_000),
            ("Yesterday - Remastered 2009", "The Beatles", 125_000),
            ("七里香", "周杰倫", 299_000),
            ("Shape of You", "Ed Sheeran", 233_000),
        ];
        let mut found = 0;
        for (title, artist, duration_ms) in tracks {
            let mut q = query(title, true, None);
            (q.artist, q.duration_ms) = (artist.to_string(), duration_ms);
            let answer = tauri::async_runtime::block_on(fetch(&q));
            println!("{title} / {artist}: {:?}", answer.as_ref().map(|a| a.as_ref().map(|(source, _)| *source)));
            found += usize::from(matches!(answer, Ok(Some(_))));
        }
        assert!(found >= tracks.len() - 1, "found {found} of {}", tracks.len());
    }
}
