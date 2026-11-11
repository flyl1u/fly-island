//! Which way "auto" translates: into English when the text is mostly Chinese, into
//! Chinese otherwise. A few Chinese characters in an English text (a name, a quoted
//! term) must not flip it, or the text is "translated" into the language it is
//! already in and comes back unchanged.

/// Chinese characters carry about as much as 1.5 English words, so a text counts as
/// Chinese once it has at least this many Chinese characters per Latin word.
const HAN_PER_WORD: f64 = 1.5;

/// The language "auto" translates `text` into: "en" or "zh".
pub(super) fn auto_target(text: &str) -> &'static str {
    let (han, words) = count_scripts(text);
    let is_chinese = if han == 0 && words == 0 {
        // Only code, links, numbers or punctuation: any Chinese at all decides it.
        text.chars().any(is_han)
    } else {
        han as f64 >= words as f64 * HAN_PER_WORD
    };
    if is_chinese {
        "en"
    } else {
        "zh"
    }
}

/// Chinese characters and Latin words in the prose of `text`, leaving out code in
/// backticks, links and email addresses, which stay as they are in any language.
fn count_scripts(text: &str) -> (usize, usize) {
    let mut prose = String::with_capacity(text.len());
    let mut in_code = false;
    for ch in text.chars() {
        if ch == '`' {
            in_code = !in_code;
            prose.push(' ');
        } else if in_code {
            continue;
        } else if matches!(ch, '\u{3000}'..='\u{303F}' | '\u{FF00}'..='\u{FF0F}' | '\u{FF1A}'..='\u{FF20}') {
            // Chinese punctuation sits against the next word without a space; split
            // there so a link after "：" does not take the Chinese before it along.
            prose.push(' ');
        } else {
            prose.push(ch);
        }
    }

    let (mut han, mut words) = (0, 0);
    for token in prose.split_whitespace().filter(|token| !is_link_or_address(token)) {
        let mut in_word = false;
        for ch in token.chars() {
            if is_han(ch) {
                han += 1;
                in_word = false;
            } else if is_latin_letter(ch) {
                if !in_word {
                    words += 1;
                }
                in_word = true;
            } else {
                in_word = false;
            }
        }
    }
    (han, words)
}

fn is_link_or_address(token: &str) -> bool {
    let lower = token.to_ascii_lowercase();
    lower.contains("://")
        || lower.starts_with("www.")
        || token
            .split_once('@')
            .is_some_and(|(name, domain)| !name.is_empty() && domain.contains('.'))
}

fn is_latin_letter(ch: char) -> bool {
    ch.is_ascii_alphabetic() || (ch.is_alphabetic() && ('\u{00C0}'..='\u{024F}').contains(&ch))
}

fn is_han(ch: char) -> bool {
    matches!(ch,
        '\u{3400}'..='\u{4DBF}'   // Extension A
        | '\u{4E00}'..='\u{9FFF}' // Unified Ideographs
        | '\u{F900}'..='\u{FAFF}' // Compatibility Ideographs
        | '\u{20000}'..='\u{2EBEF}')
}

#[cfg(test)]
mod tests {
    use super::auto_target;

    #[test]
    fn plain_texts_go_to_the_other_language() {
        assert_eq!(auto_target("The quick brown fox jumps over the lazy dog."), "zh");
        assert_eq!(auto_target("今天天气很好，我们去公园散步吧。"), "en");
    }

    #[test]
    fn a_long_english_text_with_a_little_chinese_goes_to_chinese() {
        let text = "Our team met with 张伟 from the Shanghai office to review the quarterly \
            roadmap. We agreed to ship the new onboarding flow first, then revisit the \
            pricing page (定价页) once the analytics are in.";
        assert_eq!(auto_target(text), "zh");
        assert_eq!(auto_target("Please call me 小明, thanks!"), "zh");
    }

    #[test]
    fn chinese_with_english_terms_goes_to_english() {
        assert_eq!(auto_target("我在用 React 和 TypeScript 写一个桌面应用。"), "en");
        assert_eq!(auto_target("这个 bug 只在 production environment 里出现"), "en");
    }

    #[test]
    fn code_links_numbers_and_addresses_do_not_count() {
        let text = "请看这个函数 `fn parse_shortcut_binding(shortcut: &str) -> Option<Binding>` \
            的说明：https://docs.example.com/very/long/english/path?with=query 或者发邮件到 \
            someone@example.com，版本 3.0.1。";
        assert_eq!(auto_target(text), "en");
        assert_eq!(auto_target("See https://例子.cn/文档 for details on the release notes."), "zh");
    }

    #[test]
    fn texts_without_words_fall_back_to_any_chinese() {
        assert_eq!(auto_target("12345 + 67890 = ?"), "zh");
        assert_eq!(auto_target("`代码` 123"), "en");
    }
}
