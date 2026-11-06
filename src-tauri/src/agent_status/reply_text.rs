//! An agent's reply as plain text for the island: Markdown marks taken out line by line, before
//! the reply is collapsed onto one line, where a heading or a list item could no longer be told
//! from text that happens to start with `#` or `-`.

/// `markdown` with its headings, list and quote markers, emphasis, inline code marks, link
/// targets, code fences and table rules removed. Lines stay apart; the caller collapses them.
pub(super) fn plain_reply(markdown: &str) -> String {
    markdown
        .lines()
        .filter_map(plain_line)
        .collect::<Vec<_>>()
        .join("\n")
}

fn plain_line(line: &str) -> Option<String> {
    let trimmed = line.trim();
    // Code fences and the rule under a table header carry no words.
    if trimmed.starts_with("```") || trimmed.starts_with("~~~") || is_table_rule(trimmed) {
        return None;
    }
    let mut text = trimmed;
    text = text.trim_start_matches('>').trim_start();
    text = strip_heading(text);
    text = strip_list_marker(text);
    let text = if text.starts_with('|') {
        // A table row: its cells, separated by spaces.
        text.trim_matches('|').split('|').map(str::trim).collect::<Vec<_>>().join("  ")
    } else {
        text.to_string()
    };
    Some(strip_inline(&text))
}

fn is_table_rule(line: &str) -> bool {
    line.starts_with('|') && line.chars().all(|c| matches!(c, '|' | '-' | ':' | ' '))
}

fn strip_heading(line: &str) -> &str {
    let hashes = line.chars().take_while(|c| *c == '#').count();
    if (1..=6).contains(&hashes) && line[hashes..].starts_with(' ') {
        line[hashes..].trim_start()
    } else {
        line
    }
}

fn strip_list_marker(line: &str) -> &str {
    for marker in ["- ", "* ", "+ "] {
        if let Some(rest) = line.strip_prefix(marker) {
            return rest.trim_start();
        }
    }
    // "1. " or "1) "
    let digits = line.chars().take_while(char::is_ascii_digit).count();
    if (1..=3).contains(&digits) {
        let rest = &line[digits..];
        if let Some(rest) = rest.strip_prefix(". ").or_else(|| rest.strip_prefix(") ")) {
            return rest.trim_start();
        }
    }
    line
}

/// Emphasis and code marks dropped, `[text](target)` reduced to its text.
fn strip_inline(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(c) = rest.chars().next() {
        if let Some(after) = rest.strip_prefix("**").or_else(|| rest.strip_prefix("__")) {
            rest = after;
            continue;
        }
        if c == '`' {
            rest = &rest[1..];
            continue;
        }
        if c == '[' {
            if let Some((label, after)) = link(rest) {
                out.push_str(label);
                rest = after;
                continue;
            }
        }
        out.push(c);
        rest = &rest[c.len_utf8()..];
    }
    out
}

/// `[label](target)` at the start of `text`: the label and what follows the link.
fn link(text: &str) -> Option<(&str, &str)> {
    let close = text.find("](")?;
    let label = &text[1..close];
    if label.contains('[') || label.contains('\n') {
        return None;
    }
    let after_open = &text[close + 2..];
    let end = after_open.find(')')?;
    Some((label, &after_open[end + 1..]))
}

#[cfg(test)]
mod tests {
    use super::plain_reply;

    #[test]
    fn markdown_marks_come_out_and_the_words_stay() {
        let reply = "修好了，已合入 main（`a87dd0e`）。\n\n## 原因\n\n- **完成提醒**只显示标题\n1. 看 [文档](docs/a.md) 了解\n> 引用\n```rust\nlet x = 1;\n```\n| 项 | 值 |\n|---|---|\n| a | b |";
        assert_eq!(
            plain_reply(reply),
            "修好了，已合入 main（a87dd0e）。\n\n原因\n\n完成提醒只显示标题\n看 文档 了解\n引用\nlet x = 1;\n项  值\na  b"
        );
    }

    #[test]
    fn text_that_only_looks_like_markdown_is_kept() {
        assert_eq!(plain_reply("#3 号问题"), "#3 号问题");
        assert_eq!(plain_reply("-5 度"), "-5 度");
        assert_eq!(plain_reply("2026. 年"), "2026. 年");
        assert_eq!(plain_reply("a * b = c"), "a * b = c");
        assert_eq!(plain_reply("[未闭合 链接"), "[未闭合 链接");
    }
}
