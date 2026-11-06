// Where builds go, so the user's `pnpm tauri dev`, the agents' checks, lane
// previews and release builds do not wait on each other's cargo locks or fight
// over a running exe. All live under the main checkout's src-tauri/target:
//
//   target/debug, target/release  the user's `pnpm tauri dev` and release builds
//                                 (the desktop shortcut runs target/release)
//   target/agents                 agents' cargo test / clippy (land-check.mjs)
//   target/lane-<N>               lane N's preview (dev-lane.mjs)
import { execFileSync } from "node:child_process";
import path from "node:path";

/** Lane previews' Vite ports start here (1420 is the main dev server; the regression runner picks free ports). */
export const LANE_PORT_BASE = 1500;

/** The main checkout's folder, from inside it or any of its worktrees. */
export function mainCheckout(cwd = process.cwd()) {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" }).trim();
  return path.dirname(path.resolve(cwd, common));
}

export const targetDir = (main, name = "") => path.join(main, "src-tauri", "target", name);

/** The lane number of a worktree at `.../fly-island-lanes/<N>`, or null. */
export function laneNumber(worktree) {
  const parts = path.resolve(worktree).split(/[\\/]/);
  const number = Number(parts.at(-1));
  return parts.at(-2) === "fly-island-lanes" && Number.isInteger(number) && number > 0 && number < 1000 ? number : null;
}

/** Port, identifier and build folder of lane `lane`'s preview. */
export function lanePreview(main, lane) {
  return {
    port: LANE_PORT_BASE + lane,
    identifier: `com.focusd.island.lane-${lane}`,
    target: targetDir(main, `lane-${lane}`),
  };
}
