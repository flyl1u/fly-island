use super::*;

#[test]
fn common_verification_messages() {
    for (subject, body) in [
        ("QQ登录验证", "您的验证码是 834921，请勿泄露。"),
        ("微信安全中心", "本次操作验证码：834921，五分钟内有效。"),
        ("支付宝身份验证", "校验码 834921，请勿告知他人。"),
        ("GitHub verification code", "Your verification code is 834921."),
        ("Apple ID", "Your Apple Account verification code is 834921."),
        ("Google verification code", "Your Google verification code is 834921."),
        ("Microsoft account security code", "Security code: 834921"),
        ("Steam Guard", "Your Steam account access code is 834921."),
        ("Your code", "Use 834921 to sign in."),
    ] {
        assert_eq!(extract(subject, body, &[]).map(|code| code.text).as_deref(), Some("834921"), "{subject}");
    }
}

#[test]
fn subject_prefilter_and_year_amount_promotion_negatives() {
    assert!(likely_verification("Sign-in request", "sender@example.com"));
    assert!(likely_verification("Notice", "security@example.com"));
    assert!(!likely_verification("Weekly report", "news@example.com"));
    for body in [
        "Verification code: 2026",
        "Verification code: $834921",
        "Your promo code: SAVE20",
        "Verification code: 834921@example.com",
        "Verification code valid until 2026/11/15",
    ] {
        assert_eq!(extract("", body, &[]), None, "{body}");
    }
}

#[test]
fn numeric_html_entities_still_produce_a_maskable_code() {
    let body = html_to_text("<p>验证码：&#49;&#50;&#51;&#52;&#53;&#54;</p>");
    assert_eq!(
        extract("", &body, &[]).map(|c| c.text),
        Some("123456".into())
    );
}

fn code(subject: &str, body: &str) -> Option<String> {
    extract(subject, body, &[]).map(|c| c.text)
}

#[test]
fn alphabetic_codes_require_an_explicit_code_field() {
    for (subject, body, expected) in [
        (
            "Your verification code",
            "Your verification code: QXTRPA",
            "QXTRPA",
        ),
        (
            "Your security code",
            "Your security code: qmxrpt.",
            "qmxrpt",
        ),
        ("", "Your verification code is QxTrPa.", "QxTrPa"),
        ("", "验证码为：AbCdEf。", "AbCdEf"),
        ("", "您的一次性驗證碼為：QXTRPA", "QXTRPA"),
        (
            "Sign-in",
            "One-time code:\nQXTRPA\nExpires in 5 minutes.",
            "QXTRPA",
        ),
        ("", "OTP:\nABCD-EFGH", "ABCD-EFGH"),
        ("", "Verification code\n\nQXTRPA\n", "QXTRPA"),
    ] {
        assert_eq!(code(subject, body), Some(expected.into()), "{body}");
    }
}

#[test]
fn alphabetic_codes_reject_regular_words_and_non_authentication_fields() {
    for (subject, body) in [
        (
            "Verification code",
            "Your verification code will arrive soon.",
        ),
        ("Verification code", "Thanks"),
        ("", "Your verification code is valid."),
        ("", "Your verification code is ready."),
        ("", "Your verification code is useful."),
        ("", "Your verification code is SECURE."),
        ("", "Verification code: Action Required"),
        ("", "Verification code:\nCOPY"),
        ("", "Verification code: NEXT"),
        ("", "Your verification code is NORMAL."),
        ("", "Verification code: PLEASE ENTER THE CODE."),
        ("", "Please verify your email and click CONTINUE."),
        ("", "CODE: GITHUB"),
        ("", "Source code: SAMPLE"),
        ("", "Your promo code: SUMMER"),
        ("", "Verification code: SUMMER. Enjoy a discount."),
        ("", "Verification code: https://example.com/QXTRPA"),
        ("", "Verification code: QXTRPA@example.com"),
        ("", "Verification code: QXTRPA.com"),
        ("", "Verification code: abcdefghijkl"),
        ("", "Verification code: ABC"),
    ] {
        assert_eq!(
            code(subject, body),
            None,
            "普通英文不能被放大成验证码：{body}"
        );
    }
    let body =
        html_to_text("<h1>Account verification</h1><p><b>WELCOME</b></p><p>Please sign in.</p>");
    assert_eq!(
        extract("Verification code", &body, &["WELCOME".into()]),
        None,
        "标题和加粗单词不能单独证明这是验证码"
    );
}

#[test]
fn alphabetic_codes_do_not_guess_between_distinct_values() {
    assert_eq!(
        code("", "Verification code: QXTRPA\nSecurity code: JZKWRT"),
        None
    );
    assert_eq!(
        code("", "Verification code: QXTRPA\nSecurity code: QXTRPA"),
        Some("QXTRPA".into())
    );
    assert_eq!(
        code("", "Verification code: QXTRPA\nVerification code: 123456"),
        Some("123456".into())
    );
}

