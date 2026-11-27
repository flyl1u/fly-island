//! The engine: one poll round and the schema 2 snapshots it answers with.
mod card;
pub(crate) mod clock;
pub(crate) mod platform;
mod presentation;
mod redact;
mod round;
mod scheduler;

use crate::providers::registry::{readers, Reader, Source, READER_COUNT};
use platform::{read_hid, Platform};
use round::Round;
use scheduler::Limits;
use serde_json::{json, Value};
use std::panic::catch_unwind;
use std::sync::Arc;

#[derive(Clone, Copy, Default)]
pub(crate) struct Request {
    pub request_id: u64,
    pub generation: u64,
}

/// The fields every answer has. Device packs are not supported.
pub(crate) fn envelope(request_id: u64, generation: u64, complete: bool) -> Value {
    json!({
        "schema": 2,
        "requestId": request_id,
        "generation": generation,
        "complete": complete,
        "ready": true,
        "devicePack": {
            "version": null, "entries": 0, "disabled": [], "rejected": [], "loaded": false
        },
        "devices": [],
        "nativeMousePresent": null,
        "unadapted": [],
        "suppressed": [],
        "providerCount": READER_COUNT,
        "errors": [],
        "importedProviderCount": 0,
        "health": [],
        "checkedAtUtc": clock::utc_now(),
        "packageSmoke": false,
    })
}

fn new_round(request: Request) -> Round {
    let mut round = Round::default();
    round.request_id = request.request_id;
    round.generation = request.generation;
    round.provider_count = READER_COUNT;
    round
}

/// Reads every present device once.
pub(crate) fn poll(
    platform: &Arc<dyn Platform>,
    request: Request,
    progress: Option<&mut dyn FnMut(Value)>,
) -> Value {
    let all: Vec<Reader> = readers().collect();
    let round = new_round(request);
    scheduler::run(platform, &all, round, Limits::default(), progress).snapshot(true)
}

/// A bus on which nothing can be opened.
struct NoBus;

impl crate::hid::HidBus for NoBus {
    fn open(&self, _path: &str) -> crate::hid::HidResult<Box<dyn crate::hid::HidDevice>> {
        Err(crate::hid::HidError(
            "no hardware in the package check".into(),
        ))
    }
}

/// The package self-test: every reader runs against an empty inventory. No
/// hardware, Windows device list or radio is touched.
pub(crate) fn package_smoke(request: Request) -> Value {
    let imported = readers()
        .filter(|reader| match reader.source {
            Source::Vendors(_, poll) | Source::AnyDevice(poll) => {
                catch_unwind(|| read_hid(poll, &[], &NoBus).statuses.is_empty()).unwrap_or(false)
            }
            Source::XInput | Source::Bluetooth => true,
        })
        .count();
    let mut snapshot = envelope(request.request_id, request.generation, true);
    snapshot["nativeMousePresent"] = json!(false);
    snapshot["packageSmoke"] = json!(true);
    snapshot["importedProviderCount"] = json!(imported);
    if imported == READER_COUNT {
        snapshot["health"] =
            json!([{"provider": "package", "state": "ok", "scope": "provider", "deviceCount": 0}]);
    } else {
        snapshot["errors"] = json!(["package: invalid_response"]);
    }
    snapshot
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_package_check_initialises_every_reader() {
        let snapshot = package_smoke(Request {
            request_id: 7,
            generation: 2,
        });
        assert_eq!(snapshot["schema"], 2);
        assert_eq!(snapshot["requestId"], 7);
        assert_eq!(snapshot["providerCount"], 48);
        assert_eq!(snapshot["importedProviderCount"], 48);
        assert_eq!(snapshot["errors"], json!([]));
        assert_eq!(snapshot["health"][0]["provider"], "package");
    }
}
