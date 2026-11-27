//! The search loop the online sources share: try the search words one after another, pool and
//! rank what they list against the playing track, and stop at the first words that gave a result
//! sure enough. A source then fetches lyrics for the best few in order.

use std::future::Future;

use super::scoring::{ranked, search_keywords, Candidate, Playing};

/// How many search words a source may spend on one track.
const MAX_KEYWORDS: usize = 3;
/// How many ranked results a source fetches lyrics for before giving up.
pub(super) const TOP: usize = 3;
/// A result scoring this much ends the search without the remaining words.
const SURE: u32 = 90;

/// The ranked results over all search words. `Err` only when every search failed.
pub(super) async fn find<T, F, Fut>(playing: &Playing<'_>, mut search: F) -> Result<Vec<(u32, T)>, String>
where
    T: Clone + PartialEq,
    F: FnMut(String) -> Fut,
    Fut: Future<Output = Result<Vec<Candidate<T>>, String>>,
{
    let mut pool: Vec<Candidate<T>> = Vec::new();
    let (mut answered, mut last_error) = (false, None);
    for keyword in search_keywords(playing.title, playing.artist, MAX_KEYWORDS) {
        match search(keyword).await {
            Ok(found) => {
                answered = true;
                pool.extend(found);
            }
            Err(error) => last_error = Some(error),
        }
        if ranked(playing, &pool).first().is_some_and(|(score, _)| *score >= SURE) {
            break;
        }
    }
    match last_error {
        Some(error) if !answered => Err(error),
        _ => Ok(ranked(playing, &pool)),
    }
}
