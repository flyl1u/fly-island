// `fly-island-plugin`: validate, pack, dev, test and publish FocuSD Island plugins.
// Guide: docs/plugins/README.md (快速开始) in the FocuSD Island repository.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runDev } from "./dev.mjs";
import { createZip, packageFiles, sha256 } from "./pack.mjs";
import { runTests } from "./run-tests.mjs";
import { report, validatePlugin } from "./validate.mjs";

export { report };

/** Packages are written here (inside the plugin folder; never packed themselves). */
export const PACKAGE_OUT_DIR = ".package";

const HELP = `Usage: fly-island-plugin <command> [plugin folder] [options]

Commands:
  validate   Check focusd-plugin.json and the folder like the island and the market do
  pack       Write <id>-<version>.zip (the same bytes every time) to .package/
             --out <folder>   write it somewhere else
  dev        Load the folder into the running island in development mode, restart
             the plugin when a file changes and print its log (needs the island's
             local API and Settings > Plugins > Developer > development mode)
             --config <file>  local-api.json of another island data folder
  test       Run test/*.test.mjs with node --test, or without tests start the plugin
             under the mock host, run each command, open each view and check it
             answered without errors
  publish    Pack and print how to publish a release (the market's index repository
             takes submissions from P11 on)
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

/** Validates and writes the package; returns { file, zip, manifest } or null when invalid. */
export function pack(dir, outDir = path.join(dir, PACKAGE_OUT_DIR), out = console) {
  const result = validatePlugin(dir);
  if (!report(result, out)) return null;
  const zip = createZip(packageFiles(dir));
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${result.manifest.id}-${result.manifest.version}.zip`);
  writeFileSync(file, zip);
  out.log(`wrote ${path.relative(process.cwd(), file) || file} (${zip.length} bytes, sha256 ${sha256(zip)})`);
  return { file, zip, manifest: result.manifest };
}

function publish(dir) {
  const packed = pack(dir);
  if (!packed) return 1;
  const { id, version } = packed.manifest;
  console.log(`
To publish ${id} ${version}:
  1. Commit and push the plugin, then create a GitHub release tagged ${version}
     (or v${version}) in your repository and attach ${path.basename(packed.file)}.
     With the GitHub CLI:  gh release create ${version} "${packed.file}"
     The workflow .github/workflows/release.yml made by create-fly-island-plugin
     does this when you push the tag.
  2. Until the market's index repository takes submissions, open an issue at
     https://github.com/TixXin/fly-island/issues with the repository and release link.
  Users can always install the zip by unpacking it into a folder named ${id}
  in the island's plugins folder (Settings > Plugins > Open plugins folder).`);
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, dir, options } = parseArgs(argv);
  switch (command) {
    case "validate":
      return report(validatePlugin(dir)) ? 0 : 1;
    case "pack":
      return pack(dir, typeof options.out === "string" ? path.resolve(options.out) : undefined) ? 0 : 1;
    case "dev":
      return runDev(dir, { config: typeof options.config === "string" ? options.config : undefined });
    case "test":
      return runTests(dir);
    case "publish":
      return publish(dir);
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

