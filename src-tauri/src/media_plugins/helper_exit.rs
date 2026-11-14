//! What the elevated plugin helper reports back. A process can hand its parent only an
//! exit code (plus, when both run as the same user, a report file), so each failure the
//! user can act on gets its own code, and the parent turns it back into a `PluginError`.

use std::{fs, io, path::{Path, PathBuf}};

use super::PluginError;

/// Prefix of the optional last helper argument naming the report file.
pub(super) const REPORT_ARG: &str = "--report=";

// Windows error codes that mean security software stepped in.
const ERROR_SHARING_VIOLATION: i32 = 32;
const ERROR_LOCK_VIOLATION: i32 = 33;
const ERROR_VIRUS_INFECTED: i32 = 225;
const ERROR_VIRUS_DELETED: i32 = 226;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum HelperFailure {
    /// Anything not listed below; also every code an older helper could return.
    Unknown = 1,
    InvalidArgs = 2,
    /// The NetEase folder cannot be seen from the elevated process: a mapped network
    /// drive or a `subst` drive exists only in the user's own logon session.
    TargetUnavailable = 3,
    InvalidTarget = 4,
    HashMismatch = 5,
    LoaderExists = 6,
    AccessDenied = 7,
    FileLocked = 8,
    VirusBlocked = 9,
    NeedsClose = 10,
}

impl HelperFailure {
    const ALL: [Self; 10] = [
        Self::Unknown, Self::InvalidArgs, Self::TargetUnavailable, Self::InvalidTarget,
        Self::HashMismatch, Self::LoaderExists, Self::AccessDenied, Self::FileLocked,
        Self::VirusBlocked, Self::NeedsClose,
    ];

    pub(super) fn code(self) -> i32 {
        self as i32
    }

    pub(super) fn from_code(code: u32) -> Self {
        Self::ALL.into_iter().find(|failure| failure.code() as u32 == code).unwrap_or(Self::Unknown)
    }

    pub(super) fn of_io(error: &io::Error) -> Self {
        match error.raw_os_error() {
            Some(ERROR_VIRUS_INFECTED | ERROR_VIRUS_DELETED) => Self::VirusBlocked,
            Some(ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION) => Self::FileLocked,
            _ if error.kind() == io::ErrorKind::PermissionDenied => Self::AccessDenied,
            _ => Self::Unknown,
        }
    }

    /// The error the parent shows, with the helper's own message when it could write one.
    pub(super) fn to_error(self, code: u32, report: Option<String>) -> PluginError {
        let detail = report.filter(|text| !text.trim().is_empty())
            .unwrap_or_else(|| format!("Plugin helper exited with {code}"));
        let kind = match self {
            Self::TargetUnavailable => "DriveUnavailable",
            Self::HashMismatch => "HashMismatch",
            Self::LoaderExists => "LoaderExists",
            Self::AccessDenied | Self::FileLocked | Self::VirusBlocked => "Blocked",
            Self::NeedsClose => "NeedsClose",
            Self::Unknown | Self::InvalidArgs | Self::InvalidTarget => "Io",
        };
        PluginError::new(kind, detail)
    }
}

/// A failure inside the helper: the code it exits with and the message it reports.
#[derive(Debug)]
pub(super) struct HelperError {
    pub(super) failure: HelperFailure,
    pub(super) detail: String,
}

impl HelperError {
    pub(super) fn new(failure: HelperFailure, detail: impl Into<String>) -> Self {
        Self { failure, detail: detail.into() }
    }
}

impl From<io::Error> for HelperError {
    fn from(error: io::Error) -> Self {
        Self::new(HelperFailure::of_io(&error), error.to_string())
    }
}

/// Splits the optional trailing `--report=<path>` off the helper arguments.
pub(super) fn split_report(args: &[String]) -> (&[String], Option<PathBuf>) {
    match args.split_last() {
        Some((last, rest)) if last.starts_with(REPORT_ARG) => {
            (rest, Some(PathBuf::from(&last[REPORT_ARG.len()..])).filter(|path| path.is_absolute()))
        }
        _ => (args, None),
    }
}

/// A fresh report path for one helper run, in the user's temp folder.
pub(super) fn report_path() -> PathBuf {
    std::env::temp_dir().join(format!("focusd-plugin-helper-{}.txt", unique_suffix()))
}

/// Reads and removes the report; `None` when the helper wrote none, for example
/// because the administrator who approved it is another user.
pub(super) fn take_report(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok();
    let _ = fs::remove_file(path);
    text.map(|text| text.chars().take(500).collect())
}

/// Process id and time, unique enough for temp names within this machine.
pub(super) fn unique_suffix() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_nanos());
    format!("{}-{nanos}", std::process::id())
}
