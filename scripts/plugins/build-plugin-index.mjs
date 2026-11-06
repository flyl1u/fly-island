// Packs every plugin under plugins/examples into plugins/packages/<id>-<version>.zip
// and writes plugins/index.json and its signature plugins/index.json.sig (see
// scripts/plugins/plugin-signing.mjs). Since the market moved to TixXin/focusd-plugins,
// this index is only read by islands released before the move, which trust only
// the older key; the official plugins' submissions in focusd-plugins point their
// "package" at the zips written here. Each zip also gets <zip>.sig, the official
// author signature (docs/architecture/plugin-author-signing.md), made with the key
// whose public half is plugins/author-key.json. Market
// details that are not in the manifest (publisher, repository, categories) come
// from plugins/market/<id>.json, as they will in the index repository. It also
// signs plugins/revoked.json, the list of versions taken off the market.
// Usage: pnpm plugins:index. Design: docs/architecture/plugins.md (P4),
// docs/architecture/plugin-platform.md (P11).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZip, listFiles, packFolder, readPackedFile, sha256 } from "../../packages/fly-island-plugin/src/pack.mjs";
import { loadSigningKey, publicKeyOf, writePackageSignature } from "../../packages/fly-island-plugin/src/sign.mjs";
import { loadPrivateKey, signIndex } from "./plugin-signing.mjs";

export { createZip, listFiles, readPackedFile, sha256 };

/** Where the official packages (and, for islands before focusd-plugins, the index) are downloaded from: the fork's main branch (dev is kept at the same commit for older builds). */
export const MARKET_BASE_URL = "https://raw.githubusercontent.com/TixXin/fly-island/main/plugins";
export const INDEX_VERSION = 1;
const SOURCE_DIRS = ["plugins/examples"];
const PACKAGES_DIR = "plugins/packages";
const INDEX_PATH = "plugins/index.json";
const SIGNATURE_PATH = "plugins/index.json.sig";
export const REVOKED_PATH = "plugins/revoked.json";
const MARKET_DIR = "plugins/market";
const MANIFEST = "focusd-plugin.json";
/** The official author key's public half ({ keyId, publicKey }), listed in the official submissions in TixXin/focusd-plugins. */
export const AUTHOR_KEY_PATH = "plugins/author-key.json";
/** Where the official author key is kept (DPAPI-protected, like the index key); FOCUSD_PLUGIN_AUTHOR_KEY (PEM) overrides it. */
export const AUTHOR_KEY_FILE = path.join(homedir(), ".tauri", "fly-island", "plugin-author-signing.key");
/** The island's own publisher (OFFICIAL_PUBLISHER in src-tauri/src/plugin_host/market.rs). */
export const OFFICIAL_PUBLISHER = "TixXin";
/** Categories the market page offers (MARKET_CATEGORIES in src/features/plugins/api.ts). */
export const CATEGORIES = ["productivity", "todos", "developer", "media", "messages", "information", "utilities"];

/** What the plugin needs installed, like runtime_requirement in src-tauri/src/plugin_host/manifest.rs. */
export function runtimeRequirement(runtime) {
  if (runtime?.type !== "process") return "none";
  const extension = path.extname(runtime.command ?? "").toLowerCase();
  if (extension === ".exe") return "exe";
  if (extension === ".ps1") return "powershell";
  if ([".js", ".mjs", ".cjs"].includes(extension)) return "node";
  return "none";
}

/** plugins/market/<id>.json ({ publisher?, repo?, categories?, preRelease? }) with defaults filled in. */
export function marketDetails(root, id) {
  const file = path.join(root, MARKET_DIR, `${id}.json`);
  const details = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const unknown = (details.categories ?? []).filter((name) => !CATEGORIES.includes(name));
  if (unknown.length > 0) throw new Error(`${MARKET_DIR}/${id}.json: unknown categories ${unknown.join(", ")}.`);
  return {
    publisher: details.publisher ?? OFFICIAL_PUBLISHER,
    ...(details.repo ? { repo: details.repo } : {}),
    categories: [...new Set(details.categories ?? [])],
    ...(details.preRelease === true ? { preRelease: true } : {}),
  };
}

/** Longest README.md / CHANGELOG.md text carried in the index (MAX_MARKET_TEXT in market.rs). */
export const MAX_MARKET_TEXT = 16 * 1024;

/** A Markdown file cut to `limit` characters at a line break, or null when missing or empty. */
export function marketText(text, limit = MAX_MARKET_TEXT) {
  const trimmed = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!trimmed) return null;
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit);
  const lineEnd = cut.lastIndexOf("\n");
  return `${(lineEnd > 0 ? cut.slice(0, lineEnd) : cut).trimEnd()}\n\n…`;
}

