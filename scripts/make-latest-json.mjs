// Builds the updater manifest that the app downloads from
// https://github.com/flyl1u/fly-island/releases/latest/download/latest.json
//
// Usage: node scripts/make-latest-json.mjs [--notes-file docs/releases/vX.Y.Z.md]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "flyl1u/fly-island";
const CONFIG = "src-tauri/tauri.conf.json";
const BUNDLE_DIR = "src-tauri/target/release/bundle/nsis";

const args = process.argv.slice(2);
const notesFlag = args.indexOf("--notes-file");
const notesFile = notesFlag >= 0 ? args[notesFlag + 1] : `docs/releases/v${readVersion()}.md`;

function readVersion() {
  return JSON.parse(readFileSync(CONFIG, "utf8")).version;
}

const version = readVersion();

if (!existsSync(BUNDLE_DIR)) {
  console.error(`Missing ${BUNDLE_DIR}. Run "pnpm tauri build" first.`);
  process.exit(1);
}

const suffix = `_${version}_x64-setup.exe`;
const installer = readdirSync(BUNDLE_DIR).find((name) => name.endsWith(suffix));

if (!installer) {
  console.error(`Missing NSIS installer ending with ${suffix} in ${BUNDLE_DIR}.`);
  process.exit(1);
}

const signaturePath = join(BUNDLE_DIR, `${installer}.sig`);
if (!existsSync(signaturePath)) {
  console.error(`Missing ${signaturePath}. Build with TAURI_SIGNING_PRIVATE_KEY set so updater artifacts are signed.`);
  process.exit(1);
}

const notes = notesFile && existsSync(notesFile) ? readFileSync(notesFile, "utf8").trim() : "";

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(signaturePath, "utf8").trim(),
      url: `https://github.com/${REPO}/releases/download/v${version}/${installer}`,
    },
  },
};

const target = join(BUNDLE_DIR, "latest.json");
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${target}`);
console.log(`Upload these release assets:`);
console.log(`  ${join(BUNDLE_DIR, installer)}`);
console.log(`  ${signaturePath}`);
console.log(`  ${target}`);
