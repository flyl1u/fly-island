// The merge queue's checkCommand: the pre-push hook runs it on every land.
// `pnpm check` always; `cargo test` too when the landing touches files the
// Rust build or its tests read. The release build stays a manual step
// (AGENTS.md), because the queue is locked while this runs.
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** src-tauri itself, the scripts it embeds with include_str!, and plugins/ (keys, index and schema its tests read). */
const RUST_INPUTS = ["src-tauri/", "scripts/focusd-agent-", "plugins/"];

export function needsRust(files) {
  return files.some((file) => RUST_INPUTS.some((prefix) => file.startsWith(prefix)));
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** null when unknown, so everything runs. land fetched and rebased onto origin/main just before pushing. */
function changedFiles() {
  try {
    return git(["diff", "--name-only", "origin/main...HEAD"]).split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

function run(command, env = {}) {
  console.log(`[land-check] ${command}`);
  return spawnSync(command, { shell: true, stdio: "inherit", env: { ...process.env, ...env } }).status ?? 1;
}

function main() {
  const files = changedFiles();
  if (run("pnpm check") !== 0) return 1;
  if (files && !needsRust(files)) {
    console.log("[land-check] no Rust inputs changed; skipping cargo test");
    return 0;
  }
  // Lanes share the main checkout's build cache, as AGENTS.md suggests.
  const mainCheckout = path.dirname(path.resolve(git(["rev-parse", "--git-common-dir"])));
  const target = process.env.CARGO_TARGET_DIR ?? path.join(mainCheckout, "src-tauri", "target");
  return run("cargo test --manifest-path src-tauri/Cargo.toml", { CARGO_TARGET_DIR: target });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
