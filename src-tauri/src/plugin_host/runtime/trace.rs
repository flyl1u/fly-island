//! The raw JSON-RPC lines of development plugins (dev.rs), for the
//! "Developer" area of the settings page.

use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

use super::{update_entry, Context};

const TRACE_LINES: usize = 200;
const MAX_TRACE_CHARS: usize = 2000;

/// Mirrored by `PluginTraceEntry` in src/features/plugin-dev/api.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceEntry {
    /// Milliseconds since 1970.
    pub at: u64,
    /// From the island to the plugin.
    pub outgoing: bool,
    pub text: String,
}

/// Keeps a line sent to (`outgoing`) or received from a development plugin.
pub(super) fn record(context: &Context, outgoing: bool, line: &str) {
    if !context.spec.dev {
        return;
    }
    let at = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX));
    let mut text: String = line.chars().take(MAX_TRACE_CHARS).collect();
    if text.len() < line.len() {
        text.push('…');
    }
    update_entry(context, |info| {
        info.trace.push_back(TraceEntry { at, outgoing, text });
        while info.trace.len() > TRACE_LINES {
            info.trace.pop_front();
        }
    });
}
