//! Lyrics from Apple's own service: the official word-by-word lyrics of the songs in
//! Apple Music. The song is looked up in the catalog first, which needs no login (only the
//! developer token that Apple's web app carries), and the lyrics are then fetched with the
//! user's media token, as Apple gives them only to a signed-in listener.

use std::sync::{Mutex, OnceLock};

use keyring::{Entry, Error as KeyringError};
use serde_json::Value;

use super::found::{browser_client, from_lines, FoundLyrics};
use super::matching::same_track;
use super::ttml::parse_ttml;

/// Where the user's media token is kept in the Windows Credential Manager.
const KEYRING_SERVICE: &str = "com.focusd.island.apple-music-lyrics";
const KEYRING_ACCOUNT: &str = "media-user-token";

/// Apple's web app, where the developer token is taken from.
const BROWSE_URL: &str = "https://music.apple.com/us/browse";
/// Apple's music API.
const API_BASE: &str = "https://amp-api.music.apple.com/v1";
/// The storefront and language used when the account's own ones cannot be read.
const DEFAULT_STOREFRONT: &str = "cn";
const DEFAULT_LANGUAGE: &str = "zh-Hans-CN";

/// The user's media token from the Windows Credential Manager; `None` when there is none.
pub(super) fn read_token() -> Option<String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).ok()?;
    match entry.get_password() {
        Ok(token) if !token.trim().is_empty() => Some(token),
        _ => None,
    }
}

/// Keeps the user's media token in the Windows Credential Manager.
pub(super) fn write_token(token: &str) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("The Apple Music token cannot be empty.".to_string());
    }
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|_| "Cannot reach the Windows Credential Manager.".to_string())?
        .set_password(token)
        .map_err(|_| "Cannot save the Apple Music token.".to_string())
}

/// Forgets the user's media token.
pub(super) fn clear_token() -> Result<(), String> {
    let deleted = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|_| "Cannot reach the Windows Credential Manager.".to_string())?
        .delete_credential();
    match deleted {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("Cannot delete the Apple Music token.".to_string()),
    }
}

/// The developer token, kept for the life of the process; a failed attempt is not kept.
static DEVELOPER_TOKEN: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn developer_token_cache() -> &'static Mutex<Option<String>> {
    DEVELOPER_TOKEN.get_or_init(|| Mutex::new(None))
}

/// The developer token Apple's web app uses; it is the same for everyone. It is read from the
/// web app's script, as Apple does not hand it out.
async fn developer_token(client: &reqwest::Client) -> Result<String, String> {
    if let Some(token) = developer_token_cache().lock().ok().and_then(|cached| cached.clone()) {
        return Ok(token);
    }
    let html = get_text(client, BROWSE_URL).await?;
    let script = find_script_url(&html).ok_or("Apple Music's page has no script address.".to_string())?;
    let text = get_text(client, &script).await?;
    let token = find_jwt(&text).ok_or("Apple Music's script has no developer token.".to_string())?;
    if let Ok(mut cached) = developer_token_cache().lock() {
        *cached = Some(token.clone());
    }
    Ok(token)
}

/// The address of the web app's main script, which carries the developer token.
fn find_script_url(html: &str) -> Option<String> {
    let mut from = 0;
    while let Some(found) = html[from..].find("assets/index") {
        let start = from + found;
        let rest = &html[start..];
        let Some(end) = rest.find(".js") else { break };
        let path = &rest[..end + 3];
        // The name must run on to the end of the address, not stop at a quote.
        if !path.contains(['"', '\'', ' ', '<']) {
            return Some(format!("https://music.apple.com/{path}"));
        }
        from = start + 1;
    }
    None
}

/// The first token in a script: a header, a payload and a signature, all base64url.
fn find_jwt(text: &str) -> Option<String> {
    let mut from = 0;
    while let Some(found) = text[from..].find("eyJ") {
        let start = from + found;
        let rest = &text[start..];
        let end = rest.find(|character: char| !is_jwt_char(character)).unwrap_or(rest.len());
        let candidate = &rest[..end];
        let parts: Vec<&str> = candidate.split('.').collect();
        if parts.len() == 3 && parts.iter().all(|part| !part.is_empty()) {
            return Some(candidate.to_string());
        }
        from = start + 3;
    }
    None
}

/// Whether a character may be part of a token: base64url and the dots between the parts.
fn is_jwt_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '-' || character == '.'
}

