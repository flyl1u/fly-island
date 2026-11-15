// Adapted from Renly1994/xiaotang-daozai, src/otp.rs (MIT).
// Copyright (c) 2026 小唐的Token and Daozai contributors
// Source: https://github.com/Renly1994/xiaotang-daozai
// Full MIT notice: docs/third-party-licenses.md
//! 验证码提取（v0.5.5）。
//!
//! 加权打分而不是单条正则：单正则会把你订单号、金额、电话当验证码。
//! 规则参考 pulse-mail（MIT，`otp/mod.rs`）的强/弱/负向词表与形状权重，
//! 中文关键词表按国内邮件场景补齐；门槛 65 分——宁可漏，不可错。

use regex::Regex;
use std::sync::OnceLock;

// Fixed patterns are tested below. A malformed pattern degrades to no match.
struct CachedPattern(Option<Regex>);
impl CachedPattern {
    fn new(pattern: &str) -> Self {
        Self(Regex::new(pattern).ok())
    }
    fn is_match(&self, text: &str) -> bool {
        self.0.as_ref().is_some_and(|re| re.is_match(text))
    }
    fn find_iter<'a>(&'a self, text: &'a str) -> impl Iterator<Item = regex::Match<'a>> {
        self.0.iter().flat_map(move |re| re.find_iter(text))
    }
}

#[cfg(test)]
use super::otp_html::{emphasized, html_to_text};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Code {
    pub text: String,
    pub score: i32,
}

/// 上岛门槛：低于这个分数只当作普通邮件。
pub(super) const THRESHOLD: i32 = 65;

fn strong() -> &'static CachedPattern {
    static R: OnceLock<CachedPattern> = OnceLock::new();
    R.get_or_init(|| {
        CachedPattern::new(concat!(
            r"(?i)[验驗][证證][码碼]|校[验驗][码碼]|[确確][认認][码碼]|[动動][态態](?:密)?[码碼]|安全[码碼]|登[录錄入][码碼]|激活[码碼]|",
            r"一次性(?:密[码碼]|口令)|otp|one[-\s]?time\s+(?:code|password|passcode)|",
            r"verification\s+code|security\s+code|auth(?:entication)?\s+code|",
            r"passcode|\bcode\b|認証コード|인증번호"
        ))
    })
}

fn weak() -> &'static CachedPattern {
    static R: OnceLock<CachedPattern> = OnceLock::new();
    R.get_or_init(|| {
        CachedPattern::new(concat!(
            r"(?i)登[录錄入陆陸]|[验驗][证證]|校[验驗]|身份|[确確][认認]|安全|",
            r"sign[-\s]?in|log[-\s]?in|verify|verification|confirm|authenticate"
        ))
    })
}

fn candidate() -> &'static CachedPattern {
    static R: OnceLock<CachedPattern> = OnceLock::new();
    R.get_or_init(|| {
        // 字母前缀、带分隔的 3-4 位分组、4-8 位数字、4-8 位字母数字。
        CachedPattern::new(concat!(
            r"(?:[A-Za-z]{1,3}-)?",
            r"(?:\d{3,4}[- ]\d{3,4}|\d{4}-\d{4}|[A-Za-z0-9]{3,4}-[A-Za-z0-9]{3,4}|\d{4,8}|[A-Za-z0-9]{4,8})"
        ))
    })
}

fn clock() -> &'static CachedPattern {
    static R: OnceLock<CachedPattern> = OnceLock::new();
    R.get_or_init(|| CachedPattern::new(r"\d{1,2}:\d{2}"))
}

/// 全角转半角、去零宽字符、全角空格归一。
fn normalize(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{feff}' | '\u{2060}' => continue,
            '\u{3000}' => out.push(' '),
            '\u{ff01}'..='\u{ff5e}' => {
                out.push(char::from_u32(c as u32 - 0xfee0).unwrap_or(c));
            }
            _ => out.push(c),
        }
    }
    out
}

