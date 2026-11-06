//! CalDAV (RFC 4791), which Feishu, DingTalk, WeCom and iCloud offer with an account and an app
//! password made in their calendar settings. The address may be a calendar: its events in a
//! time range are asked for with one REPORT. Otherwise it is a server or an account, and its
//! calendars are found first (current-user-principal, calendar-home-set, then the collections
//! that are calendars), as clients do; Feishu's discovery is not complete, so the calendar's own
//! address can always be given instead.

use std::time::Duration;

use chrono::{DateTime, Utc};
use quick_xml::{events::Event, Reader};
use reqwest::{Method, Url};

use crate::system::updater::get_updater_proxy;

/// A calendar answer far past this is not a few days of events.
const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
/// Calendars of one account asked, at most.
const MAX_CALENDARS: usize = 20;

/// What a multistatus answer says, per `<response>`: its href and the elements in it.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct DavResponse {
    pub(super) href: String,
    /// `calendar-data` texts (a calendar-query answer).
    pub(super) calendar_data: Vec<String>,
    /// `resourcetype` contains `calendar`.
    pub(super) is_calendar: bool,
    /// The hrefs inside `current-user-principal` and `calendar-home-set`.
    pub(super) principal: Option<String>,
    pub(super) home: Option<String>,
}

/// The responses of a multistatus document, by element local names (prefixes vary by server).
pub(super) fn parse_multistatus(xml: &str) -> Vec<DavResponse> {
    let mut reader = Reader::from_str(xml);
    let mut responses = Vec::new();
    let mut stack: Vec<String> = Vec::new();
    let mut current: Option<DavResponse> = None;
    let mut text = String::new();
    loop {
        let event = match reader.read_event() {
            Ok(Event::Eof) | Err(_) => break,
            Ok(event) => event,
        };
        match event {
            Event::Start(start) => {
                let name = String::from_utf8_lossy(start.local_name().as_ref()).to_ascii_lowercase();
                if name == "response" {
                    current = Some(DavResponse::default());
                }
                stack.push(name);
                text.clear();
            }
            Event::Empty(empty) => {
                let name = String::from_utf8_lossy(empty.local_name().as_ref()).to_ascii_lowercase();
                if let Some(response) = current.as_mut().filter(|_| name == "calendar" && stack.iter().any(|open| open == "resourcetype")) {
                    response.is_calendar = true;
                }
            }
            Event::Text(content) => text.push_str(&content.xml_content().unwrap_or_default()),
            Event::CData(content) => text.push_str(&String::from_utf8_lossy(&content)),
            Event::GeneralRef(reference) => {
                let name = String::from_utf8_lossy(&reference).to_string();
                text.push_str(match name.as_str() {
                    "lt" => "<",
                    "gt" => ">",
                    "amp" => "&",
                    "quot" => "\"",
                    "apos" => "'",
                    _ => "",
                });
                if let Some(code) = name.strip_prefix('#') {
                    let value = code.strip_prefix('x').map_or_else(|| code.parse().ok(), |hex| u32::from_str_radix(hex, 16).ok());
                    text.extend(value.and_then(char::from_u32));
                }
            }
            Event::End(_) => {
                let name = stack.pop().unwrap_or_default();
                let parent = stack.last().map(String::as_str);
                if let Some(response) = current.as_mut() {
                    match (name.as_str(), parent) {
                        ("href", Some("response")) => response.href = text.trim().to_string(),
                        ("href", _) if stack.iter().any(|open| open == "current-user-principal") => response.principal = Some(text.trim().to_string()),
                        ("href", _) if stack.iter().any(|open| open == "calendar-home-set") => response.home = Some(text.trim().to_string()),
                        ("calendar-data", _) => response.calendar_data.push(text.clone()),
                        ("calendar", _) if stack.iter().any(|open| open == "resourcetype") => response.is_calendar = true,
                        _ => {}
                    }
                }
                if name == "response" {
                    responses.extend(current.take());
                }
                text.clear();
            }
            _ => {}
        }
    }
    responses
}

fn client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION")));
    if let Some(proxy) = get_updater_proxy() {
        builder = builder.proxy(reqwest::Proxy::all(&proxy).map_err(|error| format!("Invalid proxy {proxy}: {error}"))?);
    }
    builder.build().map_err(|error| format!("Could not create the HTTP client: {error}"))
}

pub(super) struct Account<'a> {
    pub(super) url: &'a str,
    pub(super) username: &'a str,
    pub(super) password: &'a str,
}

/// One WebDAV request; the multistatus answer, or `Err` naming what went wrong.
async fn dav(client: &reqwest::Client, account: &Account<'_>, method: &str, url: &Url, depth: &str, body: String) -> Result<String, String> {
    let method = Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?;
    let response = client
        .request(method, url.clone())
        .basic_auth(account.username, Some(account.password))
        .header("Depth", depth)
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(body)
        .send()
        .await
        .map_err(|error| format!("连不上日历服务器：{error}"))?;
    match response.status().as_u16() {
        401 | 403 => return Err("日历账号或密码不对。".into()),
        status if !(200..300).contains(&status) => return Err(format!("日历服务器返回 {status}。")),
        _ => {}
    }
    let bytes = response.bytes().await.map_err(|error| format!("读取日历失败：{error}"))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("日历服务器返回的内容太大。".into());
    }
    Ok(String::from_utf8_lossy(&super::ungzip(&bytes)?).to_string())
}

