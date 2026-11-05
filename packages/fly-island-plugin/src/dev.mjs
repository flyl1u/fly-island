// `fly-island-plugin dev`: loads a plugin folder into the running island in
// development mode through its local API (/v1/dev/...), restarts the plugin
// when a file changes and prints the plugin's log until Ctrl+C.
import { existsSync, readFileSync, watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isIgnored, loadIgnore } from "./ignore.mjs";
import { report, validatePlugin } from "./validate.mjs";

const APP_IDENTIFIER = "com.focusd.island";
const RELOAD_DELAY_MS = 300;
const LOG_POLL_MS = 500;

/** Where the island keeps local-api.json (port and token). */
export function defaultConfigPath() {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, APP_IDENTIFIER, "local-api.json");
}

/** A client for the island's /v1/dev endpoints. */
export function devClient(configPath = defaultConfigPath()) {
  if (!existsSync(configPath)) {
    throw new Error(`${configPath} not found. Start FocuSD Island and turn on its Local API plugin (Settings > Plugins).`);
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (!config.enabled) throw new Error("The island's local API is off: turn on the Local API plugin in Settings > Plugins.");
  const base = `http://127.0.0.1:${config.port}/v1/dev/plugins`;
  const request = async (method, suffix = "", body) => {
    let response;
    try {
      response = await fetch(`${base}${suffix}`, {
        method,
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new Error(`Could not reach the island at 127.0.0.1:${config.port} (${error.cause?.code ?? error.message}). Is it running?`);
    }
    const answer = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (!answer.ok) throw Object.assign(new Error(answer.error ?? `HTTP ${response.status}`), { status: response.status });
    return answer.data;
  };
  return {
    load: (dir) => request("POST", "", { path: dir }),
    reload: (id) => request("POST", `/${encodeURIComponent(id)}/reload`),
    unload: (id) => request("DELETE", `/${encodeURIComponent(id)}`),
    log: (id, after) => request("GET", `/${encodeURIComponent(id)}/log?after=${after}`),
  };
}

const stamp = () => new Date().toTimeString().slice(0, 8);

export async function runDev(dir, { config } = {}) {
  if (!report(validatePlugin(dir, { allowExperimental: true }))) return 1;
  const client = devClient(config ? path.resolve(config) : undefined);
  let loaded;
  try {
    loaded = await client.load(dir);
  } catch (error) {
    if (error.status === 403) console.error("Turn on development mode first: Settings > Plugins > Developer.");
    throw error;
  }
  const id = loaded.id;
  console.log(`[${stamp()}] loaded ${id} from ${dir} in development mode; watching for changes (Ctrl+C to stop)`);

  let timer = null;
  let reloading = Promise.resolve();
  const rules = loadIgnore(dir);
  const watcher = watch(dir, { recursive: true }, (_event, name) => {
    const relative = String(name ?? "").replaceAll("\\", "/");
    if (relative === "" || /(^|\/)(node_modules|\.git)(\/|$)/.test(relative) || isIgnored(rules, relative)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      reloading = reloading.then(async () => {
        const result = validatePlugin(dir, { allowExperimental: true });
        if (!report(result)) return;
        try {
          await client.reload(id);
          console.log(`[${stamp()}] ${relative} changed: restarted ${id}`);
        } catch (error) {
          console.error(`[${stamp()}] could not restart: ${error.message}`);
        }
      });
    }, RELOAD_DELAY_MS);
  });

  let after = 0;
  let lastStatus = "";
  let stopped = false;
  const poll = async () => {
    while (!stopped) {
      try {
        let log = await client.log(id, after);
        // "Reload plugins" in Settings starts the numbering again.
        if (log.next < after) log = await client.log(id, 0);
        for (const line of log.lines) console.log(`[${stamp()}] ${line.text}`);
        after = log.next;
        const status = `${log.status}${log.error ? `: ${log.error}` : ""}`;
        if (status !== lastStatus) {
          console.log(`[${stamp()}] status ${status}`);
          lastStatus = status;
        }
      } catch (error) {
        console.error(`[${stamp()}] ${error.message}`);
        if (error.status === 403 || error.status === 404) break;
      }
      await new Promise((resolve) => setTimeout(resolve, LOG_POLL_MS));
    }
  };

  return new Promise((resolve) => {
    const finish = async (code) => {
      if (stopped) return;
      stopped = true;
      watcher.close();
      clearTimeout(timer);
      await client.unload(id).catch(() => {});
      console.log(`[${stamp()}] unloaded ${id}`);
      resolve(code);
    };
    process.once("SIGINT", () => void finish(0));
    poll().then(() => finish(1));
  });
}
