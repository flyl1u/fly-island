// `fly-island-plugin validate`: the manifest against plugins/schema/manifest.schema.json,
// plus the rules a schema cannot express and the island would refuse at install
// time, and warnings for likely mistakes (unused or missing permissions).
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isIgnored, loadIgnore } from "./ignore.mjs";
import { validateSchema } from "./json-schema.mjs";
import { MANIFEST_FILE, listFiles } from "./pack.mjs";
import { eventPermissions, methodPermissions, protocol } from "./schema.mjs";

/** The market refuses larger packages. */
export const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const SOURCE_EXTENSIONS = new Set([".ps1", ".psm1", ".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]);
const SKIPPED_DIRS = new Set(["node_modules", ".git"]);
/** The SDK files list every method; they say nothing about what the plugin uses. */
const SDK_FILES = /(^|\/)(focusd\.(mjs|ps1|d\.mts)|protocol\.d\.mts|FlyIsland\.Plugin\.psm1)$/;
/** SDK helpers whose names differ from the method they call. */
const HELPER_METHODS = [
  [/\bnotify\s*\(/, "island.notify"],
  [/Show-FocusdNotification\b/i, "island.notify"],
  [/\bnote\.append\s*\(/, "note.set"],
  [/(Get|Set|Remove)-FocusdSecret\b/i, "secrets.get"],
];
const V2_ONLY = ["activationEvents", "contributes.views", "contributes.statusItems", "contributes.menus"];

const withoutBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
const get = (object, dotted) => dotted.split(".").reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), object);

function sourceTexts(dir) {
  return listFiles(dir)
    .filter(([name]) => !name.split("/").some((part) => SKIPPED_DIRS.has(part)))
    .filter(([name]) => SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase()) && !SDK_FILES.test(name))
    .map(([, full]) => readFileSync(full, "utf8"));
}

/** Permissions the plugin's code seems to need, from the method and event names it mentions. */
export function permissionsUsed(texts) {
  const used = new Set();
  const mentions = (name) => {
    // Also matches SDK helpers named like the method: plugin.todos.list().
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${name.replaceAll(".", "\\.")}($|[^A-Za-z0-9_])`);
    return texts.some((text) => pattern.test(text));
  };
  for (const [name, permission] of [...methodPermissions(), ...eventPermissions()]) {
    if (permission && mentions(name)) used.add(permission);
  }
  for (const [pattern, method] of HELPER_METHODS) {
    const permission = methodPermissions().get(method);
    if (permission && texts.some((text) => pattern.test(text))) used.add(permission);
  }
  return used;
}

function checkContributions(manifest, errors, warnings) {
  const contributes = manifest.contributes ?? {};
  const unique = (list, key, what) => {
    const seen = new Set();
    for (const item of list ?? []) {
      if (seen.has(item?.[key])) errors.push(`${what} "${item[key]}" is listed twice.`);
      seen.add(item?.[key]);
    }
    return seen;
  };
  const commands = unique(contributes.commands, "id", "Command");
  const views = unique(contributes.views, "id", "View");
  unique(contributes.statusItems, "id", "Status item");
  unique(contributes.settings, "key", "Setting");
  for (const menu of ["todo/context", "clipboard/context", "shelf/context", "message/context"]) {
    for (const entry of contributes.menus?.[menu] ?? []) {
      if (!commands.has(entry.command)) errors.push(`The ${menu} menu names "${entry.command}", which is not in contributes.commands.`);
    }
  }
  for (const event of manifest.activationEvents ?? []) {
    const [kind, value] = event.split(":");
    if (kind === "onCommand" && !commands.has(value)) errors.push(`${event}: there is no command "${value}".`);
    if (kind === "onView" && !views.has(value)) errors.push(`${event}: there is no view "${value}".`);
    if (kind === "onSchedule" && (Number(value) < 5 || Number(value) > 1440)) errors.push(`${event}: the interval must be 5 to 1440 minutes.`);
    if (kind === "onEvent") {
      const permission = eventPermissions().get(value);
      if (permission === undefined) errors.push(`${event}: there is no event "${value}".`);
      else if (permission && !(manifest.permissions ?? []).includes(permission)) errors.push(`${event} needs the permission ${permission}.`);
    }
    if (kind === "onStartup") warnings.push("onStartup keeps the plugin running all the time; the market asks why it needs that.");
  }
  if (manifest.apiVersion === 1) {
    for (const field of V2_ONLY) {
      if (get(manifest, field) !== undefined) warnings.push(`${field} is ignored for apiVersion 1; use apiVersion 2.`);
    }
    if ((contributes.commands ?? []).some((command) => command.keybinding || command.when)) {
      warnings.push("Command keybinding and when are ignored for apiVersion 1.");
    }
  }
}

/** Webview views need an entry page that exists; other templates take neither entry nor height. */
function checkWebviews(dir, manifest, errors) {
  for (const view of manifest.contributes?.views ?? []) {
    if (view?.template !== "webview") {
      if (view?.entry !== undefined || view?.height !== undefined) errors.push(`View "${view.id}": entry and height are only for the webview template.`);
      continue;
    }
    if (typeof view.entry !== "string") {
      errors.push(`View "${view.id}" needs an entry: the .html page inside the plugin folder.`);
      continue;
    }
    const full = path.join(dir, view.entry);
    if (!existsSync(full) || !statSync(full).isFile()) errors.push(`View "${view.id}": the page "${view.entry}" does not exist.`);
  }
}

function checkRuntime(dir, manifest, rules, errors) {
  const runtime = manifest.runtime;
  if (runtime?.type !== "process" || typeof runtime.command !== "string") return;
  const command = runtime.command.replaceAll("\\", "/");
  if (path.isAbsolute(runtime.command) || command.split("/").includes("..")) {
    errors.push(`runtime.command must be a path inside the plugin folder, not "${runtime.command}".`);
    return;
  }
  const full = path.join(dir, command);
  if (!existsSync(full) || !statSync(full).isFile()) errors.push(`runtime.command "${command}" does not exist (build the plugin first?).`);
  else if (isIgnored(rules, command)) errors.push(`runtime.command "${command}" is left out by ${".focusdignore"}.`);
}

/**
 * Checks a plugin folder. Returns { manifest, errors, warnings }; errors are what
 * the island or the market would refuse. `allowExperimental` is for development
 * mode, the only place experimentalApis may be used.
 */
export function validatePlugin(dir, { allowExperimental = false } = {}) {
  const errors = [];
  const warnings = [];
  const manifestPath = path.join(dir, MANIFEST_FILE);
  let manifest;
  try {
    manifest = JSON.parse(withoutBom(readFileSync(manifestPath, "utf8")));
  } catch (error) {
    errors.push(existsSync(manifestPath) ? `${MANIFEST_FILE} is not valid JSON: ${error.message}` : `There is no ${MANIFEST_FILE} in ${dir}.`);
    return { manifest: null, errors, warnings };
  }
  for (const { path: where, message } of validateSchema(protocol().manifestSchema, manifest)) {
    errors.push(`${where} ${message}`);
  }
  if (errors.length > 0 || typeof manifest !== "object" || manifest === null) return { manifest, errors, warnings };

  if (manifest.id.includes("..")) errors.push(`id must not contain "..".`);
  if ((manifest.experimentalApis ?? []).length > 0 && !allowExperimental) {
    errors.push("experimentalApis only works in development mode; the island and the market refuse plugins that list them.");
  }
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(manifest.version)) warnings.push(`version "${manifest.version}" is not x.y.z; the market compares versions that way.`);
  if (manifest.homepage && !manifest.homepage.startsWith("https://")) warnings.push("homepage is only shown when it starts with https://.");
  if (!manifest.description) warnings.push("description is empty; the market and the plugin card show it.");

  const rules = loadIgnore(dir);
  checkRuntime(dir, manifest, rules, errors);
  checkWebviews(dir, manifest, errors);
  checkContributions(manifest, errors, warnings);

  const packed = listFiles(dir).filter(([name]) => !isIgnored(rules, name));
  const size = packed.reduce((total, [, full]) => total + statSync(full).size, 0);
  if (size > MAX_PACKAGE_BYTES) errors.push(`The package would be ${(size / 1024 / 1024).toFixed(1)} MB; the market takes at most 20 MB.`);
  if (packed.some(([name]) => name.split("/").includes("node_modules"))) {
    warnings.push("node_modules would be packed; add it to .focusdignore unless the plugin needs it at run time.");
  }

  const declared = new Set(manifest.permissions ?? []);
  const used = permissionsUsed(sourceTexts(dir));
  for (const permission of declared) {
    if (!used.has(permission)) warnings.push(`The permission ${permission} seems unused (no method or event that needs it was found in the code).`);
  }
  for (const permission of used) {
    if (!declared.has(permission)) warnings.push(`The code seems to use ${permission}, which the manifest does not ask for (calls will fail with -32001).`);
  }
  return { manifest, errors, warnings };
}

/** Prints a validation result; returns true when there are no errors. */
export function report(result, out = console) {
  for (const warning of result.warnings) out.log(`warning: ${warning}`);
  for (const error of result.errors) out.error(`error: ${error}`);
  if (result.errors.length === 0) {
    const id = result.manifest ? `${result.manifest.id} ${result.manifest.version}` : "";
    out.log(`ok ${id}${result.warnings.length ? ` (${result.warnings.length} warning(s))` : ""}`);
  }
  return result.errors.length === 0;
}