fn utc_stamp(at: DateTime<Utc>) -> String {
    at.format("%Y%m%dT%H%M%SZ").to_string()
}

pub(super) fn calendar_query(from: DateTime<Utc>, to: DateTime<Utc>) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="{}" end="{}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>"#,
        utc_stamp(from),
        utc_stamp(to)
    )
}

const PROPFIND_DISCOVERY: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:current-user-principal/><c:calendar-home-set/><d:resourcetype/></d:prop>
</d:propfind>"#;

/// The calendars an address leads to: itself when it is one, else those of its account.
async fn calendars(client: &reqwest::Client, account: &Account<'_>, base: &Url) -> Result<Vec<Url>, String> {
    let answer = parse_multistatus(&dav(client, account, "PROPFIND", base, "0", PROPFIND_DISCOVERY.into()).await?);
    if answer.iter().any(|response| response.is_calendar) {
        return Ok(vec![base.clone()]);
    }
    let join = |href: &str| base.join(href).map_err(|error| error.to_string());
    let home = match answer.iter().find_map(|response| response.home.clone()) {
        Some(home) => join(&home)?,
        None => {
            let principal = answer.iter().find_map(|response| response.principal.clone()).ok_or("这个地址不是日历，也找不到账号下的日历。")?;
            let principal = join(&principal)?;
            let found = parse_multistatus(&dav(client, account, "PROPFIND", &principal, "0", PROPFIND_DISCOVERY.into()).await?);
            join(&found.iter().find_map(|response| response.home.clone()).ok_or("找不到账号下的日历。")?)?
        }
    };
    let listed = parse_multistatus(&dav(client, account, "PROPFIND", &home, "1", PROPFIND_DISCOVERY.into()).await?);
    listed.iter().filter(|response| response.is_calendar).take(MAX_CALENDARS).map(|response| join(&response.href)).collect()
}

/// The iCalendar texts of the events in `[from, to)` in every calendar the account leads to.
pub(super) async fn fetch(account: &Account<'_>, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<String>, String> {
    let base = Url::parse(account.url.trim()).map_err(|_| "日历地址无效。".to_string())?;
    if base.scheme() != "https" {
        return Err("日历地址要以 https:// 开头。".into());
    }
    let client = client()?;
    let mut texts = Vec::new();
    for calendar in calendars(&client, account, &base).await? {
        let answer = dav(&client, account, "REPORT", &calendar, "1", calendar_query(from, to)).await?;
        texts.extend(parse_multistatus(&answer).into_iter().flat_map(|response| response.calendar_data));
    }
    Ok(texts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multistatus_answers_are_read_whatever_the_prefixes() {
        let report = r#"<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response><D:href>/cal/a.ics</D:href><D:propstat><D:prop>
    <C:calendar-data>BEGIN:VCALENDAR&#13;
SUMMARY:A &amp; B
END:VCALENDAR</C:calendar-data></D:prop></D:propstat></D:response>
  <D:response><D:href>/cal/b.ics</D:href><D:propstat><D:prop><C:calendar-data><![CDATA[BEGIN:VCALENDAR]]></C:calendar-data></D:prop></D:propstat></D:response>
</D:multistatus>"#;
        let responses = parse_multistatus(report);
        assert_eq!(responses.len(), 2);
        assert_eq!(responses[0].href, "/cal/a.ics");
        assert_eq!(responses[0].calendar_data, ["BEGIN:VCALENDAR\r\nSUMMARY:A & B\nEND:VCALENDAR"]);
        assert_eq!(responses[1].calendar_data, ["BEGIN:VCALENDAR"]);

        let discovery = r#"<multistatus xmlns="DAV:"><response><href>/</href><propstat><prop>
          <current-user-principal><href>/principals/u1/</href></current-user-principal>
          <calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href>/calendars/u1/</href></calendar-home-set>
          <resourcetype><collection/></resourcetype></prop></propstat></response></multistatus>"#;
        let found = parse_multistatus(discovery);
        assert_eq!((found[0].principal.as_deref(), found[0].home.as_deref(), found[0].is_calendar), (Some("/principals/u1/"), Some("/calendars/u1/"), false));

        let listing = r#"<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
          <d:response><d:href>/calendars/u1/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
          <d:response><d:href>/calendars/u1/work/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype></d:prop></d:propstat></d:response>
        </d:multistatus>"#;
        let calendars: Vec<String> = parse_multistatus(listing).into_iter().filter(|response| response.is_calendar).map(|response| response.href).collect();
        assert_eq!(calendars, ["/calendars/u1/work/"]);
        assert!(parse_multistatus("not xml").is_empty());
    }

    #[test]
    fn the_query_asks_for_events_in_the_range() {
        use chrono::TimeZone;
        let query = calendar_query(Utc.with_ymd_and_hms(2026, 11, 6, 16, 0, 0).unwrap(), Utc.with_ymd_and_hms(2026, 11, 8, 16, 0, 0).unwrap());
        assert!(query.contains(r#"<c:time-range start="20261106T160000Z" end="20261108T160000Z"/>"#));
    }
}
