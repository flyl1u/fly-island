// `pnpm tasks`: the task board kept in docs/tasks/<id>.md (taskFile.mjs), and
// claiming, finishing and handing over tasks. Workflow in AGENTS.md, "任务".
//
//   pnpm tasks [--all] [--json]          open tasks by section (--all: done ones too)
//   pnpm task:claim <id...> [--as <name>] [--scope a/,b.ts] [--takeover] [--no-land]
//                                        claim on origin/main: one commit, then mq:land
//   pnpm tasks add <id> --title .. --section .. [--status ..]   a new task file (not committed)
//   pnpm tasks done <id> [--commit <subject or hash>]          mark done (commit it with the work)
//   pnpm tasks note <id> <text>          add a handoff line for whoever takes over
//   pnpm tasks release <id>              give a task back
//   pnpm tasks stale                     claims whose lane or session is gone
//   pnpm tasks conflicts                 this lane against main (git merge-tree) and others' scopes
//   pnpm tasks check                     validate every task file (part of pnpm check)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { laneNumber, mainCheckout } from "../build-dirs.mjs";
import {
  OPEN_STATUSES, STATUSES, addHandoff, claimState, claimed, filesInScope, formatTask, groupBySection,
  isTaskId, parseTask, scopeOverlap, taskProblems,
} from "./taskFile.mjs";

const TASKS_DIR = "docs/tasks";
const STALE_MS = 24 * 60 * 60 * 1000;
/** A roadmap line that is a task row: tasks live in docs/tasks now. */
const OLD_TASK_ROW = /^\| [A-Z][0-9]+[a-z]?(\.[0-9]+)* \|/m;

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

