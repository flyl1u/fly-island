use rusqlite::{Connection, OpenFlags, OptionalExtension};
use std::{path::Path, time::Duration};
use windows::{
    core::{GUID, HSTRING},
    Data::Xml::Dom::{XmlDocument, XmlLoadSettings},
    UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    },
};

use super::ToastId;
use crate::win32::{self, com::WinRtApartment};

const TELEGRAM_ACTIVATOR: GUID = GUID::from_u128(0xf11932d3_6110_4bbc_9b02_b2ec07a1bd19);

fn activate_then_dismiss(
    activate: impl FnOnce() -> Result<(), String>,
    dismiss: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    activate()?;
    dismiss().map_err(|error| {
        format!("Telegram opened, but Windows could not dismiss its notification: {error}")
    })
}

pub(super) fn open(id: &ToastId) -> Result<(), String> {
    let _apartment = WinRtApartment::multithreaded().map_err(|error| error.to_string())?;
    let listener = UserNotificationListener::Current().map_err(|error| error.to_string())?;
    let allowed = listener
        .GetAccessStatus()
        .map_err(|error| error.to_string())?;
    if allowed != UserNotificationListenerAccessStatus::Allowed {
        return Err("Windows notification access is required.".into());
    }

    // UserNotification exposes only visual data. Look up the original target for this
    // exact toast, using the current user's Windows notification store in read-only mode.
    let path = win32::known_folder::local_app_data()
        .ok_or("Windows notification storage is unavailable.")?
        .join("Microsoft/Windows/Notifications/wpndatabase.db");
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Cannot open Windows notification storage: {error}"))?;
    db.busy_timeout(Duration::from_millis(400))
        .map_err(|error| error.to_string())?;
    let payload = toast_payload(&db, id)
        .map_err(|error| format!("Cannot read the Telegram notification target: {error}"))?
        .ok_or("This Telegram notification is no longer available in Windows.")?;
    let xml = XmlDocument::new().map_err(|error| error.to_string())?;
    let settings = XmlLoadSettings::new().map_err(|error| error.to_string())?;
    settings
        .SetProhibitDtd(true)
        .map_err(|error| error.to_string())?;
    settings
        .SetResolveExternals(false)
        .map_err(|error| error.to_string())?;
    let payload = std::str::from_utf8(&payload).map_err(|error| error.to_string())?;
    xml.LoadXmlWithSettings(&HSTRING::from(payload), &settings)
        .map_err(|error| error.to_string())?;
    let root = xml.DocumentElement().map_err(|error| error.to_string())?;
    if root.TagName().map_err(|error| error.to_string())? != "toast" {
        return Err("Unrecognized Telegram notification.".into());
    }
    let arguments = root
        .GetAttribute(&HSTRING::from("launch"))
        .map_err(|error| error.to_string())?
        .to_string_lossy();
    let pid = activation_pid(&arguments)
        .ok_or("This notification has no supported Telegram conversation target.")?;
    if !win32::process::image_path(pid)
        .as_deref()
        .and_then(|path| Path::new(path).file_name())
        .is_some_and(|name| name.eq_ignore_ascii_case("Telegram.exe"))
    {
        return Err(
            "The Telegram instance that sent this notification is no longer running.".into(),
        );
    }
    win32::window::allow_set_foreground_window(pid);
    activate_then_dismiss(
        || {
            win32::toast_activation::activate(&TELEGRAM_ACTIVATOR, &id.app_id, &arguments)
                .map_err(|error| format!("Telegram could not activate the conversation: {error}"))
        },
        || {
            listener
                .RemoveNotification(id.windows_id)
                .map_err(|error| error.to_string())
        },
    )
}

fn toast_payload(db: &Connection, id: &ToastId) -> rusqlite::Result<Option<Vec<u8>>> {
    db.query_row(
        "SELECT CAST(n.Payload AS BLOB)
         FROM Notification AS n
         JOIN NotificationHandler AS h ON h.RecordId = n.HandlerId
         WHERE n.Id = ?1 AND n.ArrivalTime = ?2 AND h.PrimaryId = ?3 COLLATE NOCASE
           AND n.Type = 'toast' AND length(n.Payload) <= 65536",
        (id.windows_id, id.ticks, &id.app_id),
        |row| row.get(0),
    )
    .optional()
}

fn activation_pid(arguments: &str) -> Option<u32> {
    let mut fields = std::collections::HashMap::new();
    for argument in arguments.strip_prefix("action=open&")?.split('&') {
        let (name, value) = argument.split_once('=')?;
        if !matches!(
            name,
            "pid" | "session" | "peer" | "msg" | "topic" | "monoforumpeer"
        ) || value.is_empty()
            || !value.bytes().all(|byte| byte.is_ascii_digit())
            || fields.insert(name, value.parse::<u64>().ok()?).is_some()
        {
            return None;
        }
    }
    for name in ["session", "peer", "msg"] {
        if *fields.get(name)? == 0 {
            return None;
        }
    }
    u32::try_from(*fields.get("pid")?)
        .ok()
        .filter(|pid| *pid > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_unambiguous_numeric_telegram_open_actions() {
        let args = "action=open&pid=123&session=7&peer=8&topic=0&monoforumpeer=0&msg=9";
        assert_eq!(activation_pid(args), Some(123));
        for invalid in [
            args.replace("action=open", "action=reply"),
            args.replace("peer=8", "peer=0"),
            args.replace("msg=9", "msg=9&pid=124"),
            args.replace("msg=9", "msg=9&url=https://example.com"),
            args.replace("session=7", "session="),
        ] {
            assert_eq!(activation_pid(&invalid), None);
        }
    }

    #[test]
    fn only_reads_the_exact_notification_and_source() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE Notification(Id INTEGER, ArrivalTime INTEGER, HandlerId INTEGER, Payload BLOB, Type TEXT);
             CREATE TABLE NotificationHandler(RecordId INTEGER, PrimaryId TEXT);
             INSERT INTO NotificationHandler VALUES(1, 'Telegram.TelegramDesktop'), (2, 'Other');
             INSERT INTO Notification VALUES(7, 10, 2, 'other', 'toast'), (7, 20, 1, 'target', 'toast');",
        ).unwrap();
        let mut id = ToastId {
            app_id: "Telegram.TelegramDesktop".into(),
            windows_id: 7,
            ticks: 20,
        };
        assert_eq!(toast_payload(&db, &id).unwrap(), Some(b"target".to_vec()));
        id.ticks = 10;
        assert_eq!(toast_payload(&db, &id).unwrap(), None);
    }

    #[test]
    fn removes_windows_notification_only_after_successful_activation() {
        let mut dismissed = false;
        let result = activate_then_dismiss(
            || Err("activation failed".into()),
            || {
                dismissed = true;
                Ok(())
            },
        );
        assert_eq!(result, Err("activation failed".into()));
        assert!(!dismissed);

        let result = activate_then_dismiss(
            || Ok(()),
            || {
                dismissed = true;
                Err("removal failed".into())
            },
        );
        assert_eq!(
            result,
            Err(
                "Telegram opened, but Windows could not dismiss its notification: removal failed"
                    .into()
            )
        );
        assert!(dismissed);
    }
}
