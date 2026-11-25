//! How alike two artist fields are, from 0 to 100. Adapted from H0308/taskbar-lyrics-displayer
//! (Apache-2.0), `src/lyric/lyric_matching.cpp`: `parseArtistEntries`, `artistAliasMatchScore`,
//! `bestArtistAssignmentScore` and `singerSimilarity`. The field is split into singers (also at
//! "feat." / "with" / "vs"); a bracket after a name lists its aliases ("周杰伦 (Jay Chou)"); singers
//! are then paired one to one so the order of the names does not matter. Pure functions.

use super::scoring::{jaro_winkler, simplified_fold};

const MAX_ENTRIES: usize = 16;
const MAX_LENGTH: usize = 1024;
/// Brackets that name a role or a version rather than another name for the singer.
const NON_ALIAS: &[&str] = &[
    "翻唱", "翻唱版", "原唱", "原版", "合唱", "合唱版", "伴唱", "和声", "伴奏", "伴奏版", "纯音乐", "现场", "现场版", "演唱会",
    "男声", "男声版", "女声", "女声版", "童声", "群星", "华语群星", "未知歌手", "乐队", "组合", "声优", "配音", "dj版", "live版",
    "加速版", "剧情版", "cover", "original", "chorus", "choir", "backing vocals", "vocals", "vocal", "instrumental", "karaoke",
    "live", "concert", "remix", "acoustic", "unplugged", "demo", "ver", "cv", "va", "various", "various artists", "unknown",
    "unknown artist", "band", "male", "female", "ost", "cast",
];
const COLLAB_WORDS: &[&str] = &["featuring", "feat.", "feat", "ft.", "ft", "with", "vs.", "vs"];

/// One singer: the name and the aliases written next to it, each normalized.
type Entry = Vec<String>;

fn is_artist_delimiter(c: char) -> bool {
    matches!(c, '/' | '、' | '&' | ';' | '；' | ',' | '，' | '×')
}

fn closing(open: char) -> Option<char> {
    match open {
        '(' => Some(')'),
        '[' => Some(']'),
        '（' => Some('）'),
        '【' => Some('】'),
        _ => None,
    }
}

/// A name lowercased, simplified, with every separator collapsed to one space.
fn normalize_name(text: &str) -> String {
    let folded = simplified_fold(text);
    let mut out = String::new();
    for c in folded.chars() {
        if c.is_whitespace() || (c.is_ascii() && !c.is_ascii_alphanumeric()) || "，。、；：！？（）【】《》「」『』—–…·".contains(c) {
            if !out.ends_with(' ') && !out.is_empty() {
                out.push(' ');
            }
        } else {
            out.push(c);
        }
    }
    out.trim().to_string()
}

/// The collaboration word that starts at `at` (preceded by a space unless `bare`), and its length.
fn collab_at(lower: &[char], at: usize, bare: bool) -> usize {
    if !bare && (at == 0 || !lower[at - 1].is_whitespace()) {
        return 0;
    }
    for word in COLLAB_WORDS {
        let chars: Vec<char> = word.chars().collect();
        if at + chars.len() < lower.len()
            && lower[at..at + chars.len()] == chars[..]
            && (lower[at + chars.len()].is_whitespace() || (word.ends_with('.') && !lower[at + chars.len()].is_ascii()))
        {
            return chars.len();
        }
    }
    0
}

/// The singers of a field: top-level pieces cut at delimiters and collaboration words, each with
/// the aliases from the brackets that follow it. A bracket that starts with "feat." names more
/// singers and is parsed on its own.
fn entries(field: &str, depth: usize, out: &mut Vec<Entry>) {
    if depth > 4 || out.len() > MAX_ENTRIES {
        return;
    }
    let chars: Vec<char> = field.chars().collect();
    let lower: Vec<char> = field.to_lowercase().chars().collect();
    // Matching closers of the top-level brackets.
    let mut closers = vec![None; chars.len()];
    let mut open: Vec<(usize, char)> = Vec::new();
    for (index, &c) in chars.iter().enumerate() {
        if let Some(close) = closing(c) {
            open.push((index, close));
        } else if open.last().is_some_and(|&(_, close)| close == c) {
            if let Some((start, _)) = open.pop() {
                closers[start] = Some(index);
            }
        }
    }
    let mut pieces: Vec<(usize, usize)> = Vec::new();
    let (mut start, mut index) = (0, 0);
    while index < chars.len() {
        if let Some(close) = closers[index] {
            index = close + 1;
            continue;
        }
        let skip = if is_artist_delimiter(chars[index]) { 1 } else { collab_at(&lower, index, false) };
        if skip > 0 {
            pieces.push((start, index));
            index += skip;
            start = index;
        } else {
            index += 1;
        }
    }
    pieces.push((start, chars.len()));
    for (start, end) in pieces {
        let (mut outer, mut inners) = (String::new(), Vec::new());
        let mut index = start;
        while index < end {
            if let Some(close) = closers[index] {
                if !outer.is_empty() && !outer.ends_with(' ') {
                    outer.push(' ');
                }
                inners.push(chars[index + 1..close].iter().collect::<String>());
                index = close + 1;
            } else {
                outer.push(chars[index]);
                index += 1;
            }
        }
        let mut aliases: Entry = Vec::new();
        let mut add = |name: String| {
            if !name.is_empty() && !aliases.contains(&name) {
                aliases.push(name);
            }
        };
        add(normalize_name(&outer));
        let mut collaborators = Vec::new();
        for inner in inners {
            let inner = inner.trim().to_string();
            let inner_lower: Vec<char> = inner.to_lowercase().chars().collect();
            let skip = collab_at(&inner_lower, 0, true);
            if skip > 0 {
                let rest: String = inner.chars().skip(skip).collect();
                if !rest.trim().is_empty() {
                    collaborators.push(rest.trim().to_string());
                }
                continue;
            }
            for part in inner.split(is_artist_delimiter) {
                let name = normalize_name(part);
                if !name.is_empty() && !NON_ALIAS.contains(&name.as_str()) {
                    add(name);
                }
            }
        }
        if !aliases.is_empty() {
            out.push(aliases);
        }
        for collaborator in collaborators {
            entries(&collaborator, depth + 1, out);
        }
    }
}

