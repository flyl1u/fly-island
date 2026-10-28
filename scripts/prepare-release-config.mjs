// Writes the release-only Tauri config overlay that turns on updater signing.
//
// The base src-tauri/tauri.conf.json ships without a public key and without
// updater artifacts, so a normal `pnpm tauri build` works on any machine.
// Release builds pass this overlay with `tauri build --config <file>`.
//
// Usage:
//   TAURI_UPDATER_PUBKEY="$(cat ~/.tauri/fly-island.key.pub)" \
//   TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/fly-island.key)" \
//   node scripts/prepare-release-config.mjs
//
// Optional:
//   TAURI_UPDATER_ENDPOINTS  comma or newline separated list, overrides the
//                            endpoints from tauri.conf.json (self-hosting, forks)
import { readFileSync, writeFileSync } from "node:fs";

const TARGET = "src-tauri/tauri.release.conf.json";

const pubkey = (process.env.TAURI_UPDATER_PUBKEY ?? "").trim();
if (!pubkey) {
  console.error(
    "TAURI_UPDATER_PUBKEY is missing.\n" +
      "Generate a key pair once with `pnpm tauri signer generate -w <path>`, then export the public key:\n" +
      "  TAURI_UPDATER_PUBKEY=$(cat <path>.pub)",
  );
  process.exit(1);
}

const overlay = {
  plugins: {
    updater: {
      pubkey,
    },
  },
  bundle: {
    createUpdaterArtifacts: true,
  },
};

const endpoints = (process.env.TAURI_UPDATER_ENDPOINTS ?? "")
  .split(/[\n,]/)
  .map((entry) => entry.trim())
  .filter(Boolean);

if (endpoints.length > 0) {
  // tauri-plugin-updater refuses to start on a non-https endpoint, so catch it
  // here instead of shipping a build that panics on launch.
  const insecure = endpoints.filter((entry) => !entry.startsWith("https://"));
  if (insecure.length > 0) {
    console.error(`Updater endpoints must use https:\n  ${insecure.join("\n  ")}`);
    process.exit(1);
  }
  overlay.plugins.updater.endpoints = endpoints;
}

const base = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const version = process.env.TAURI_RELEASE_VERSION?.trim();
if (version) {
  overlay.version = version;
}

writeFileSync(TARGET, `${JSON.stringify(overlay, null, 2)}\n`);
console.log(`Wrote ${TARGET} for v${version ?? base.version}`);
if (!endpoints.length) {
  console.log("Endpoints: inherited from src-tauri/tauri.conf.json");
}