#[test]
fn regression_traditional_verification_codes() {
    let body="我們收到您要申請一次性驗證碼來與 Microsoft 帳戶搭配使用。\n您的一次性驗證碼為：431872\n僅在官方網站或應用程式上輸入此代碼。不要與任何人分享。";
    assert_eq!(code("您的一次性驗證碼", body), Some("431872".into()));
    for (subject, body, expected) in [
        ("登入驗證碼", "您的一次性驗證碼為：4318729", "4318729"),
        ("", "您的驗證碼為 431872，請勿分享。", "431872"),
        ("", "您的動態密碼：482913，5 分鐘內有效。", "482913"),
    ] {
        assert_eq!(code(subject, body), Some(expected.into()), "{body}");
    }
    for body in [
        "驗證碼通知：訂單號 431872 已出貨",
        "驗證碼通知：電話 431872",
        "驗證碼通知：金額 431872",
        "驗證碼請見圖片",
    ] {
        assert_eq!(code("", body), None, "不能把普通数字当成验证码：{body}");
    }
}

#[test]
fn chinese_codes_with_strong_keyword() {
    assert_eq!(
        code("【某某】验证码", "您的验证码是：834921，10分钟内有效。"),
        Some("834921".into())
    );
    assert_eq!(
        code("", "动态密码：482913（5分钟内有效）"),
        Some("482913".into())
    );
    assert_eq!(code("", "验证码 906213"), Some("906213".into()));
    assert_eq!(code("", "安全码：4021"), Some("4021".into()));
    assert_eq!(code("", "验证码\n735164\n请勿泄露"), Some("735164".into()));
}

#[test]
fn unicode_whitespace_before_code_is_safe() {
    for space in ['\u{00a0}', '\u{2002}', '\u{2003}', '\u{202f}', '\u{3000}'] {
        let text = format!("验证码：{space}834921");
        assert_eq!(code("", &text), Some("834921".into()));
        assert_eq!(code(&text, ""), Some("834921".into()));
        assert_eq!(
            code("", &format!("验证码：{space}https://example.com/834921")),
            None
        );
    }
}

#[test]
fn english_and_mixed_alnum_codes() {
    assert_eq!(
        code(
            "Your verification code",
            "Your verification code is 552310. It expires in 10 minutes."
        ),
        Some("552310".into())
    );
    assert_eq!(code("", "验证码：A1B2C3"), Some("A1B2C3".into()));
    assert_eq!(
        code("验证码 K7Q2-9XMP", "10 分钟内有效"),
        Some("K7Q2-9XMP".into())
    );
}

#[test]
fn full_width_digits_are_normalized() {
    assert_eq!(
        code("", "您的验证码是：８３４９２１，10分钟内有效"),
        Some("834921".into())
    );
}

#[test]
fn emphasized_html_without_nearby_keyword() {
    let body =
        html_to_text("<p>尊敬的用户，您正在进行登录操作。</p><p>本次校验：<b>834921</b></p>");
    let emph = emphasized("<p>尊敬的用户，您正在进行登录操作。</p><p>本次校验：<b>834921</b></p>");
    assert_eq!(
        extract("", &body, &emph).map(|c| c.text),
        Some("834921".into())
    );
}

#[test]
fn negatives_are_rejected() {
    let cases = [
        ("", "您的订单号 12345678 已发货"),
        ("", "订单 482913，金额 ￥1,299.00"),
        ("", "会议号 123 456 789"),
        ("", "2026年10月30日 13:20 开始"),
        ("", "客服电话 400-800-8888"),
        ("", "优惠券码 SAVE20，立减 20 元"),
        ("", "https://example.com/verify/482913"),
        ("", "卡尾号 8891"),
        ("", "邮编 200120"),
        ("", "验证码有效期至 2026-10-30"),
        ("", "产品型号 SKU-8891 已出库"),
        ("", "验证码请见图片"),
        ("", "您的快递 773456789012 已到驿站"),
        ("", "验证码：请在邮箱中查看"),
    ];
    for (subject, body) in cases {
        assert_eq!(code(subject, body), None, "should reject: {body}");
    }
}

#[test]
fn order_number_does_not_beat_real_code() {
    assert_eq!(
        code("", "验证码：834921，如非本人操作请忽略。订单号 987654"),
        Some("834921".into())
    );
}

#[test]
fn html_to_text_strips_tags_and_entities() {
    let text = html_to_text("<div>验证码&nbsp;123456</div><script>var x=1</script>");
    assert!(text.contains("验证码 123456"));
    assert!(!text.contains("var x"));
}