fn pair_score(left: &Entry, right: &Entry) -> u32 {
    let shared = left.iter().filter(|alias| right.contains(alias)).count();
    match shared {
        0 => 0,
        n if n == left.len() && n == right.len() => 100,
        _ => 95,
    }
}

/// The best total of pairing each singer on one side with at most one on the other. Fields list
/// a handful of singers, so the pairing is searched exhaustively over subsets up to 12 and
/// matched greedily beyond that.
fn best_assignment(left: &[Entry], right: &[Entry]) -> u32 {
    let scores: Vec<Vec<u32>> = left.iter().map(|l| right.iter().map(|r| pair_score(l, r)).collect()).collect();
    if right.len() > 12 {
        let mut taken = vec![false; right.len()];
        return scores
            .iter()
            .map(|row| {
                let best = (0..right.len()).filter(|&c| !taken[c]).max_by_key(|&c| row[c]);
                best.map_or(0, |c| {
                    taken[c] = true;
                    row[c]
                })
            })
            .sum();
    }
    // best[mask]: the best total so far with the right-hand singers in `mask` used.
    let mut best = vec![0u32; 1 << right.len()];
    for row in &scores {
        let mut next = best.clone();
        for (mask, &base) in best.iter().enumerate() {
            for (column, score) in row.iter().enumerate() {
                if mask & (1 << column) == 0 {
                    let to = mask | (1 << column);
                    next[to] = next[to].max(base + score);
                }
            }
        }
        best = next;
    }
    best.into_iter().max().unwrap_or(0)
}

/// The field with collaboration words turned into " / " and normalized, for plain comparison.
fn flat(field: &str) -> String {
    let mut text = format!(" {} ", normalize_name(field));
    for word in [" feat ", " ft ", " featuring ", " with ", " vs "] {
        text = text.replace(word, " / ");
    }
    text.trim().to_string()
}

/// 0..=100: how likely two artist fields name the same singers. 0 when either is empty.
pub(super) fn artist_similarity(a: &str, b: &str) -> u32 {
    if a.trim().is_empty() || b.trim().is_empty() || a.len() > MAX_LENGTH || b.len() > MAX_LENGTH {
        return 0;
    }
    if simplified_fold(a) == simplified_fold(b) {
        return 100;
    }
    let (mut pa, mut pb) = (Vec::new(), Vec::new());
    entries(a, 0, &mut pa);
    entries(b, 0, &mut pb);
    if pa.len() > MAX_ENTRIES || pb.len() > MAX_ENTRIES {
        return 0;
    }
    let count = pa.len().max(pb.len()) as u32;
    if pa.len() > 1 && pb.len() > 1 {
        return best_assignment(&pa, &pb) / count;
    }
    let (na, nb) = (flat(a), flat(b));
    if na == nb {
        return 100;
    }
    if pa.is_empty() || pb.is_empty() {
        return 0;
    }
    let token = best_assignment(&pa, &pb) / count;
    if token == 0 {
        return 0;
    }
    token.max((jaro_winkler(&na, &nb) * 100.0).round() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_singers_in_any_order_or_script_are_alike() {
        assert_eq!(artist_similarity("周杰伦", "周杰倫"), 100);
        assert_eq!(artist_similarity("A, B", "B / A"), 100);
        assert_eq!(artist_similarity("Taylor Swift", "taylor swift"), 100);
    }

    #[test]
    fn aliases_in_brackets_count_and_roles_do_not() {
        assert!(artist_similarity("周杰伦 (Jay Chou)", "Jay Chou") >= 95);
        assert_eq!(artist_similarity("周杰伦", "张学友 (翻唱)"), 0);
        assert_eq!(artist_similarity("A (live)", "B (live)"), 0);
    }

    #[test]
    fn featured_singers_are_other_singers() {
        assert!(artist_similarity("Daft Punk feat. Pharrell Williams", "Daft Punk") >= 70);
        assert_eq!(artist_similarity("Daft Punk (feat. Pharrell Williams)", "Pharrell Williams, Daft Punk"), 100);
        assert!(artist_similarity("Taylor Swift", "Taylor Swift Tribute Band") < 50);
    }

    #[test]
    fn empty_or_unrelated_fields_score_zero() {
        assert_eq!(artist_similarity("", "X"), 0);
        assert_eq!(artist_similarity("张三", "李四"), 0);
    }
}
