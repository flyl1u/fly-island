// `fly-island-plugin`: validate, pack, dev, test and publish FocuSD Island plugins.
// Guide: docs/plugins/README.md (快速开始) in the FocuSD Island repository.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runDev } from "./dev.mjs";
import { createZip, MANIFEST_FILE, packageFiles, sha256 } from "./pack.mjs";
import { rotateKey } from "./rotate.mjs";
import { runTests } from "./run-tests.mjs";
import { DEFAULT_KEY_FILE, generateSigningKey, loadSigningKey, parsePackageName, writePackageSignature } from "./sign.mjs";
import { report, validatePlugin } from "./validate.mjs";

export { report };

/** Packages are written here (inside the plugin folder; never packed themselves). */
export const PACKAGE_OUT_DIR = ".package";

const HELP = `Usage: fly-island-plugin <command> [plugin folder] [options]

Commands:
  validate   Check focusd-plugin.json and the folder like the island and the market do
  pack       Write <id>-<version>.zip (the same bytes every time) to .package/
             --out <folder>   write it somewhere else
             --sign           also write <id>-<version>.zip.sig with your signing key
  keygen     Create your signing key (once) and print the public key to list in the
             market submission ("signingKeys"). Back the key up: updates signed by a
             new key need every user's confirmation.
  sign <zip> Write <zip>.sig for a package made by pack (named <id>-<version>.zip)
             --key <file>     the key file (default ~/.fly-island-plugin/signing.key;
                              or set FLY_ISLAND_PLUGIN_SIGNING_KEY to the PEM text)
  keys rotate [folder]
             Replace your signing key while you still have the old one: the old key
             vouches for the new one, so users' islands accept it without asking.
             Prints the new entry for "signingKeys"; the old key file is kept as
             <key file>.<old keyId>.old.
             --ids <a,b>      plugin ids the key signs (default: the folder's plugin)
             --new-key <file> where the new key goes (needed with the key in the env)
  dev       Load the folder into the running island in development mode, restart
             the plugin when a file changes and print its log (needs the island's
             local API and Settings > Plugins > Developer > development mode)
             --config <file>  local-api.json of another island data folder
  test       Run test/*.test.mjs with node --test, or without tests start the plugin
             under the mock host, run each command, open each view and check it
             answered without errors
  publish    Pack (--sign to sign it too) and print how to publish a release and
             submit it to the plugin market (TixXin/focusd-plugins)
  help       Show this text

The folder defaults to the current one.`;

/** Splits argv into a command, positional arguments and --options. */
export function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const positional = [];
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = rest[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options[name] = next;
        index += 1;
      } else {
        options[name] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { command, dir: path.resolve(positional[0] ?? "."), options };
}

