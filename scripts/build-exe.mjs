// `pnpm build:exe`: the release exe (pnpm tauri build --no-bundle) into the main
// checkout's src-tauri/target/release, which the desktop shortcut runs, from the
// main checkout or any lane, without asking the user to close the island.
//
// Windows refuses to overwrite a running exe but lets it be renamed, so a
// running focusd-island.exe is moved aside to focusd-island.exe.old-<time>; the
// island keeps running from it, and the next start runs the new build. Moved
// files are deleted by later builds once nothing runs them. If the build fails,
// the old exe goes back in place.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mainCheckout, targetDir } from "./build-dirs.mjs";

export const EXE_NAME = "focusd-island.exe";
const OLD_PREFIX = `${EXE_NAME}.old-`;

/** True when the file exists and something (a running island) keeps it from being written. */
export function isInUse(file) {
  if (!existsSync(file)) return false;
  try {
    closeSync(openSync(file, "r+"));
    return false;
  } catch (error) {
    return error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES";
  }
}

/** Deletes exes moved aside by earlier builds that nothing runs any more; returns how many are left. */
export function removeOldExes(dir) {
  let left = 0;
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    if (!name.startsWith(OLD_PREFIX)) continue;
    try {
      unlinkSync(path.join(dir, name));
    } catch {
      left += 1;
    }
  }
  return left;
}

/** Moves a running exe aside; returns where it went, or null when it was not in use. */
export function moveAsideIfRunning(exe, now = new Date()) {
  if (!isInUse(exe)) return null;
  const aside = `${exe}.old-${now.toISOString().replace(/[-:.TZ]/g, "")}`;
  renameSync(exe, aside);
  return aside;
}

function main() {
  const releaseDir = targetDir(mainCheckout(), "release");
  const exe = path.join(releaseDir, EXE_NAME);
  removeOldExes(releaseDir);
  const aside = moveAsideIfRunning(exe);
  if (aside) console.log(`[build:exe] the island is running; moved its exe aside to ${path.basename(aside)}. It keeps running; the next start uses the new build.`);
  const status = spawnSync("pnpm tauri build --no-bundle", {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, CARGO_TARGET_DIR: targetDir(mainCheckout()) },
  }).status;
  if (status !== 0 || !existsSync(exe)) {
    if (aside && !existsSync(exe)) renameSync(aside, exe);
    console.error(`[build:exe] the build failed${aside ? "; the previous exe is back in place" : ""}.`);
    return 1;
  }
  const left = removeOldExes(releaseDir);
  console.log(`[build:exe] built ${exe}${left > 0 ? ` (${left} older exe still running, removed by a later build)` : ""}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
