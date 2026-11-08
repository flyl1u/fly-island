// The merge queue's checkCommand: the pre-push hook runs it on every land, and
// `pnpm verify` runs it in a lane before landing. `pnpm check` always; `cargo
// test` too when the landing touches files the Rust build or its tests read.
// Two shortcuts keep the queue (locked while this runs) moving:
//   - a landing that only changes Markdown docs runs the quick doc checks;
//   - a tree that already passed (in the lane, or a land that failed to push)
//     is not checked again: passes are recorded by tree hash in the git dir.
// The release build stays a manual step (AGENTS.md).
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mainCheckout, targetDir } from "./build-dirs.mjs";

/** src-tauri itself (including the scripts it embeds with include_str!) and plugins/ (keys, index and schema its tests read). */
const RUST_INPUTS = ["src-tauri/", "plugins/"];

/** Markdown that a test checks against its generator, so changing it needs the full check. */
const CHECKED_DOCS = ["docs/plugins/api.md"];

/** What a docs-only landing runs instead of `pnpm check`. */
const DOCS_CHECKS = ["pnpm run check:tasks"];

/** How many passed trees are remembered. */
const MAX_PASSES = 40;

/** Attribution lines this repo's commits must not carry (AGENTS.md; .githooks/commit-msg). */
const ATTRIBUTION = /^(Co-Authored-By: Claude|🤖 Generated with \[Claude Code\])/im;

/**
 * Subjects of the commits whose messages carry an attribution line. Only commits authored by
 * `ownEmail` (this clone's user.email) count: a contributor's merged pull request keeps its own
 * messages. With no email known, every commit counts.
 */
export function attributedCommits(commits, ownEmail = "") {
  const own = ownEmail.trim().toLowerCase();
  return commits
    .filter(({ author = "" }) => !own || author.trim().toLowerCase() === own)
    .filter(({ body }) => ATTRIBUTION.test(body))
    .map(({ subject }) => subject);
}

export function needsRust(files) {
  return files.some((file) => RUST_INPUTS.some((prefix) => file.startsWith(prefix)));
}

/** Every file is Markdown that no test generates or reads. */
export function docsOnly(files) {
  return files.length > 0 && files.every((file) => file.endsWith(".md") && !CHECKED_DOCS.includes(file));
}

/** The checks a landing of `files` needs; `files` null (unknown) needs all of them. */
export function checksFor(files) {
  if (files && docsOnly(files)) return { frontend: "docs", rust: false };
  return { frontend: "full", rust: !files || needsRust(files) };
}

/** `passes` with `tree` marked as having passed `kinds`, oldest trees dropped past MAX_PASSES. */
export function recordPass(passes, tree, kinds, now = Date.now()) {
  const next = { ...passes, [tree]: { ...passes[tree], ...Object.fromEntries(kinds.map((kind) => [kind, now])) } };
  const newest = (key) => Math.max(...Object.values(next[key]));
  const trees = Object.keys(next).sort((a, b) => newest(b) - newest(a));
  return Object.fromEntries(trees.slice(0, MAX_PASSES).map((key) => [key, next[key]]));
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/** null when unknown, so everything runs. land fetched and rebased onto origin/main just before pushing. */
function changedFiles() {
  try {
    return git(["diff", "--name-only", "origin/main...HEAD"]).split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

/** HEAD's tree when no tracked file has uncommitted changes (only then is it what gets checked). */
function cleanTree() {
  try {
    return git(["status", "--porcelain", "--untracked-files=no"]) ? null : git(["rev-parse", "HEAD^{tree}"]);
  } catch {
    return null;
  }
}

function passesFile() {
  return path.join(path.resolve(git(["rev-parse", "--git-common-dir"])), "land-check-passes.json");
}

function readPasses() {
  try {
    return JSON.parse(readFileSync(passesFile(), "utf8"));
  } catch {
    return {};
  }
}

function run(command, env = {}) {
  console.log(`[land-check] ${command}`);
  return spawnSync(command, { shell: true, stdio: "inherit", env: { ...process.env, ...env } }).status ?? 1;
}

/** The commits being landed, or [] when unknown. */
function landingCommits() {
  try {
    return git(["log", "origin/main..HEAD", "--format=%ae%x1f%s%x1f%B%x1e"])
      .split("").map((entry) => entry.trim()).filter(Boolean)
      .map((entry) => {
        const [author, subject, body] = entry.split("");
        return { author, subject, body };
      });
  } catch {
    return [];
  }
}

/** This clone's commit email, so only its own commits are held to the attribution rule. */
function ownEmail() {
  try {
    return git(["config", "user.email"]).trim();
  } catch {
    return "";
  }
}

function main() {
  const attributed = attributedCommits(landingCommits(), ownEmail());
  if (attributed.length) {
    console.error(`[land-check] remove the Claude attribution lines from: ${attributed.join("; ")}`);
    return 1;
  }
  const files = changedFiles();
  const { frontend, rust } = checksFor(files);
  const tree = cleanTree();
  const passed = tree ? readPasses()[tree] ?? {} : {};
  const record = (kind) => {
    if (tree) writeFileSync(passesFile(), JSON.stringify(recordPass(readPasses(), tree, [kind]), null, 2));
  };

  if (frontend === "docs") {
    console.log("[land-check] only Markdown docs changed; running the doc checks");
    for (const command of DOCS_CHECKS) if (run(command) !== 0) return 1;
    return 0;
  }
  if (passed.check) {
    console.log(`[land-check] tree ${tree.slice(0, 10)} already passed pnpm check; not running it again`);
  } else {
    if (run("pnpm check") !== 0) return 1;
    record("check");
  }
  if (!rust) {
    console.log("[land-check] no Rust inputs changed; skipping cargo test");
    return 0;
  }
  if (passed.cargo) {
    console.log(`[land-check] tree ${tree.slice(0, 10)} already passed cargo test; not running it again`);
    return 0;
  }
  // Lanes share one build cache, apart from the user's `pnpm tauri dev` (build-dirs.mjs):
  // sharing target/debug made each wait on and rebuild after the other.
  const target = process.env.CARGO_TARGET_DIR ?? targetDir(mainCheckout(), "agents");
  if (run("cargo test --manifest-path src-tauri/Cargo.toml", { CARGO_TARGET_DIR: target }) !== 0) return 1;
  record("cargo");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
