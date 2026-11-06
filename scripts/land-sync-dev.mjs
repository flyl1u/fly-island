// The merge queue's onLand hook. Builds from before c3aaf55 read the plugin
// market from the fork's dev branch, so dev follows each landed commit
// (fast-forward only). land neither waits for nor shows this command, so the
// result goes to .git/land-sync-dev.log.
import { appendFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const sha = process.env.CCMQ_LANDED_SHA ?? "";
// windowsHide on every git call: land starts this script detached, without a console, so
// a console program it starts would otherwise open a window of its own.
const commonDir = path.resolve(execFileSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8", windowsHide: true }).trim());
let result = { status: 1, stderr: "CCMQ_LANDED_SHA is not a commit id" };
if (/^[0-9a-f]{40}$/.test(sha)) {
  // --no-verify: the pre-push checks already passed for this exact commit.
  result = spawnSync("git", ["push", "--no-verify", "origin", `${sha}:refs/heads/dev`], { encoding: "utf8", windowsHide: true });
}
appendFileSync(
  path.join(commonDir, "land-sync-dev.log"),
  `${new Date().toISOString()} dev <- ${sha || "?"} exit=${result.status}\n${(result.stderr ?? "").trim()}\n`,
);