/// The storefront and language of the account.
struct Storefront {
    id: String,
    language: String,
}

/// The account's own storefront and language; the Chinese ones when they cannot be read.
async fn storefront(client: &reqwest::Client, developer: &str, token: &str) -> Storefront {
    let url = format!("{API_BASE}/me/storefront");
    let Ok(Some(answer)) = get_json(client, &url, developer, Some(token)).await else {
        return Storefront { id: DEFAULT_STOREFRONT.to_string(), language: DEFAULT_LANGUAGE.to_string() };
    };
    let attributes = &answer["data"][0]["attributes"];
    let Some(id) = attributes["storefront"].as_str() else {
        return Storefront { id: DEFAULT_STOREFRONT.to_string(), language: DEFAULT_LANGUAGE.to_string() };
    };
    Storefront {
        id: id.to_string(),
        language: attributes["defaultLanguageTag"].as_str().unwrap_or(DEFAULT_LANGUAGE).to_string(),
    }
}

/// The address of a song search.
fn search_url(storefront: &str, language: &str, term: &str) -> String {
    format!(
        "{API_BASE}/catalog/{storefront}/search?term={}&types=songs&limit=20&l={}",
        encode_query(term),
        encode_query(language)
    )
}

/// The address of a song, with its lyrics.
fn song_url(storefront: &str, language: &str, id: &str) -> String {
    format!("{API_BASE}/catalog/{storefront}/songs/{id}?include[songs]=lyrics,syllable-lyrics&l={}", encode_query(language))
}

/// The addresses of the lyrics of a song, in the order they are tried. The two sub-resources
/// come first: their answer holds the words right away, while the song asked with `include`
/// only links to them, and that link is empty for a song without a subscription.
fn lyrics_urls(storefront: &str, language: &str, id: &str) -> [String; 3] {
    [
        format!(
            "{API_BASE}/catalog/{storefront}/songs/{id}/syllable-lyrics?l={}&extend=ttmlLocalizations",
            encode_query(language)
        ),
        song_url(storefront, language, id),
        format!("{API_BASE}/catalog/{storefront}/songs/{id}/lyrics?l={}", encode_query(language)),
    ]
}

