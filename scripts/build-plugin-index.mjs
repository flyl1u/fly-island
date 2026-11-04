// Packs every plugin under plugins/examples into plugins/packages/<id>-<version>.zip
// and writes plugins/index.json, the plugin market index the app downloads.
// Usage: pnpm plugins:index. Design: docs/architecture/plugins.md (P4).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

/** Where the app downloads the index and packages from: the fork's dev branch, not main or upstream (for now). */
export const MARKET_BASE_URL = "https://raw.githubusercontent.com/TixXin/fly-island/dev/plugins";
export const INDEX_VERSION = 1;
const SOURCE_DIRS = ["plugins/examples"];
const PACKAGES_DIR = "plugins/packages";
const INDEX_PATH = "plugins/index.json";
const MANIFEST = "focusd-plugin.json";
// 1980-01-01 00:00 in DOS format, so the same files always give the same bytes.
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
// Text files are packed with LF line ends, so a CRLF checkout (core.autocrlf) packs the same bytes.
const TEXT_EXTENSIONS = new Set([".json", ".js", ".mjs", ".cjs", ".ps1", ".md", ".txt", ".css", ".html"]);

export function readPackedFile(full) {
  const data = readFileSync(full);
  return TEXT_EXTENSIONS.has(path.extname(full).toLowerCase())
    ? Buffer.from(data.toString("utf8").replaceAll("\r\n", "\n"), "utf8")
    : data;
}

/** Files under `dir` as [zip path with '/', absolute path], sorted. */
export function listFiles(dir, prefix = "") {
  return readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      const zipPath = prefix + entry.name;
      return entry.isDirectory() ? listFiles(full, `${zipPath}/`) : [[zipPath, full]];
    });
}

/** A deflate zip of `files` ([name, Buffer][]) with fixed timestamps. */
export function createZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const header = (signature, size) => {
      const buffer = Buffer.alloc(size);
      buffer.writeUInt32LE(signature, 0);
      return buffer;
    };
    const local = header(0x04034b50, 30);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, compressed);

    const central = header(0x02014b50, 46);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

export const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

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
    download: { url: `${MARKET_BASE_URL}/packages/${fileName}`, sha256: sha256(zip), size: zip.length },
  };
}

/** Packs one plugin folder: its manifest, package file name and zip bytes. */
export function packPlugin(dir) {
  const manifest = JSON.parse(readFileSync(path.join(dir, MANIFEST), "utf8"));
  if (path.basename(dir) !== manifest.id) {
    throw new Error(`${dir}: the folder must be named after the plugin id "${manifest.id}".`);
  }
  const files = listFiles(dir).map(([name, full]) => [name, readPackedFile(full)]);
  return { manifest, fileName: `${manifest.id}-${manifest.version}.zip`, zip: createZip(files) };
}

export function buildIndex(root) {
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
  writeFileSync(path.join(root, INDEX_PATH), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const index = buildIndex(root);
  console.log(`Wrote ${INDEX_PATH} with ${index.plugins.length} plugin(s).`);
}