/**
 * README.md and CHANGELOG.md from the plugin folder, shown on the market page. They
 * are signed with the index; list them in .focusdignore to keep them out of the zip.
 */
export function marketTexts(dir) {
  const read = (name) => {
    const file = path.join(dir, name);
    return existsSync(file) ? marketText(readFileSync(file, "utf8")) : null;
  };
  const readme = read("README.md");
  const changelog = read("CHANGELOG.md");
  return { ...(readme ? { readme } : {}), ...(changelog ? { changelog } : {}) };
}

/** Like the island's manifest.rs: version 2 only, without the ones in `permissions`. */
export function optionalPermissions(manifest) {
  if ((manifest.apiVersion ?? 1) < 2) return [];
  const required = new Set(manifest.permissions ?? []);
  return [...new Set(manifest.optionalPermissions ?? [])].filter((name) => !required.has(name)).sort();
}

/** The index entry for a plugin manifest, its package and its market details. */
export function indexEntry(manifest, fileName, zip, details = {}) {
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
    // Asked for while the plugin runs (permissions.request); only written when there are any.
    ...(optionalPermissions(manifest).length > 0 ? { optionalPermissions: optionalPermissions(manifest) } : {}),
    runtime: runtimeRequirement(manifest.runtime),
    // Pages with the plugin's own HTML (P8); the market shows them as custom UI.
    ...((manifest.contributes?.views ?? []).some((view) => view.template === "webview") ? { webview: true } : {}),
    ...details,
    download: { url: `${MARKET_BASE_URL}/packages/${fileName}`, sha256: sha256(zip), size: zip.length },
  };
}

/** Packs one plugin folder: its manifest, package file name and zip bytes. */
export const packPlugin = packFolder;

/** The official author key, checked against plugins/author-key.json so a wrong key is not used. */
export function loadAuthorKey(root, env = process.env) {
  const key = loadSigningKey({ file: AUTHOR_KEY_FILE, env, envName: "FOCUSD_PLUGIN_AUTHOR_KEY" });
  const expected = JSON.parse(readFileSync(path.join(root, AUTHOR_KEY_PATH), "utf8"));
  if (publicKeyOf(key).keyId !== expected.keyId) throw new Error(`The official author key is not ${expected.keyId} (${AUTHOR_KEY_PATH}).`);
  return key;
}

/** Writes <zip>.sig for every package that has none; the key is loaded only when one is missing. */
export function signPackages(root, loadKey = () => loadAuthorKey(root)) {
  const packagesDir = path.join(root, PACKAGES_DIR);
  let key = null;
  for (const name of readdirSync(packagesDir).filter((file) => file.endsWith(".zip")).sort()) {
    const file = path.join(packagesDir, name);
    if (existsSync(`${file}.sig`)) continue;
    const [id, version] = name.slice(0, -".zip".length).split(/-(?=\d+\.\d+\.\d+)/);
    key ??= loadKey();
    writePackageSignature(file, id, version, readFileSync(file), key);
  }
}

/** Writes the index and its signature (see scripts/plugins/plugin-signing.mjs), and signs new packages. */
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
      entries.push(indexEntry(manifest, fileName, zip, { ...marketDetails(root, manifest.id), ...marketTexts(dir) }));
    }
  }
  entries.sort((left, right) => left.id.localeCompare(right.id));
  const index = { version: INDEX_VERSION, plugins: entries };
  const text = `${JSON.stringify(index, null, 2)}\n`;
  writeFileSync(path.join(root, INDEX_PATH), text);
  writeFileSync(path.join(root, SIGNATURE_PATH), `${JSON.stringify(signIndex(text, privateKey), null, 2)}\n`);
  signRevoked(root, privateKey);
  signPackages(root);
  return index;
}

/** Checks and signs plugins/revoked.json, creating an empty list the first time. */
export function signRevoked(root, privateKey) {
  const file = path.join(root, REVOKED_PATH);
  if (!existsSync(file)) writeFileSync(file, `${JSON.stringify({ version: 1, revoked: [] }, null, 2)}\n`);
  const text = readFileSync(file, "utf8");
  const list = JSON.parse(text);
  if (list.version !== 1 || !Array.isArray(list.revoked)) throw new Error(`${REVOKED_PATH} must be { "version": 1, "revoked": [...] }.`);
  writeFileSync(`${file}.sig`, `${JSON.stringify(signIndex(text, privateKey), null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const index = buildIndex(root);
  console.log(`Wrote ${INDEX_PATH} with ${index.plugins.length} plugin(s).`);
}
