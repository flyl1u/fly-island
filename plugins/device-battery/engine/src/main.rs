//! Device battery reader engine of the Fly Island plugin. It answers `poll`
//! commands on standard input with schema 2 snapshots on standard output.
//!
//! Ported from the reader engine of MyFinder's battery plugin (AGPL-3.0-only); see
//! ../README.md and ../THIRD_PARTY_NOTICES.md.
mod command;
mod engine;
mod hid;
mod providers;
mod status;
mod win32;

use command::{Command, MAX_LINE_BYTES};
use engine::platform::{Platform, SystemPlatform};
use serde_json::Value;
use std::io::{self, BufRead, Read, Write};
use std::sync::Arc;

/// `false` once the host stopped listening.
fn emit(answer: &Value) -> bool {
    let mut output = io::stdout().lock();
    writeln!(output, "{answer}").is_ok() && output.flush().is_ok()
}

/// Arguments this engine does not know are ignored: the host starts it with the
/// interpreter arguments of the engine it replaced.
struct Options {
    package_smoke: bool,
    once: bool,
}

fn options(arguments: impl Iterator<Item = String>) -> Options {
    let arguments: Vec<String> = arguments.collect();
    let has = |flag: &str| arguments.iter().any(|argument| argument == flag);
    Options {
        package_smoke: has("--package-smoke"),
        once: has("--once"),
    }
}

fn answer_poll(
    platform: &Arc<dyn Platform>,
    smoke: bool,
    request: engine::Request,
    mut progress: Option<&mut dyn FnMut(Value)>,
) -> Value {
    if smoke {
        engine::package_smoke(request)
    } else {
        engine::poll(platform, request, progress.take())
    }
}

/// One command line of at most `MAX_LINE_BYTES`; `None` ends the session.
fn read_line(input: &mut impl BufRead) -> Option<Vec<u8>> {
    let mut line = Vec::new();
    let limit = MAX_LINE_BYTES as u64 + 1;
    let read = input.take(limit).read_until(b'\n', &mut line).ok()?;
    (read > 0 && read <= MAX_LINE_BYTES).then_some(line)
}

fn serve(platform: &Arc<dyn Platform>, smoke: bool) {
    let mut input = io::stdin().lock();
    while let Some(line) = read_line(&mut input) {
        let command = std::str::from_utf8(&line).map_or(Command::Invalid, command::parse);
        let answer = match command {
            Command::Exit => break,
            Command::Ignored => continue,
            Command::Invalid => {
                command::failure(0, 0, "Battery query did not complete", "invalid_request")
            }
            Command::SetDpi(id, generation) => command::failure(
                id,
                generation,
                "DPI setting is not supported",
                "unsupported_command",
            ),
            Command::Ready(id, generation) => engine::envelope(id, generation, true),
            Command::Poll(id, generation) => {
                let mut partial = |snapshot: Value| {
                    emit(&snapshot);
                };
                let request = command::request(id, generation);
                answer_poll(platform, smoke, request, Some(&mut partial))
            }
        };
        if !emit(&answer) {
            break;
        }
    }
}

fn main() {
    // Panic messages may name devices; a failed reader is reported in the snapshot.
    std::panic::set_hook(Box::new(|_| {}));
    let options = options(std::env::args().skip(1));
    let platform: Arc<dyn Platform> = Arc::new(SystemPlatform::new());
    if options.once {
        let request = engine::Request::default();
        emit(&answer_poll(
            &platform,
            options.package_smoke,
            request,
            None,
        ));
    } else {
        serve(&platform, options.package_smoke);
    }
}