fn take_chars(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

fn before(text: &str, at: usize, n: usize) -> String {
    let mut v: Vec<char> = text[..at].chars().rev().take(n).collect();
    v.reverse();
    v.into_iter().collect()
}

fn after(text: &str, at: usize, n: usize) -> String {
    text[at..].chars().take(n).collect()
}

fn around(text: &str, start: usize, end: usize, n: usize) -> String {
    format!("{}{}", before(text, start, n), after(text, end, n))
}

fn has(win: &str, words: &[&str]) -> bool {
    let lower = win.to_ascii_lowercase();
    words.iter().any(|w| lower.contains(w))
}

const ORDER_WORDS: &[&str] = &[
    "订单",
    "单号",
    "快递",
    "运单",
    "物流",
    "包裹",
    "编号",
    "序号",
    "发票",
    "金额",
    "合计",
    "实付",
    "应付",
    "电话",
    "手机号",
    "会议号",
    "会议",
    "卡尾号",
    "尾号",
    "邮编",
    "sku",
    "訂單",
    "單號",
    "快遞",
    "運單",
    "編號",
    "序號",
    "發票",
    "金額",
    "合計",
    "實付",
    "應付",
    "電話",
    "手機號",
    "會議",
    "尾號",
    "郵編",
    "order",
    "track",
    "invoice",
    "amount",
    "phone",
    "meeting",
    "card ending",
];

const MONEY_WORDS: &[&str] = &[
    "¥", "￥", "$", "€", "元", "价格", "金额", "合计", "实付", "应付", "價格", "金額", "合計",
    "實付", "應付",
];

const PROMO_WORDS: &[&str] = &[
    "优惠", "折扣", "促销", "满减", "券", "红包", "coupon", "promo", "discount", "sale", "優惠",
    "促銷", "滿減", "紅包",
];

const EXPIRE_WORDS: &[&str] = &[
    "有效",
    "过期",
    "失效",
    "expire",
    "valid",
    "minutes",
    "分钟",
    "小时内",
    "過期",
    "分鐘",
    "小時內",
];

/// 纯字母只接受明确的验证码字段，不能靠标题、大小写或强调样式累积成高分。
fn alphabetic_code_at(hay: &str, start: usize, end: usize, text: &str, emph: &[String]) -> bool {
    const PROSE: &[&str] = &[
        "please",
        "verify",
        "confirm",
        "code",
        "your",
        "this",
        "that",
        "enter",
        "click",
        "continue",
        "account",
        "email",
        "password",
        "security",
        "valid",
        "invalid",
        "expired",
        "expires",
        "expire",
        "required",
        "secret",
        "secure",
        "private",
        "unique",
        "ready",
        "active",
        "inactive",
        "pending",
        "sent",
        "received",
        "request",
        "requested",
        "welcome",
        "thanks",
        "thank",
        "regards",
        "dear",
        "hello",
        "team",
        "support",
        "help",
        "here",
        "open",
        "login",
        "signin",
        "sign",
        "will",
        "soon",
        "sample",
        "example",
        "test",
        "token",
        "success",
        "failure",
        "correct",
        "check",
        "located",
        "below",
        "above",
        "copy",
        "paste",
        "next",
        "back",
        "cancel",
        "close",
        "submit",
        "resend",
        "retry",
        "start",
        "finish",
        "send",
        "reset",
        "refresh",
        "change",
        "update",
        "updated",
        "enabled",
        "disabled",
        "complete",
        "only",
        "none",
        "normal",
        "unknown",
        "missing",
        "allowed",
        "denied",
        "blocked",
        "google",
        "github",
        "openai",
        "apple",
        "amazon",
    ];
    let core = text.replace(['-', ' '], "");
    if !(4..=8).contains(&core.len())
        || !core.bytes().all(|b| b.is_ascii_alphabetic())
        || PROSE.contains(&core.to_ascii_lowercase().as_str())
    {
        return false;
    }
    let prefix = before(hay, start, 64);
    let Some(label) = strong()
        .find_iter(&prefix)
        .filter(|m| {
            !m.as_str().eq_ignore_ascii_case("code")
                && !prefix[..m.start()]
                    .chars()
                    .next_back()
                    .is_some_and(|c| c.is_ascii_alphanumeric())
                && !prefix[m.end()..]
                    .chars()
                    .next()
                    .is_some_and(|c| c.is_ascii_alphanumeric())
        })
        .last()
    else {
        return false;
    };
    let quote = |c: char| "\"'“”‘’「」`".contains(c);
    let raw_gap = &prefix[label.end()..];
    let gap = raw_gap
        .trim()
        .trim_end_matches(quote)
        .trim()
        .trim_end_matches([':', '：', '='])
        .trim()
        .to_ascii_lowercase();
    if !["", "is", "为", "為", "是"].contains(&gap.as_str()) {
        return false;
    }
    let tail = hay[end..]
        .trim_start_matches(quote)
        .trim_start_matches([' ', '\t']);
    if tail.starts_with(['@', '/', '\\', '_', '-'])
        || tail
            .strip_prefix('.')
            .is_some_and(|s| s.chars().next().is_some_and(|c| c.is_ascii_alphanumeric()))
    {
        return false;
    }
    let terminal = tail.is_empty()
        || tail.starts_with([
            '\r', '\n', '.', ',', '，', '。', ';', '；', '!', '！', ')', '）',
        ]);
    let line_start = hay[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let line_end = hay[end..].find('\n').map(|i| end + i).unwrap_or(hay.len());
    let own_line = hay[line_start..line_end].trim().trim_matches(quote) == text;
    let exact_emphasis = emph.iter().any(|e| e.trim() == text);
    if !terminal && !exact_emphasis {
        return false;
    }
    if raw_gap.contains('\n') {
        if !own_line && !exact_emphasis {
            return false;
        }
    } else if !raw_gap.contains([':', '：', '='])
        && !(!gap.is_empty() && core.bytes().filter(|b| b.is_ascii_uppercase()).count() >= 2)
        && !exact_emphasis
    {
        return false;
    }
    !has(&around(hay, start, end, 6), MONEY_WORDS)
        && !has(&before(hay, start, 20), ORDER_WORDS)
        && !has(&after(hay, end, 8), ORDER_WORDS)
        && !has(&around(hay, start, end, 40), PROMO_WORDS)
}

/// 从主题 + 正文里挑出最像验证码的一个；`emphasized` 是 HTML 里加粗/大字号片段的纯文本。
pub(super) fn extract(subject: &str, body: &str, emphasized: &[String]) -> Option<Code> {
    let subject = normalize(subject);
    let body = normalize(&take_chars(body, 6000));
    let hay = format!("{subject}\n{body}");
    let subject_end = subject.chars().count() + 1;
    let emph: Vec<String> = emphasized.iter().map(|s| normalize(s)).collect();

    let mut best: Option<(i32, usize, bool, Code)> = None;
    let mut alphabetic: Option<Code> = None;
    let mut alphabetic_ambiguous = false;
    for m in candidate().find_iter(&hay) {
        let prev = hay[..m.start()].chars().next_back();
        let next = hay[m.end()..].chars().next();
        // 只认 ASCII 字母数字边界：中文紧贴验证码是常态，不能当边界外丢弃。
        if prev.is_some_and(|c| c.is_ascii_alphanumeric())
            || next.is_some_and(|c| c.is_ascii_alphanumeric())
        {
            continue;
        }
        let text = m.as_str().to_string();
        if text
            .bytes()
            .all(|b| b.is_ascii_alphabetic() || b == b'-' || b == b' ')
        {
            if alphabetic_code_at(&hay, m.start(), m.end(), &text, &emph) {
                if let Some(previous) = &alphabetic {
                    alphabetic_ambiguous |= previous.text != text;
                } else {
                    alphabetic = Some(Code {
                        text,
                        score: THRESHOLD,
                    });
                }
            }
            continue;
        }
        let Some((score, strong_signal)) =
            score_at(&hay, m.start(), m.end(), &text, subject_end, &emph)
        else {
            continue;
        };
        // 没有强信号（强关键词 / 主题 / HTML 强调 / 独占行 / 冒号后）就不算验证码：
        // 宁可不显示，也不能把订单号、金额之类的数字放大展示。
        if !strong_signal {
            continue;
        }
        let char_pos = hay[..m.start()].chars().count();
        let in_subject = char_pos < subject_end;
        let better = match &best {
            None => true,
            Some((s, p, subj, _)) => {
                score > *s
                    || (score == *s && in_subject && !*subj)
                    || (score == *s && in_subject == *subj && char_pos < *p)
            }
        };
        if better {
            best = Some((score, char_pos, in_subject, Code { text, score }));
        }
    }
    best.map(|(_, _, _, code)| code)
        .filter(|c| c.score >= THRESHOLD)
        .or(if alphabetic_ambiguous {
            None
        } else {
            alphabetic
        })
}

fn score_at(
    hay: &str,
    start: usize,
    end: usize,
    text: &str,
    subject_end: usize,
    emph: &[String],
) -> Option<(i32, bool)> {
    let core: String = text.chars().filter(|c| c.is_alphanumeric()).collect();
    let digits = core.chars().filter(|c| c.is_ascii_digit()).count();
    let letters = core.chars().filter(|c| c.is_ascii_alphabetic()).count();
    if digits == 0 {
        return None;
    }
    let mixed = letters > 0;
    let separated = text.chars().any(|c| c == '-' || c == ' ');
    let len = core.chars().count();

    let mut score = if mixed {
        if len < 5 {
            return None;
        }
        if len == 6 {
            20
        } else if separated {
            22
        } else {
            14
        }
    } else {
        match len {
            6 => {
                if separated {
                    28
                } else {
                    30
                }
            }
            7 | 8 => {
                if separated {
                    22
                } else {
                    18
                }
            }
            5 => 20,
            4 => 16,
            _ => return None,
        }
    };

    let b40 = before(hay, start, 40);
    let b250 = before(hay, start, 250);
    let b60 = before(hay, start, 60);
    let a40 = after(hay, end, 40);

    // ---- 硬丢弃：URL / 邮箱 / 日期时间 / 电话 / 订单金额卡号 ----
    let token = {
        let left = hay[..start]
            .char_indices()
            .rev()
            .find(|(_, c)| c.is_whitespace())
            .map(|(i, c)| i + c.len_utf8())
            .unwrap_or(0);
        let right = hay[end..]
            .find(char::is_whitespace)
            .map(|i| end + i)
            .unwrap_or(hay.len());
        &hay[left..right]
    };
    let tl = token.to_ascii_lowercase();
    if tl.contains("http") || tl.contains("www.") || token.contains('/') || token.contains('@') {
        return None;
    }
    let date_win = around(hay, start, end, 6);
    if has(&date_win, &["年", "月", "日", "有效期至"])
        || clock().is_match(&date_win)
        || clock().is_match(&before(hay, start, 8))
    {
        return None;
    }
    if has(&around(hay, start, end, 6), MONEY_WORDS) {
        return None;
    }
    // 订单/电话/会议号这类词只认紧邻的前文与极短的后续：真实验证码后面常跟
    // “如非本人操作…订单号…”这类无关尾巴，窗口放宽会把真码误杀。
    if has(&before(hay, start, 20), ORDER_WORDS) || has(&after(hay, end, 8), ORDER_WORDS) {
        return None;
    }
    // 4 位年份：直接判负，掉到门槛以下
    if len == 4 && !mixed {
        if let Ok(y) = core.parse::<u32>() {
            if (1900..=2100).contains(&y) {
                score -= 35;
            }
        }
    }

    // ---- 正向信号 ----
    let strong_before = strong().is_match(&b40);
    if strong_before {
        score += 40;
    } else if strong().is_match(&b250) {
        score += 22;
    } else if weak().is_match(&b60) {
        score += 15;
    }
    if strong().is_match(&a40) {
        score += 28;
    }

    let line_start = hay[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let line_end = hay[start..]
        .find('\n')
        .map(|i| start + i)
        .unwrap_or(hay.len());
    let line = hay[line_start..line_end]
        .trim()
        .trim_end_matches(['。', '，', ',', '.', '！', '!', '、', ';', '；'])
        .trim();
    let own_line = line == text;
    let colon = hay[..start].trim_end().ends_with(':');
    let char_pos = hay[..start].chars().count();
    let in_subject = char_pos < subject_end;
    let is_emph = emph.iter().any(|e| e.contains(text));

    if mixed && !(own_line || colon || in_subject || is_emph) {
        return None;
    }

    if own_line {
        score += 15;
    }
    if colon {
        score += 10;
    }
    if in_subject {
        score += 15;
    }
    if is_emph {
        score += 25;
    }
    if has(
        &b40,
        &[
            "验证码是",
            "验证码为",
            "校验码是",
            "驗證碼是",
            "驗證碼為",
            "校驗碼是",
            "code is",
            "code:",
        ],
    ) {
        score += 5;
    }
    if has(&a40, EXPIRE_WORDS) || has(&b60, EXPIRE_WORDS) {
        score += 5;
    }
    if has(&around(hay, start, end, 40), PROMO_WORDS) {
        score -= 30;
    }
    // 强信号：任何一个成立才允许上岛展示。
    let strong_signal =
        strong_before || strong().is_match(&a40) || in_subject || is_emph || own_line || colon;
    Some((score, strong_signal))
}

/// Header prefilter; body downloads are limited separately to new unread arrivals.
pub(super) fn likely_verification(subject: &str, sender: &str) -> bool {
    strong().is_match(subject)
        || weak().is_match(subject)
        || weak().is_match(sender)
        || has(
            sender,
            &["security", "auth", "account", "otp", "no-reply", "noreply"],
        )
}

#[cfg(test)]
#[path = "otp_tests.rs"]
mod tests;
