//! 城市搜索的常用简称。Open-Meteo 的地理编码按名称匹配，"bj"、"sh" 这类简称搜不到，
//! 先换成全名再请求；其余输入原样返回。

const ALIASES: &[(&str, &str)] = &[
    ("bj", "beijing"), ("sh", "shanghai"), ("gz", "guangzhou"), ("sz", "shenzhen"),
    ("cd", "chengdu"), ("hz", "hangzhou"), ("nj", "nanjing"), ("wh", "wuhan"),
    ("cq", "chongqing"), ("tj", "tianjin"), ("xa", "xian"), ("cs", "changsha"),
    ("zz", "zhengzhou"), ("qd", "qingdao"), ("dl", "dalian"), ("sy", "shenyang"),
    ("hrb", "harbin"), ("km", "kunming"), ("xm", "xiamen"), ("fz", "fuzhou"),
    ("jn", "jinan"), ("hf", "hefei"), ("sjz", "shijiazhuang"), ("ty", "taiyuan"),
    ("nc", "nanchang"), ("gy", "guiyang"), ("nn", "nanning"), ("lz", "lanzhou"),
    ("hk", "hong kong"), ("ls", "lhasa"), ("wlmq", "urumqi"), ("hhht", "hohhot"),
];

/// 输入恰好是已知简称（忽略大小写和首尾空白）时返回全名。
pub(super) fn expand(query: &str) -> String {
    let key = query.trim().to_ascii_lowercase();
    ALIASES
        .iter()
        .find(|(short, _)| *short == key)
        .map(|(_, full)| (*full).to_string())
        .unwrap_or_else(|| query.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::expand;

    #[test]
    fn expands_known_abbreviations_only() {
        assert_eq!(expand("BJ"), "beijing");
        assert_eq!(expand(" sh "), "shanghai");
        assert_eq!(expand("北京"), "北京");
        assert_eq!(expand("bjx"), "bjx");
    }
}