/** Validates and writes the package (and its signature with `signWith`); returns { file, zip, manifest } or null when invalid. */
export function pack(dir, outDir = path.join(dir, PACKAGE_OUT_DIR), out = console, signWith = null) {
  const result = validatePlugin(dir);
  if (!report(result, out)) return null;
  const zip = createZip(packageFiles(dir));
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${result.manifest.id}-${result.manifest.version}.zip`);
  writeFileSync(file, zip);
  out.log(`wrote ${path.relative(process.cwd(), file) || file} (${zip.length} bytes, sha256 ${sha256(zip)})`);
  if (signWith) {
    const { keyId } = writePackageSignature(file, result.manifest.id, result.manifest.version, zip, signWith);
    out.log(`signed it with key ${keyId}: attach ${path.basename(file)}.sig to the release too`);
  }
  return { file, zip, manifest: result.manifest };
}

const keyFile = (options) => (typeof options.key === "string" ? path.resolve(options.key) : DEFAULT_KEY_FILE);

function keygen(options) {
  const file = keyFile(options);
  const key = generateSigningKey(file);
  console.log(`Saved your signing key to ${file}${process.platform === "win32" ? " (encrypted for this Windows user)" : ""}.
Back it up somewhere safe. Add this to "signingKeys" in your market submission:
${JSON.stringify(key, null, 2)}`);
  return 0;
}

function signZip(zipFile, options) {
  const name = parsePackageName(zipFile);
  if (!name) {
    console.error(`${zipFile} is not named <id>-<version>.zip; sign the file that pack wrote.`);
    return 1;
  }
  const { keyId } = writePackageSignature(zipFile, name.id, name.version, readFileSync(zipFile), loadSigningKey({ file: keyFile(options) }));
  console.log(`wrote ${zipFile}.sig (key ${keyId})`);
  return 0;
}

function rotate(dir, options) {
  const ids = typeof options.ids === "string"
    ? options.ids.split(",").map((id) => id.trim()).filter(Boolean)
    : [JSON.parse(readFileSync(path.join(dir, MANIFEST_FILE), "utf8")).id];
  const result = rotateKey({ file: keyFile(options), newFile: typeof options["new-key"] === "string" ? path.resolve(options["new-key"]) : undefined, ids });
  console.log(`New signing key in ${result.newFile}${result.retiredFile ? `; the old key ${result.oldKeyId} is kept as ${result.retiredFile}` : ""}.
Back the new key up. In each plugin's market submission (focusd-plugins plugins/<id>.json),
add its entry to "signingKeys" next to the old key and open a pull request:`);
  for (const { id, key } of result.endorsed) console.log(`\n${id}:\n${JSON.stringify(key, null, 2)}`);
  console.log(`\nSign new releases with the new key (pack --sign). Keep the old key listed until users have updated.`);
  return 0;
}

function publish(dir, signWith) {
  const packed = pack(dir, undefined, console, signWith);
  if (!packed) return 1;
  const { id, version } = packed.manifest;
  const assets = signWith ? `"${packed.file}" "${packed.file}.sig"` : `"${packed.file}"`;
  console.log(`
To publish ${id} ${version}:
  1. Commit and push the plugin, then create a GitHub release tagged ${version}
     (or v${version}) in your repository and attach ${path.basename(packed.file)}${signWith ? " and its .sig" : ""}.
     With the GitHub CLI:  gh release create ${version} ${assets}
     The workflow .github/workflows/release.yml made by create-fly-island-plugin
     does this when you push the tag (sign the zip yourself and upload the .sig).
  2. First release only: open a pull request at https://github.com/TixXin/focusd-plugins
     that adds plugins/${id}.json (see its CONTRIBUTING.md). After that, new releases
     reach the market within an hour.${signWith ? "" : `
  Only signed plugins update by themselves on users' islands: see "keygen" and --sign.`}
  Users can always install the zip by unpacking it into a folder named ${id}
  in the island's plugins folder (Settings > Plugins > Open plugins folder).`);
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, dir, options } = parseArgs(argv);
  switch (command) {
    case "validate":
      return report(validatePlugin(dir)) ? 0 : 1;
    case "pack": {
      const signWith = options.sign ? loadSigningKey({ file: keyFile(options) }) : null;
      return pack(dir, typeof options.out === "string" ? path.resolve(options.out) : undefined, console, signWith) ? 0 : 1;
    }
    case "keygen":
      return keygen(options);
    case "sign":
      return signZip(dir, options);
    case "keys": {
      // "keys rotate [folder] [options]": the rest parses like a command of its own.
      const sub = parseArgs(argv.slice(1));
      if (sub.command !== "rotate") {
        console.error(`Unknown "keys" command "${sub.command}"; try "keys rotate".`);
        return 1;
      }
      return rotate(sub.dir, sub.options);
    }
    case "dev":
      return runDev(dir, { config: typeof options.config === "string" ? options.config : undefined });
    case "test":
      return runTests(dir);
    case "publish":
      return publish(dir, options.sign ? loadSigningKey({ file: keyFile(options) }) : null);
    case "--version":
    case "version":
      console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
      return 0;
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command "${command}".\n\n${HELP}`);
      return 1;
  }
}

