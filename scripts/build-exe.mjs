// `pnpm build:exe`: the release exe (pnpm tauri build --no-bundle) into the main
// checkout's src-tauri/target/release, which the desktop shortcut runs, from the
// main checkout or any lane, without asking the user to close the island.
//
// Windows refuses to overwrite a running exe but lets it be renamed, so a
// running focusd-island.exe is moved aside to focusd-island.exe.old-<time>; the
// island keeps running from it, and the next start runs the new build. Moved
// files are deleted by later builds once nothing runs them. If the build fails,
// the old exe goes back in place.
//
// One build at a time across lanes (a lock file in target/release), and a
// successful build points the desktop shortcut at the new exe.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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

/** A lock held this long is from a build that died without cleaning up. */
const LOCK_MAX_AGE_MS = 60 * 60 * 1000;
const LOCK_WAIT_MS = 5000;

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** Whether a lock holder `{ pid, since }` still counts: its process runs and it is under an hour old. */
export function lockHeld(holder, now = Date.now(), alive = processAlive) {
  return Boolean(holder) && alive(holder.pid) && now - holder.since < LOCK_MAX_AGE_MS;
}

/**
 * Waits until no other build (another lane's session) holds `lock`, then takes it; two builds
 * writing target/release at once would race over the exe being moved aside.
 */
function takeLock(lock) {
  mkdirSync(path.dirname(lock), { recursive: true });
  for (let waited = false; ; waited = true) {
    try {
      writeFileSync(lock, JSON.stringify({ pid: process.pid, since: Date.now() }), { flag: "wx" });
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    let holder = null;
    try {
      holder = JSON.parse(readFileSync(lock, "utf8"));
    } catch {
      // Being written right now; look again shortly.
    }
    if (holder && !lockHeld(holder)) {
      unlinkSync(lock);
      continue;
    }
    if (!waited) console.log(`[build:exe] another build (pid ${holder?.pid ?? "?"}) is running; waiting for it to finish`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_WAIT_MS);
  }
}

/** The PowerShell that points the desktop's island shortcuts at `exe`, or creates fly-island.lnk. */
export function shortcutScript(exe) {
  const quoted = `'${exe.replace(/'/g, "''")}'`;
  return [
    `$exe = ${quoted}`,
    "$desk = [Environment]::GetFolderPath('Desktop')",
    "$shell = New-Object -ComObject WScript.Shell",
    "$links = @(Get-ChildItem $desk -Filter *.lnk | Where-Object { $_.Name -match 'focusd|fly-island' -or $shell.CreateShortcut($_.FullName).TargetPath -match 'focusd-island\\.exe$' })",
    "if ($links.Count -eq 0) { $links = @([pscustomobject]@{ FullName = Join-Path $desk 'fly-island.lnk' }) }",
    "foreach ($link in $links) {",
    "  $s = $shell.CreateShortcut($link.FullName); $s.TargetPath = $exe; $s.WorkingDirectory = Split-Path $exe; $s.IconLocation = \"$exe,0\"; $s.Save()",
    "  $check = $shell.CreateShortcut($link.FullName)",
    "  if ($check.TargetPath -ne $exe -or -not (Test-Path $check.TargetPath)) { Write-Error \"$($link.FullName) does not point at $exe\"; exit 1 }",
    "  Write-Output (Split-Path $link.FullName -Leaf)",
    "}",
  ].join("\n");
}

/** Points the desktop shortcut at the new build (AGENTS.md, "本机更新与桌面快捷方式"); Windows only. */
function syncShortcut(exe) {
  if (process.platform !== "win32" || process.env.FOCUSD_SKIP_SHORTCUT === "1") return;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", shortcutScript(exe)], { encoding: "utf8" });
  if (result.status === 0) console.log(`[build:exe] desktop shortcut → ${exe}: ${result.stdout.trim().split(/\r?\n/).join(", ")}`);
  else console.error(`[build:exe] could not update the desktop shortcut: ${result.stderr.trim()}`);
}

function main() {
  const releaseDir = targetDir(mainCheckout(), "release");
  const lock = path.join(releaseDir, ".build-exe.lock");
  takeLock(lock);
  try {
    return build(releaseDir);
  } finally {
    rmSync(lock, { force: true });
  }
}

function build(releaseDir) {
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
  syncShortcut(exe);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
