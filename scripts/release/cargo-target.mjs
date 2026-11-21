// Where Cargo writes the app's build output. An explicit CARGO_TARGET_DIR wins; otherwise Cargo
// itself is asked, so a `target-dir` in a user's ~/.cargo/config.toml is honoured instead of
// guessing src-tauri/target (2026-11-20: v3.2.9's release looked there and found nothing).
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export function cargoTargetDir(manifest = "src-tauri/Cargo.toml") {
  if (process.env.CARGO_TARGET_DIR) return resolve(process.env.CARGO_TARGET_DIR);
  const result = spawnSync("cargo", ["metadata", "--format-version", "1", "--no-deps", "--manifest-path", manifest], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status === 0) {
    try {
      const directory = JSON.parse(result.stdout).target_directory;
      if (directory) return resolve(directory);
    } catch { /* fall through to the default */ }
  }
  return resolve("src-tauri/target");
}