function tryGit(args) {
  try {
    return git(args, { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** Every task in `dir` as `{ file, id, task?, error? }`. */
export function readTasks(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => {
      const file = path.join(dir, name);
      const id = name.slice(0, -3);
      try {
        return { file, id, task: parseTask(readFileSync(file, "utf8")) };
      } catch (error) {
        return { file, id, error: error.message };
      }
    });
}

/** Problems across all task files, and old-style task rows left in docs/roadmap.md. */
export function checkTasks(root) {
  const entries = readTasks(path.join(root, TASKS_DIR));
  const ids = new Set(entries.map((entry) => entry.id));
  const problems = entries.flatMap((entry) => (entry.error
    ? [`${entry.id}.md: ${entry.error}`]
    : taskProblems(entry.task, entry.id, ids).map((problem) => `${entry.id}.md: ${problem}`)));
  const roadmap = path.join(root, "docs/roadmap.md");
  if (existsSync(roadmap) && OLD_TASK_ROW.test(readFileSync(roadmap, "utf8"))) {
    problems.push("docs/roadmap.md: has task table rows; tasks live in docs/tasks/<id>.md (pnpm tasks add)");
  }
  return problems;
}

function nowText(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function laneDir(main, lane) {
  return path.join(path.dirname(main), `${path.basename(main)}-lanes`, String(lane));
}

function laneOwners(main) {
  try {
    return JSON.parse(readFileSync(path.join(main, ".git", "claude-code-merge-queue", "lane-owners.json"), "utf8"));
  } catch {
    return {};
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

/** Why a claim no longer holds, or null: its lane is gone, the session that made the lane exited, or a day without moves. */
export function staleReason({ fields }, { laneExists, ownerPidAlive, lastLaneCommitMs, now = Date.now() }) {
  if (fields.status !== "进行中" || !fields.lane) return null;
  if (!laneExists) return `lane ${fields.lane} 已不存在`;
  if (ownerPidAlive === false) return `建 lane ${fields.lane} 的会话已退出`;
  const claimedAt = Date.parse(fields.claimed?.replace(" ", "T") ?? "");
  const quietSince = Math.max(Number.isNaN(claimedAt) ? 0 : claimedAt, lastLaneCommitMs ?? 0);
  if (quietSince && now - quietSince > STALE_MS) return `lane ${fields.lane} 超过 24 小时没有提交`;
  return null;
}

function laneFacts(main, lane) {
  const dir = laneDir(main, lane);
  const owner = laneOwners(main)[path.resolve(dir).toLowerCase()];
  const last = existsSync(dir) ? tryGit(["-C", dir, "log", "-1", "--format=%ct"]) : null;
  return { laneExists: existsSync(dir), ownerPidAlive: owner ? alive(owner.pid) : null, lastLaneCommitMs: last ? Number(last) * 1000 : null };
}

function staleOf(main, task) {
  return task.fields.lane ? staleReason(task, laneFacts(main, task.fields.lane)) : null;
}

/** Records the claude.exe running this command as the lane's owner when the lane has none (lanes made by hand). */
async function recordOwner(main, worktree) {
  const file = path.join(main, ".git", "claude-code-merge-queue", "lane-owners.json");
  const owners = laneOwners(main);
  const key = path.resolve(worktree).toLowerCase();
  if (owners[key]) return;
  try {
    const lib = pathToFileURL(path.join(worktree, "node_modules/claude-code-merge-queue/dist/lib/lane-owner.js")).href;
    const pid = (await import(lib)).findClaudeAncestorPid();
    if (!pid) return;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ ...owners, [key]: { pid, since: new Date().toISOString() } }, null, 2)}\n`);
  } catch {
    // Without an owner the lane only goes stale after a quiet day.
  }
}

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) options._.push(arg);
    else if (["--all", "--json", "--takeover", "--no-land"].includes(arg)) options[arg.slice(2)] = true;
    else options[arg.slice(2)] = argv[(i += 1)] ?? "";
  }
  return options;
}

function taskPath(root, id) {
  return path.join(root, TASKS_DIR, `${id}.md`);
}

function load(root, id) {
  const file = taskPath(root, id);
  if (!existsSync(file)) throw new Error(`没有任务 ${id}（${path.relative(root, file)}）；新任务先用 pnpm tasks add`);
  return parseTask(readFileSync(file, "utf8"));
}

function save(root, task) {
  mkdirSync(path.join(root, TASKS_DIR), { recursive: true });
  writeFileSync(taskPath(root, task.fields.id), formatTask(task));
}

function board(root, main, options) {
  const tasks = readTasks(path.join(root, TASKS_DIR)).filter((entry) => entry.task).map((entry) => entry.task)
    .filter((task) => options.all || OPEN_STATUSES.includes(task.fields.status));
  if (options.json) {
    const rows = tasks.map((task) => ({ ...task.fields, stale: staleOf(main, task), handoff: task.body.includes("## 交接") }));
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  for (const [section, list] of groupBySection(tasks)) {
    console.log(`\n## ${section}`);
    for (const { fields, body } of list) {
      const stale = staleOf(main, { fields });
      const who = fields.owner ? ` · ${fields.owner}${fields.lane ? ` · lane ${fields.lane}` : ""}` : "";
      console.log(`  ${fields.id.padEnd(9)} ${fields.status}${who}${stale ? ` ⚠ ${stale}` : ""}${body.includes("## 交接") ? " · 有交接" : ""}`);
      console.log(`            ${fields.title}`);
    }
  }
  return 0;
}

function run(command, args) {
  return spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" }).status ?? 1;
}

async function claim(root, main, options) {
  const ids = options._;
  if (ids.length === 0 || !ids.every(isTaskId)) throw new Error("用法：pnpm task:claim <编号...> [--as 会话名] [--scope a/,b.ts]");
  const lane = laneNumber(root);
  if (lane === null) throw new Error("认领要在 lane 里做（../fly-island-lanes/N），主工作区留给用户");
  if (tryGit(["status", "--porcelain", "--untracked-files=no"])) throw new Error("工作区有未提交的改动，先提交或暂存再认领");
  if (run("git", ["fetch", "-q", "origin"]) !== 0 || run("git", ["rebase", "-q", "origin/main"]) !== 0) {
    throw new Error("同步 origin/main 失败；先解决 rebase 再认领");
  }
  const owner = options.as || process.env.FOCUSD_SESSION_NAME || `lane ${lane}`;
  const scope = options.scope ? options.scope.split(",").map((part) => part.trim()).filter(Boolean) : undefined;
  const taking = [];
  for (const id of ids) {
    const task = load(root, id);
    if (["已完成", "不做"].includes(task.fields.status)) throw new Error(`${id} 的状态是「${task.fields.status}」，不能认领`);
    const state = claimState(task, lane);
    if (state === "mine") {
      console.log(`${id} 已经是你的（${task.fields.owner} · lane ${lane}），不用再认领`);
      continue;
    }
    if (state === "theirs") {
      const stale = staleOf(main, task);
      if (!stale) throw new Error(`${id} 正由 ${task.fields.owner}（lane ${task.fields.lane}）进行中；换一项`);
      if (!options.takeover) throw new Error(`${id} 的认领已失效（${stale}）。先给 ${task.fields.owner} 发消息说明，再加 --takeover 接手`);
      console.log(`接手 ${id}：原认领 ${task.fields.owner} 已失效（${stale}）`);
    }
    for (const other of readTasks(path.join(root, TASKS_DIR))) {
      const theirs = other.task;
      if (!theirs || other.id === id || claimState(theirs, lane) !== "theirs") continue;
      const overlap = scopeOverlap(scope ?? task.fields.scope, theirs.fields.scope);
      if (overlap.length) console.warn(`注意：${theirs.fields.id}（${theirs.fields.owner}）也在改 ${overlap.join("、")}`);
    }
    save(root, claimed(task, { owner, lane, at: nowText(), scope }));
    taking.push(id);
  }
  await recordOwner(main, root);
  if (taking.length === 0) return 0;
  git(["add", ...taking.map((id) => path.join(TASKS_DIR, `${id}.md`))]);
  git(["commit", "-q", "-m", `docs(tasks): ${owner} takes ${taking.join(", ")}`]);
  if (options["no-land"]) return 0;
  const status = run("pnpm", ["mq:land"]);
  if (status !== 0) console.error("认领没有 land 成功。rebase 冲突说明别人刚认领了同一项：git rebase --abort 后 pnpm tasks 看看，换一项。");
  return status;
}

function conflicts(root) {
  run("git", ["fetch", "-q", "origin"]);
  const result = spawnSync("git", ["merge-tree", "--write-tree", "--name-only", "--no-messages", "origin/main", "HEAD"], { encoding: "utf8" });
  const files = result.stdout.trim().split("\n").slice(1).filter(Boolean);
  if (result.status === 1) console.log(`和 origin/main 冲突的文件：\n  ${files.join("\n  ")}`);
  else if (result.status === 0) console.log("和 origin/main 没有冲突。");
  else console.error(result.stderr.trim());
  const changed = (tryGit(["diff", "--name-only", "origin/main...HEAD"]) ?? "").split("\n").filter(Boolean);
  const lane = laneNumber(root);
  let shared = 0;
  for (const { task } of readTasks(path.join(root, TASKS_DIR))) {
    if (!task || claimState(task, lane) !== "theirs") continue;
    const touched = filesInScope(changed, task.fields.scope);
    if (touched.length) {
      shared += 1;
      console.log(`${task.fields.id}（${task.fields.owner}，lane ${task.fields.lane}）声明了这些文件：${touched.join("、")}`);
    }
  }
  return result.status === 1 || shared > 0 ? 1 : 0;
}

async function main(argv) {
  const root = git(["rev-parse", "--show-toplevel"]);
  const main = mainCheckout(root);
  const [command = "list", ...rest] = argv;
  const options = parseArgs(command.startsWith("--") ? argv : rest);
  switch (command.startsWith("--") ? "list" : command) {
    case "list":
      return board(root, main, options);
    case "claim":
      return claim(root, main, options);
    case "add": {
      const [id] = options._;
      if (!isTaskId(id ?? "") || !options.title || !options.section) throw new Error("用法：pnpm tasks add <编号> --title .. --section ..");
      if (existsSync(taskPath(root, id))) throw new Error(`${id} 已经存在`);
      const status = options.status ?? "待做";
      if (!STATUSES.includes(status)) throw new Error(`状态只能是 ${STATUSES.join(" / ")}`);
      save(root, { fields: { id, title: options.title, section: options.section, status, scope: [], depends: [], commits: [] }, body: options.body ?? "" });
      console.log(`已建 ${TASKS_DIR}/${id}.md；和其他改动一起提交`);
      return 0;
    }
    case "done": {
      const task = load(root, options._[0]);
      const commits = options.commit ? [...task.fields.commits, options.commit] : task.fields.commits;
      save(root, { ...task, fields: { ...task.fields, status: "已完成", commits } });
      console.log(`${task.fields.id} 已标为完成；和功能改动放在同一个提交里`);
      return 0;
    }
    case "note": {
      const [id, ...words] = options._;
      const task = load(root, id);
      save(root, { ...task, body: addHandoff(task.body, `${nowText()} ${words.join(" ")}`) });
      return 0;
    }
    case "release": {
      const task = load(root, options._[0]);
      const { owner: _owner, lane: _lane, claimed: _claimed, ...fields } = task.fields;
      save(root, { ...task, fields: { ...fields, status: "待做" } });
      return 0;
    }
    case "stale": {
      let count = 0;
      for (const { task } of readTasks(path.join(root, TASKS_DIR))) {
        const reason = task && staleOf(main, task);
        if (reason) {
          count += 1;
          console.log(`${task.fields.id}  ${task.fields.owner}：${reason}`);
        }
      }
      if (count === 0) console.log("没有失效的认领。");
      return 0;
    }
    case "conflicts":
      return conflicts(root);
    case "check": {
      const problems = checkTasks(root);
      for (const problem of problems) console.error(problem);
      if (problems.length === 0) console.log(`[tasks] ${readTasks(path.join(root, TASKS_DIR)).length} task files are fine`);
      return problems.length ? 1 : 0;
    }
    default:
      throw new Error(`未知命令 ${command}；见 scripts/tasks/tasks.mjs 开头的说明`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

