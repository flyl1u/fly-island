// Writes a new plugin folder from the chosen language and template.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nodeMain, nodeTest } from "./node-templates.mjs";
import { powershellMain } from "./powershell-templates.mjs";
import { focusdIgnore, gitIgnore, license, manifest, packageJson, readme, tsconfig, workflow } from "./project-files.mjs";

export const LANGUAGES = ["powershell", "typescript", "javascript"];
export const TEMPLATES = ["command", "list", "status", "blank"];
export const ID_PATTERN = /^[a-z0-9][a-z0-9.-]{2,63}$/;
const SDK_DIR = new URL("../sdk/", import.meta.url);

/** The SDK version new plugins depend on: this package's own version. */
export function sdkVersion() {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
}

/** Why `id` cannot be a plugin id, or null when it can. */
export function idProblem(id) {
  if (!ID_PATTERN.test(id) || id.includes("..")) return "3-64 lowercase letters, digits, '.' and '-', starting with a letter or digit";
  if (id.includes("focusd")) return "ids containing \"focusd\" are kept for the island's own plugins";
  return null;
}

/** Fills in defaults and checks the choices; throws with a readable message. */
export function normalizeOptions(input) {
  const language = input.language ?? "powershell";
  const template = input.template ?? "list";
  if (!LANGUAGES.includes(language)) throw new Error(`language must be one of ${LANGUAGES.join(", ")}`);
  if (!TEMPLATES.includes(template)) throw new Error(`template must be one of ${TEMPLATES.join(", ")}`);
  const author = (input.author ?? "").trim() || "me";
  const id = input.id ?? `${author.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}.my-plugin`;
  const problem = idProblem(id);
  if (problem) throw new Error(`The plugin id "${id}" is not valid: ${problem}.`);
  const en = (input.nameEn ?? "").trim() || "My plugin";
  return {
    language,
    template,
    author,
    id,
    name: { "zh-CN": (input.nameZh ?? "").trim() || en, en },
    homepage: input.homepage ?? "",
    sdkVersion: input.sdkVersion ?? sdkVersion(),
    dir: path.resolve(input.dir ?? id),
  };
}

/** Repository-relative file name -> contents for a new plugin. */
export function pluginFiles(options) {
  const files = new Map([
    ["focusd-plugin.json", `${JSON.stringify(manifest(options), null, 2)}\n`],
    [".focusdignore", focusdIgnore(options)],
    [".gitignore", gitIgnore(options)],
    ["README.md", readme(options)],
    ["LICENSE", license(options)],
    [".github/workflows/plugin.yml", workflow(options)],
  ]);
  if (options.language === "powershell") {
    files.set("main.ps1", powershellMain(options));
  } else {
    files.set(options.language === "typescript" ? "src/main.mts" : "main.mjs", nodeMain(options));
    files.set("package.json", packageJson(options));
    files.set("test/plugin.test.mjs", nodeTest(options));
    if (options.language === "typescript") files.set("tsconfig.json", tsconfig());
  }
  return files;
}

/** The SDK files a plugin carries in lib/, so it needs nothing installed to run. */
function sdkFiles(language) {
  return language === "powershell" ? ["focusd.ps1"] : ["focusd.mjs", "focusd.d.mts", "protocol.d.mts"];
}

/** Writes the plugin folder; refuses a folder that exists and is not empty. Returns the written paths. */
export function scaffold(input) {
  const options = normalizeOptions(input);
  if (existsSync(options.dir) && readdirSync(options.dir).length > 0) {
    throw new Error(`${options.dir} is not empty.`);
  }
  const written = [];
  for (const [name, text] of pluginFiles(options)) {
    const target = path.join(options.dir, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
    written.push(name);
  }
  mkdirSync(path.join(options.dir, "lib"), { recursive: true });
  for (const name of sdkFiles(options.language)) {
    copyFileSync(new URL(name, SDK_DIR), path.join(options.dir, "lib", name));
    written.push(`lib/${name}`);
  }
  return { options, written: written.sort() };
}