/// A text for a query string: everything but letters, digits and a few marks is written as %XX.
fn encode_query(text: &str) -> String {
    let mut encoded = String::with_capacity(text.len());
    for byte in text.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

/// The search result that is the playing track: the same song, with the closest length.
fn best_song(answer: &Value, title: &str, artist: &str, duration_ms: i64) -> Option<(String, i64)> {
    // Apple nests the songs in an object of their own: `results.songs.data`.
    let songs = answer["results"]["songs"]["data"].as_array()?;
    let candidates: Vec<(String, i64, bool)> = songs
        .iter()
        .filter_map(|song| {
            let attributes = &song["attributes"];
            let name = attributes["name"].as_str()?;
            let artist_name = attributes["artistName"].as_str()?;
            let length = attributes["durationInMillis"].as_i64().unwrap_or(0);
            let id = song["id"].as_str()?.to_string();
            // A missing flag is read as "has lyrics": only an explicit false rules a song out.
            let has_lyrics = attributes["hasLyrics"].as_bool().unwrap_or(true);
            same_track((title, artist, duration_ms), (name, artist_name, length)).then_some((id, length, has_lyrics))
        })
        .collect();
    // Every song of the album comes with an instrumental version, and the two are named the same
    // once the version note is cleaned away. The instrumental one has no lyrics at all, so the
    // songs that have lyrics come first; only when none of them does the rest is used.
    let with_lyrics: Vec<&(String, i64, bool)> =
        candidates.iter().filter(|(_, _, has_lyrics)| *has_lyrics).collect();
    let pool: Vec<&(String, i64, bool)> =
        if with_lyrics.is_empty() { candidates.iter().collect() } else { with_lyrics };
    pool.iter()
        .min_by_key(|(_, length, _)| if duration_ms > 0 { (duration_ms - *length).abs() } else { 0 })
        .map(|(id, length, _)| (id.clone(), *length))
}

/// The TTML of the song's lyrics: the word-by-word one, or the plain one. Apple's answers
/// come in two shapes: a sub-resource puts the words straight in `data[0].attributes`, while the
/// song asked with `include` keeps them in `relationships`.
fn ttml_of(answer: &Value) -> Option<String> {
    if let Some(text) = ttml_text(&answer["data"][0]["attributes"]) {
        return Some(text);
    }
    let relationships = &answer["data"][0]["relationships"];
    for name in ["syllable-lyrics", "lyrics"] {
        if let Some(text) = ttml_text(&relationships[name]["data"][0]["attributes"]) {
            return Some(text);
        }
    }
    None
}

/// The TTML in a set of attributes: the whole file, or the copy of one language.
fn ttml_text(attributes: &Value) -> Option<String> {
    if let Some(text) = attributes["ttml"].as_str().filter(|text| !text.is_empty()) {
        return Some(text.to_string());
    }
    let localizations = &attributes["ttmlLocalizations"];
    if let Some(text) = localizations.as_str().filter(|text| !text.is_empty()) {
        return Some(text.to_string());
    }
    if let Some(object) = localizations.as_object() {
        for value in object.values() {
            if let Some(text) = value["ttml"].as_str().filter(|text| !text.is_empty()) {
                return Some(text.to_string());
            }
        }
    }
    None
}

/// The lyrics of a song, as the island shows them.
fn lyrics_of(answer: &Value, title: &str) -> Option<FoundLyrics> {
    let ttml = ttml_of(answer)?;
    let (lines, translations) = parse_ttml(&ttml)?;
    let has_translation = translations.iter().any(|line| !line.is_empty());
    from_lines(&lines, has_translation.then_some(translations.as_slice()), title)
}

/// The official lyrics of the playing track. `Ok(None)` when Apple has none for it.
pub(super) async fn fetch(
    title: &str,
    artist: &str,
    #[expect(unused_variables, reason = "the caller hands over the album, but Apple's search does not need it")]
    album: &str,
    duration_ms: i64,
    token: &str,
) -> Result<Option<FoundLyrics>, String> {
    let token = token.trim();
    if token.is_empty() {
        return Ok(None);
    }
    let client = browser_client()?;
    let developer = developer_token(&client).await?;
    let store = storefront(&client, &developer, token).await;
    let term = format!("{title} {artist}").trim().to_string();
    let Some(search) = get_json(&client, &search_url(&store.id, &store.language, &term), &developer, None).await? else {
        return Ok(None);
    };
    let Some((id, length)) = best_song(&search, title, artist, duration_ms) else {
        return Ok(None);
    };
    // Apple's answers with 404 when the song has no lyrics of that kind, so every address is
    // tried until one of them carries the words.
    let mut failure = None;
    let mut reached = false;
    for url in lyrics_urls(&store.id, &store.language, &id) {
        match get_json(&client, &url, &developer, Some(token)).await {
            Ok(Some(answer)) => {
                reached = true;
                if let Some(found) = lyrics_of(&answer, title) {
                    return Ok(Some(found.with_duration(length)));
                }
            }
            Ok(None) => reached = true,
            Err(error) => failure = Some(error),
        }
    }
    // Apple was reached, so the song simply has no lyrics here; a failure of every address is
    // a real one.
    match failure {
        Some(error) if !reached => Err(error),
        _ => Ok(None),
    }
}

/// The text at an address.
async fn get_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let response = client.get(url).send().await.map_err(|error| format!("Could not reach Apple Music: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Apple Music answered {}", response.status()));
    }
    response.text().await.map_err(|error| format!("Apple Music sent something unexpected: {error}"))
}

/// The answer at an address, as JSON. `None` when Apple says there is nothing there (404).
async fn get_json(
    client: &reqwest::Client,
    url: &str,
    developer: &str,
    user: Option<&str>,
) -> Result<Option<Value>, String> {
    let mut request = client
        .get(url)
        .header("Origin", "https://music.apple.com")
        .header("Accept", "application/json")
        .bearer_auth(developer);
    if let Some(token) = user {
        // Apple takes the media token either as a header or as a cookie; both are sent, so it
        // does not matter which of the two the lyrics endpoint accepts.
        request = request.header("media-user-token", token).header("Cookie", format!("media-user-token={token}"));
    }
    let response = request.send().await.map_err(|error| format!("Could not reach Apple Music: {error}"))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("Apple Music answered {}", response.status()));
    }
    response
        .json()
        .await
        .map(Some)
        .map_err(|error| format!("Apple Music sent something unexpected: {error}"))
}

#[cfg(test)]
mod tests;
