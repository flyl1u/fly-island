//! Lyrics from Apple's own service: the official word-by-word lyrics of the songs in
//! Apple Music. The song is looked up in the catalog first, which needs no login (only the
//! developer token that Apple's web app carries), and the lyrics are then fetched with the
//! user's media token, as Apple gives them only to a signed-in listener.

#![allow(dead_code, reason = "the plugin command layer calls these once the source is wired in")]

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
    let Ok(answer) = get_json(client, &url, developer, Some(token)).await else {
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
    let songs = answer["results"]["songs"].as_array()?;
    songs
        .iter()
        .filter_map(|song| {
            let attributes = &song["attributes"];
            let name = attributes["name"].as_str()?;
            let artist_name = attributes["artistName"].as_str()?;
            let length = attributes["durationInMillis"].as_i64().unwrap_or(0);
            let id = song["id"].as_str()?.to_string();
            same_track((title, artist, duration_ms), (name, artist_name, length)).then_some((id, length))
        })
        .enumerate()
        .min_by_key(|(index, (_, length))| if duration_ms > 0 { (duration_ms - length).abs() } else { *index as i64 })
        .map(|(_, found)| found)
}

/// The TTML of the song's lyrics: the word-by-word one, or the plain one.
fn ttml_of(answer: &Value) -> Option<String> {
    let relationships = &answer["data"][0]["relationships"];
    for name in ["syllable-lyrics", "lyrics"] {
        let attributes = &relationships[name]["data"][0]["attributes"];
        if let Some(text) = attributes["ttml"].as_str().filter(|text| !text.is_empty()) {
            return Some(text.to_string());
        }
        if let Some(localizations) = attributes["ttmlLocalizations"].as_object() {
            for value in localizations.values() {
                if let Some(text) = value["ttml"].as_str().filter(|text| !text.is_empty()) {
                    return Some(text.to_string());
                }
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
    let search = get_json(&client, &search_url(&store.id, &store.language, &term), &developer, None).await?;
    let Some((id, length)) = best_song(&search, title, artist, duration_ms) else {
        return Ok(None);
    };
    let song = get_json(&client, &song_url(&store.id, &store.language, &id), &developer, Some(token)).await?;
    Ok(lyrics_of(&song, title).map(|found| found.with_duration(length)))
}

/// The text at an address.
async fn get_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let response = client.get(url).send().await.map_err(|error| format!("Could not reach Apple Music: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Apple Music answered {}", response.status()));
    }
    response.text().await.map_err(|error| format!("Apple Music sent something unexpected: {error}"))
}

/// The answer at an address, as JSON.
async fn get_json(
    client: &reqwest::Client,
    url: &str,
    developer: &str,
    user: Option<&str>,
) -> Result<Value, String> {
    let mut request = client
        .get(url)
        .header("Origin", "https://music.apple.com")
        .header("Accept", "application/json")
        .bearer_auth(developer);
    if let Some(token) = user {
        request = request.header("media-user-token", token);
    }
    let response = request.send().await.map_err(|error| format!("Could not reach Apple Music: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Apple Music answered {}", response.status()));
    }
    response.json().await.map_err(|error| format!("Apple Music sent something unexpected: {error}"))
}

#[cfg(test)]
mod tests;
