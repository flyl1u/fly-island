//! Removes private strings (paths, serial numbers, addresses) from device names,
//! which devices and drivers control.

fn same_letter(a: char, b: char) -> bool {
    a == b || a.to_lowercase().eq(b.to_lowercase())
}

fn starts_ignoring_case(text: &[char], at: usize, prefix: &str) -> Option<usize> {
    let mut position = at;
    for expected in prefix.chars() {
        if !text
            .get(position)
            .is_some_and(|&c| same_letter(c, expected))
        {
            return None;
        }
        position += 1;
    }
    Some(position)
}

/// Replaces every span `matches` finds; it returns the end of a match at `at`.
fn replace_spans(
    text: &str,
    replacement: &str,
    matches: impl Fn(&[char], usize) -> Option<usize>,
) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut result = String::new();
    let mut at = 0;
    while at < chars.len() {
        match matches(&chars, at).filter(|&end| end > at) {
            Some(end) => {
                result.push_str(replacement);
                at = end;
            }
            None => {
                result.push(chars[at]);
                at += 1;
            }
        }
    }
    result
}

/// Each secret, longest first, wherever it appears, ignoring case.
pub(crate) fn secrets<'a>(name: &str, secrets: impl IntoIterator<Item = &'a str>) -> String {
    let mut ordered: Vec<&str> = secrets.into_iter().filter(|s| !s.is_empty()).collect();
    ordered.sort_by(|a, b| (b.chars().count(), a).cmp(&(a.chars().count(), b)));
    ordered.dedup();
    ordered.iter().fold(name.to_string(), |name, secret| {
        replace_spans(&name, "[redacted]", |text, at| {
            starts_ignoring_case(text, at, secret)
        })
    })
}

/// The end of the run of characters that can belong to a value.
fn value_end(text: &[char], at: usize) -> Option<usize> {
    let length = text
        .get(at..)?
        .iter()
        .take_while(|&&c| !c.is_whitespace() && c != '"' && c != '\'')
        .count();
    (length > 0).then_some(at + length)
}

fn skip_space(text: &[char], mut at: usize) -> usize {
    while text.get(at).is_some_and(|c| c.is_whitespace()) {
        at += 1;
    }
    at
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn at_boundary(text: &[char], at: usize) -> bool {
    at == 0 || !is_word(text[at - 1])
}

fn path_at(text: &[char], at: usize) -> Option<usize> {
    let drive = text[at].is_ascii_alphabetic()
        && text.get(at + 1) == Some(&':')
        && text.get(at + 2) == Some(&'\\');
    if drive {
        return value_end(text, at + 3);
    }
    if let Some(end) = starts_ignoring_case(text, at, "\\\\") {
        return value_end(text, end);
    }
    ["hid", "usb", "bthenum", "bthledevice"]
        .iter()
        .find_map(|bus| {
            let end = starts_ignoring_case(text, at, bus)?;
            matches!(text.get(end), Some('\\' | '#')).then(|| value_end(text, end + 1))?
        })
}

fn serial_at(text: &[char], at: usize) -> Option<usize> {
    let latin = [
        "serial_number",
        "serial-number",
        "serial number",
        "serialnumber",
        "serial",
        "s/n",
        "sn",
    ];
    // A latin keyword is a whole word or runs into digits: "SN123", not "Snow".
    let latin = latin
        .iter()
        .filter(|_| at_boundary(text, at))
        .filter_map(|keyword| starts_ignoring_case(text, at, keyword))
        .filter(|&end| !text.get(end).is_some_and(char::is_ascii_alphabetic));
    latin
        .chain(starts_ignoring_case(text, at, "序列号"))
        .find_map(|end| {
            let start = skip_space(text, end);
            let separated = matches!(text.get(start), Some(':' | '=' | '#' | '：'))
                .then(|| value_end(text, skip_space(text, start + 1)))
                .flatten();
            separated.or_else(|| value_end(text, start))
        })
}

/// Six hex pairs joined by `:` or `-`.
fn address_at(text: &[char], at: usize) -> Option<usize> {
    if !at_boundary(text, at) {
        return None;
    }
    let candidate = text.get(at..at + 17)?;
    let shaped = candidate.iter().enumerate().all(|(index, &c)| {
        if index % 3 == 2 {
            matches!(c, ':' | '-')
        } else {
            c.is_ascii_hexdigit()
        }
    });
    (shaped && !text.get(at + 17).is_some_and(|&c| is_word(c))).then_some(at + 17)
}

/// Anything that looks like a path, a serial number or a device address.
pub(crate) fn identifiers(name: &str) -> String {
    let name = replace_spans(name, "[path]", path_at);
    let name = replace_spans(&name, "[serial]", serial_at);
    replace_spans(&name, "[device]", address_at)
}

/// `word` as a whole word, ignoring case.
pub(crate) fn mentions_word(text: &str, word: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    (0..chars.len()).any(|at| {
        at_boundary(&chars, at)
            && starts_ignoring_case(&chars, at, word)
                .is_some_and(|end| !chars.get(end).is_some_and(|&c| is_word(c)))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_are_removed_longest_first() {
        let result = secrets("Mouse ABC123 abc", ["abc", "ABC123", ""]);
        assert_eq!(result, "Mouse [redacted] [redacted]");
    }

    #[test]
    fn paths_serials_and_addresses_are_masked() {
        assert_eq!(identifiers(r"a C:\Users\me b"), "a [path] b");
        assert_eq!(identifiers(r"HID#VID_1234&PID_1"), "[path]");
        assert_eq!(identifiers("Pad serial number: 998877"), "Pad [serial]");
        assert_eq!(identifiers("Pad S/N=AB12 x"), "Pad [serial] x");
        assert_eq!(identifiers("序列号：XY9"), "[serial]");
        assert_eq!(identifiers("BT aa:bb:cc:dd:ee:0f"), "BT [device]");
        assert_eq!(
            identifiers("Snow Leopard USB Receiver"),
            "Snow Leopard USB Receiver"
        );
        assert_eq!(identifiers("Wasn't here"), "Wasn't here");
    }

    #[test]
    fn words_need_boundaries() {
        assert!(mentions_word("AURA LED", "aura"));
        assert!(!mentions_word("Laura mouse", "aura"));
        assert!(!mentions_word("virtually", "virtual"));
    }
}
