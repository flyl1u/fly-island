// Packs every plugin under plugins/examples into plugins/packages/<id>-<version>.zip
// and writes plugins/index.json, the plugin market index the app downloads, and
// its signature plugins/index.json.sig (see scripts/plugin-signing.mjs).
// Usage: pnpm plugins:index. Design: docs/architecture/plugins.md (P4).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZip, listFiles, packFolder, readPackedFile, sha256 } from "../packages/fly-island-plugin/src/pack.mjs";
import { loadPrivateKey, signIndex } from "./plugin-signing.mjs";

export { createZip, listFiles, readPackedFile, sha256 };

/** Where the app downloads the index and packages from: the fork's dev branch, not main or upstream (for now). */
export const MARKET_BASE_URL = "https://raw.githubusercontent.com/TixXin/fly-island/dev/plugins";
export const INDEX_VERSION = 1;
const SOURCE_DIRS = ["plugins/examples"];
const PACKAGES_DIR = "plugins/packages";
const INDEX_PATH = "plugins/index.json";
const SIGNATURE_PATH = "plugins/index.json.sig";
const MANIFEST = "focusd-plugin.json";

/** What the plugin needs installed, like runtime_requirement in src-tauri/src/plugin_host/manifest.rs. */
export function runtimeRequirement(runtime) {
  if (runtime?.type !== "process") return "none";
  const extension = path.extname(runtime.command ?? "").toLowerCase();
  if (extension === ".exe") return "exe";
  if (extension === ".ps1") return "powershell";
  if ([".js", ".mjs", ".cjs"].includes(extension)) return "node";
  return "none";
}

/** The index entry for a plugin manifest and its package. */
export function indexEntry(manifest, fileName, zip) {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description ?? { "zh-CN": "", en: "" },
    version: manifest.version,
    apiVersion: manifest.apiVersion,
    ...(manifest.minAppVersion ? { minAppVersion: manifest.minAppVersion } : {}),
    author: manifest.author ?? "",
    homepage: manifest.homepage ?? "",
    permissions: [...new Set(manifest.permissions ?? [])].sort(),
    runtime: runtimeRequirement(manifest.runtime),
    download: { url: `${MARKET_BASE_URL}/packages/${fileName}`, sha256: sha256(zip), size: zip.length },
  };
}

/** Packs one plugin folder: its manifest, package file name and zip bytes. */
export const packPlugin = packFolder;

/** Writes the index and its signature (see scripts/plugin-signing.mjs). */
export function buildIndex(root, privateKey = loadPrivateKey()) {
  const packagesDir = path.join(root, PACKAGES_DIR);
  mkdirSync(packagesDir, { recursive: true });
  const entries = [];
  for (const source of SOURCE_DIRS) {
    const sourceDir = path.join(root, source);
    for (const name of readdirSync(sourceDir).sort()) {
      const dir = path.join(sourceDir, name);
      if (!statSync(dir).isDirectory()) continue;
      const { manifest, fileName, zip } = packPlugin(dir);
      const target = path.join(packagesDir, fileName);
      // A published version never changes: users who installed it have this hash.
      if (existsSync(target) && !readFileSync(target).equals(zip)) {
        throw new Error(`${fileName} already exists with different contents; raise "version" in ${source}/${name}/${MANIFEST}.`);
      }
      writeFileSync(target, zip);
      entries.push(indexEntry(manifest, fileName, zip));
    }
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));
  const index = { version: INDEX_VERSION, plugins: entries };
  const text = `${JSON.stringify(index, null, 2)}\n`;
  writeFileSync(path.join(root, INDEX_PATH), text);
  writeFileSync(path.join(root, SIGNATURE_PATH), `${JSON.stringify(signIndex(text, privateKey), null, 2)}\n`);
  return index;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const index = buildIndex(root);
  console.log(`Wrote ${INDEX_PATH} with ${index.plugins.length} plugin(s).`);
}
