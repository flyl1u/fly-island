import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPO = "flyl1u/fly-island";
const TAG = "plugins-channel";
const BASE_URL = `https://github.com/${REPO}/releases/download/${TAG}`;
const OUTPUT = join(ROOT, "artifacts", "plugins");
const INDEX = "plugins-index.json";
const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function packageName({ id, version }) {
  if (typeof id !== "string" || !/^[a-z][a-z0-9.-]{0,99}$/.test(id) || id.includes("..") || typeof version !== "string" || !VERSION.test(version)) {
    throw new Error("Invalid plugin package ID or version.");
  }
  return `${id}-${version}-windows-x86_64.zip`;
}

function details(bytes) {
  return { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}

function sameBytes(expected, actual) {
  return expected.size === actual.size && expected.sha256 === actual.sha256;
}

export function verifyPluginBuild(entries, approved, readPackage) {
  if (!Array.isArray(entries) || !Array.isArray(approved) || approved.length === 0 || entries.length !== approved.length || new Set(approved).size !== approved.length) {
    throw new Error("The built index does not match the market selection.");
  }
  const seen = new Set();
  return entries.map((entry) => {
    const name = packageName(entry);
    if (!approved.includes(entry.id) || seen.has(entry.id) || entry.url !== `${BASE_URL}/${name}` || entry.apiVersion !== 1 || !VERSION.test(entry.minAppVersion)) {
      throw new Error(`Invalid market index entry for ${name}.`);
    }
    seen.add(entry.id);
    const actual = details(readPackage(name));
    if (actual.size === 0 || actual.size > MAX_PACKAGE_BYTES || !sameBytes(entry, actual)) {
      throw new Error(`ZIP SHA-256 or size mismatch: ${name}.`);
    }
    return { name, entry };
  });
}

export function selectPublishedPlugin(local, existing, previousEntry) {
  if (!existing) return { ...local, upload: true };
  if (previousEntry && previousEntry.url === local.entry.url && sameBytes(previousEntry, existing)) {
    return { name: local.name, entry: previousEntry, upload: false };
  }
  if (sameBytes(local.entry, existing)) return { ...local, upload: false };
  throw new Error(`Existing asset ${local.name} cannot be verified against the old or new index. Bump the plugin version; ZIPs are never replaced.`);
}

function run(command, args, capture = false, allowNotFound = false) {
  const result = spawnSync(command, args, {
    cwd: ROOT, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", maxBuffer: MAX_PACKAGE_BYTES + 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status === 0) return result.stdout;
  const message = result.stderr?.toString().trim();
  if (allowNotFound && /\bHTTP 404\b/.test(message ?? "")) return null;
  throw new Error(`${command} ${args.slice(0, 2).join(" ")} failed${message ? `: ${message}` : ` (${result.status})`}.`);
}

function getRelease(allowNotFound = false) {
  const response = run("gh", ["api", `repos/${REPO}/releases/tags/${TAG}`], true, allowNotFound);
  return response === null ? null : JSON.parse(response);
}

function release(args, capture = false) {
  return run("gh", ["release", ...args, "--repo", REPO], capture);
}

function download(name) {
  return release(["download", TAG, "--pattern", name, "--output", "-"], true);
}

function assetDetails(asset) {
  if (/^sha256:[a-f\d]{64}$/.test(asset.digest ?? "")) return { sha256: asset.digest.slice(7), size: asset.size };
  return details(download(asset.name));
}

function printAssets(packages, index) {
  for (const { name, entry, upload } of packages) {
    console.log(`${entry.sha256}  ${name}  (${entry.size} bytes${upload === false ? ", retaining published ZIP" : ""})`);
  }
  const { sha256, size } = details(index);
  console.log(`${sha256}  ${INDEX}  (${size} bytes)`);
}

function publish(local, indexPath) {
  let remote = getRelease(true);
  if (!remote) {
    release(["create", TAG, "--prerelease", "--latest=false", "--title", "Fly Island Plugin Channel", "--notes", "Independent Fly Island plugin market assets."]);
    remote = getRelease();
  }
  if (remote.draft || !remote.prerelease) throw new Error(`${TAG} must be a published prerelease.`);
  const assets = new Map(remote.assets.map((asset) => [asset.name, asset]));
  const previousIndex = assets.has(INDEX) ? JSON.parse(download(INDEX)) : [];
  const packages = local.map((plugin) => {
    const asset = assets.get(plugin.name);
    const previousEntry = previousIndex.find(({ id, version }) => id === plugin.entry.id && version === plugin.entry.version);
    return selectPublishedPlugin(plugin, asset && assetDetails(asset), previousEntry);
  });
  const index = Buffer.from(`${JSON.stringify(packages.map(({ entry }) => entry), null, 2)}\n`);
  printAssets(packages, index);
  for (const { name, upload } of packages) {
    if (upload) release(["upload", TAG, join(OUTPUT, name)]);
  }
  const uploaded = new Map(getRelease().assets.map((asset) => [asset.name, asset]));
  for (const { name, entry } of packages) {
    if (!uploaded.has(name) || !sameBytes(entry, assetDetails(uploaded.get(name)))) throw new Error(`Remote ZIP verification failed: ${name}.`);
  }
  writeFileSync(indexPath, index);
  if (!assets.has(INDEX) || !index.equals(download(INDEX))) {
    release(["upload", TAG, indexPath, ...(assets.has(INDEX) ? ["--clobber"] : [])]);
  }
  if (!index.equals(download(INDEX))) throw new Error("Remote plugin index verification failed.");
  console.log(`Verified ${packages.length} packages and the remote ${INDEX}.`);
}

function main(args) {
  if (args.some((arg) => arg !== "--no-upload")) throw new Error("Usage: pnpm release:plugins [--no-upload]");
  run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/release/build-plugins.ps1", "-MarketOnly", "-BaseUrl", BASE_URL]);
  const indexPath = join(OUTPUT, INDEX);
  const index = readFileSync(indexPath);
  const approved = JSON.parse(readFileSync(join(ROOT, "plugins/market-packages.json"), "utf8"));
  const packages = verifyPluginBuild(JSON.parse(index), approved, (name) => readFileSync(join(OUTPUT, name)));
  if (args.includes("--no-upload")) {
    console.log(`Verified local artifacts for ${TAG} (--no-upload):`);
    printAssets(packages, index);
    return;
  }
  publish(packages, indexPath);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
