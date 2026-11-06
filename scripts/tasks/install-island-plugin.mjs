// `pnpm tasks:plugin`: installs the dev task board plugin (island-plugin/) into
// this computer's FocuSD Island plugin folder, with the PowerShell helpers of the
// example plugins and the main checkout recorded as its repository. It is not
// on the plugin market: it is only useful while developing this repo. Then, in
// Settings > Plugins: allow third-party plugins, reload, enable "开发任务看板".
import { copyFileSync, cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mainCheckout } from "../build-dirs.mjs";

const ID = "dev.focusd.dev-tasks";
const here = path.dirname(fileURLToPath(import.meta.url));

/** The island's plugin folder: %APPDATA%\com.focusd.island\plugins. */
export function pluginsDir(env = process.env) {
  if (!env.APPDATA) throw new Error("APPDATA is not set; this installs into the Windows FocuSD Island only.");
  return path.join(env.APPDATA, "com.focusd.island", "plugins");
}

function main() {
  const main = mainCheckout();
  const target = path.join(pluginsDir(), ID);
  mkdirSync(path.join(target, "lib"), { recursive: true });
  cpSync(path.join(here, "island-plugin"), target, { recursive: true });
  copyFileSync(path.join(main, "plugins/examples/dev.focusd.github-issues/lib/focusd.ps1"), path.join(target, "lib/focusd.ps1"));
  writeFileSync(path.join(target, "repo.txt"), `${main}\n`);
  console.log(`[tasks:plugin] installed ${ID} into ${target} (repo ${main}).`);
  console.log("[tasks:plugin] In Settings > Plugins: allow third-party plugins, Reload, then enable 开发任务看板.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
