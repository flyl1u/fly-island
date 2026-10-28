// Builds, signs and publishes a release that in-app updates can pick up.
//
// Usage:
//   pnpm release [--base-url <url>] [--no-upload]
//
// Required environment:
//   TAURI_SIGNING_PRIVATE_KEY           private key content (or its path)
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  empty string when the key has no password
//   TAURI_UPDATER_PUBKEY                public key content, must match the private key
//
// The script refuses to run when the three version fields disagree, when the
// release notes file is missing, or when the working tree has uncommitted
// tracked changes.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const CONFIG = "src-tauri/tauri.conf.json";
const OVERLAY = "src-tauri/tauri.release.conf.json";
const CARGO = "src-tauri/Cargo.toml";
const BUNDLE_DIR = "src-tauri/target/release/bundle/nsis";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base-url");
const baseUrl = baseFlag >= 0 ? args[baseFlag + 1] : "";
const upload = !args.includes("--no-upload");

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.error) fail(`${command} failed: ${result.error.message}`);
  if (!options.allowFailure && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

const version = JSON.parse(readFileSync(CONFIG, "utf8")).version;
const pkgVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const cargoVersion = readFileSync(CARGO, "utf8").match(/^version\s*=\s*"([^"]+)"/m)?.[1];

if (!cargoVersion) fail(`Could not read the version from ${CARGO}.`);
if (pkgVersion !== version || cargoVersion !== version) {
  fail(
    `Version mismatch: package.json=${pkgVersion}, Cargo.toml=${cargoVersion}, tauri.conf.json=${version}.\n` +
      "Bump all three to the same value before releasing.",
  );
}

const tag = `v${version}`;
const notesFile = `docs/releases/${tag}.md`;
if (!existsSync(notesFile)) fail(`Missing release notes: ${notesFile}`);

if (!process.env.TAURI_UPDATER_PUBKEY?.trim()) {
  fail("TAURI_UPDATER_PUBKEY is not set; the built app would reject every update.");
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
  fail("TAURI_SIGNING_PRIVATE_KEY is not set; cannot sign the updater artifacts.");
}
if (process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
  fail(
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set. Use an empty string for keys without a password,\n" +
      'otherwise the build waits for interactive input: $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""',
  );
}

if (upload) {
  const dirty = run("git", ["status", "--porcelain", "--untracked-files=no"], { capture: true }).stdout;
  if (dirty.trim()) fail(`Working tree has uncommitted changes:\n${dirty}`);
  const auth = run("gh", ["auth", "status"], { capture: true, allowFailure: true });
  if (auth.status !== 0) fail("gh is not authenticated. Run `gh auth login` first.");
}

run("node", ["scripts/prepare-release-config.mjs"]);
run("pnpm", ["tauri", "build", "--config", OVERLAY, "--bundles", "nsis"]);

const latestArgs = ["scripts/make-latest-json.mjs", "--notes-file", notesFile];
if (baseUrl) latestArgs.push("--base-url", baseUrl);
run("node", latestArgs);

if (!upload) {
  console.log(`\n✓ Built v${version}. Upload ${BUNDLE_DIR} artifacts by hand (--no-upload).`);
  process.exit(0);
}

const installer = readdirSync(BUNDLE_DIR).find((name) => name.endsWith(`_${version}_x64-setup.exe`));
if (!installer) fail(`Missing installer in ${BUNDLE_DIR}.`);

const assets = [`${BUNDLE_DIR}/${installer}`, `${BUNDLE_DIR}/${installer}.sig`, `${BUNDLE_DIR}/latest.json`];

const exists = run("gh", ["release", "view", tag], { capture: true, allowFailure: true }).status === 0;
if (exists) {
  console.log(`\nRelease ${tag} exists, uploading assets with --clobber.`);
  run("gh", ["release", "upload", tag, ...assets, "--clobber"]);
} else {
  run("gh", ["release", "create", tag, "--title", tag, "--notes-file", notesFile, ...assets]);
}

console.log(`\n✓ Published ${tag}.`);
