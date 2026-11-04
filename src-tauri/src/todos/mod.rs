//! Todos, the daily note and archives, kept by Rust in `todos.json` under the
//! app data folder (they used to live in the island window's localStorage).
//! Design and migration rules: docs/architecture/plugin-platform.md, P6.
//!
//! - model.rs: the data and its checks
//! - store.rs: atomic, read-back-checked writes of `todos.json`
// Wired to the island window, plugins and the local API in the next commits.
#![cfg_attr(not(test), expect(dead_code, reason = "used once the island window switches to todos.json"))]

mod model;
mod store;
#[cfg(test)]
mod tests;
