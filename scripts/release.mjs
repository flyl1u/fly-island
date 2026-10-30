// Builds, signs and publishes a release that in-app updates can pick up.
//
// Usage:
//   pnpm release [--base-url <url>] [--no-upload]
//
// Explicit CI environment (otherwise the Windows local signing config is used):
//   TAURI_SIGNING_PRIVATE_KEY           private key content (or its path)
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD  empty string when the key has no password
//   TAURI_UPDATER_PUBKEY                public key content, must match the private key
//
// The script refuses to run when the three version fields disagree, when the
// release notes file is missing, or when the working tree has uncommitted
// changes. Published versions are never overwritten.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { loadSigningEnvironment } from "./release-signing.mjs";

const CONFIG = "src-tauri/tauri.conf.json";
const OVERLAY = "src-tauri/tauri.release.conf.json";
const CARGO = "src-tauri/Cargo.toml";
const BUNDLE_DIR = "src-tauri/target/release/bundle/nsis";
const MSI_DIR = "src-tauri/target/release/bundle/msi";
const REPO = "flyl1u/fly-island";

const args = process.argv.slice(2);
const baseFlag = args.indexOf("--base-url");
const baseUrl = baseFlag >= 0 ? args[baseFlag + 1] : "";
const upload = !args.includes("--no-upload");

if (baseFlag >= 0 && (!baseUrl || !URL.canParse(baseUrl) || new URL(baseUrl).protocol !== "https:")) {
  fail("--base-url requires a valid HTTPS URL.");
}
try {
  Object.assign(process.env, loadSigningEnvironment());
} catch (error) {
  fail(error.message);
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
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
  const dirty = run("git", ["status", "--porcelain"], { capture: true }).stdout;
  if (dirty.trim()) fail(`Working tree has uncommitted changes:\n${dirty}`);
  const auth = run("gh", ["auth", "status"], { capture: true, allowFailure: true });
  if (auth.status !== 0) fail("gh is not authenticated. Run `gh auth login` first.");
  const existing = run("gh", ["release", "view", tag, "--repo", REPO], { capture: true, allowFailure: true });
  if (existing.status === 0) fail(`Release ${tag} already exists. Bump the version instead of replacing published update packages.`);
}

run("node", ["scripts/prepare-release-config.mjs"]);
run("pnpm", ["tauri", "build", "--ci", "--config", OVERLAY, "--bundles", "nsis,msi"]);

const latestArgs = ["scripts/make-latest-json.mjs", "--notes-file", notesFile];
if (baseUrl) latestArgs.push("--base-url", baseUrl);
run("node", latestArgs);

const installer = readdirSync(BUNDLE_DIR).find((name) => name.endsWith(`_${version}_x64-setup.exe`));
if (!installer) fail(`Missing installer in ${BUNDLE_DIR}.`);
const msi = readdirSync(MSI_DIR).find((name) => name.endsWith(`_${version}_x64_en-US.msi`));
if (!msi) fail(`Missing MSI installer in ${MSI_DIR}.`);
const installers = [`${BUNDLE_DIR}/${installer}`, `${MSI_DIR}/${msi}`];
const checksumPath = `${BUNDLE_DIR}/SHA256SUMS.txt`;
writeFileSync(checksumPath, installers.map((path) =>
  `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${path.split("/").pop()}`,
).join("\n") + "\n");

if (!upload) {
  console.log(`\n✓ Built v${version}. NSIS: ${BUNDLE_DIR}; MSI: ${MSI_DIR} (--no-upload).`);
  process.exit(0);
}

const assets = [...installers, ...installers.map((path) => `${path}.sig`), `${BUNDLE_DIR}/latest.json`, checksumPath];
const revision = run("git", ["rev-parse", "HEAD"], { capture: true }).stdout.trim();
run("gh", ["release", "create", tag, "--repo", REPO, "--target", revision, "--draft", "--title", tag, "--notes-file", notesFile, ...assets]);
// An unpublished draft's tag may not exist yet, so fetch its assets by release ID.
const releaseId = run("gh", ["release", "view", tag, "--repo", REPO, "--json", "databaseId", "--jq", ".databaseId"], { capture: true }).stdout.trim();
const remote = JSON.parse(run("gh", ["api", `repos/${REPO}/releases/${releaseId}`], { capture: true }).stdout);
for (const path of assets) {
  const name = path.split("/").pop();
  const asset = remote.assets.find((entry) => entry.name === name);
  const digest = `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
  if (!asset || asset.state !== "uploaded" || asset.digest !== digest) {
    fail(`Uploaded asset verification failed for ${name}. The release remains a draft.`);
  }
}
run("gh", ["release", "edit", tag, "--repo", REPO, "--draft=false", "--latest"]);

console.log(`\n✓ Published ${tag}.`);
