// `pnpm dev:lane`: runs this lane's island as a preview next to the user's own.
// Plain `pnpm tauri dev` would stop every running island first and needs port
// 1420, which the main checkout's dev server uses. The preview instead:
//   - serves Vite on 1500 + <lane number>;
//   - builds into src-tauri/target/lane-<N> of the main checkout;
//   - runs as com.focusd.island.lane-<N> (FOCUSD_DEV_LANE, src-tauri/src/dev_lane.rs),
//     with its own data, and without touching focusd:// links, launch at
//     startup or the agents' status hooks.
// It starts with empty data; the user's island keeps running.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lanePreview, laneNumber, mainCheckout } from "./build-dirs.mjs";

/** The `tauri dev --config` override for a preview on `port`. */
export function previewConfig(port) {
  return {
    build: {
      devUrl: `http://localhost:${port}`,
      // Not the default beforeDevCommand, which stops every running island.
      beforeDevCommand: `pnpm exec vite --port ${port} --strictPort`,
    },
  };
}

function main() {
  const root = process.cwd();
  const lane = laneNumber(root);
  if (lane === null) {
    console.error("pnpm dev:lane runs in a lane (../fly-island-lanes/<N>). In the main checkout use pnpm tauri dev.");
    return Promise.resolve(1);
  }
  const preview = lanePreview(mainCheckout(root), lane);
  const configFile = path.join(tmpdir(), `fly-island-lane-${lane}.tauri.json`);
  writeFileSync(configFile, JSON.stringify(previewConfig(preview.port)));
  console.log(`[dev:lane] lane ${lane}: ${preview.identifier}, Vite on ${preview.port}, building into ${preview.target}`);
  console.log("[dev:lane] The first build takes a few minutes. Close the preview from its tray icon or with Ctrl+C.");
  const child = spawn(`pnpm tauri dev --config "${configFile}"`, {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, CARGO_TARGET_DIR: preview.target, FOCUSD_DEV_LANE: String(lane) },
  });
  return new Promise((resolve) => child.on("exit", (code) => resolve(code ?? 1)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
