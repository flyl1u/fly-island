import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  addHandoff, claimState, claimed, filesInScope, formatTask, groupBySection, parseTask, scopeOverlap, taskProblems,
} from "../../scripts/tasks/taskFile.mjs";
import { checkTasks, staleReason } from "../../scripts/tasks/tasks.mjs";

const TEXT = "---\r\nid: F1\r\ntitle: 认领脚本\r\nsection: 第五优先：多会话协作\r\nstatus: 待做\r\nscope: scripts/, docs/roadmap.md\r\ndepends: \r\ncommits: \r\n---\r\n\r\n说明：a: b\r\n";

test("task files round-trip, with list fields and colons in the body", () => {
  const task = parseTask(TEXT);
  assert.deepEqual(task.fields.scope, ["scripts/", "docs/roadmap.md"]);
  assert.deepEqual(task.fields.depends, []);
  assert.equal(task.body, "说明：a: b");
  const again = formatTask(task);
  assert.ok(!again.includes("\r"));
  assert.deepEqual(parseTask(again), task);
  assert.throws(() => parseTask("no front matter"), /front matter/);
});

test("problems: wrong id, status, missing owner, unknown dependency", () => {
  const ids = new Set(["F1"]);
  assert.deepEqual(taskProblems(parseTask(TEXT), "F1", ids), []);
  const bad = parseTask(TEXT.replace("status: 待做", "status: 进行中").replace("depends: ", "depends: F9"));
  assert.equal(taskProblems(bad, "F2", ids).length, 3);
});

test("claiming: free, mine in my lane, theirs elsewhere", () => {
  const task = parseTask(TEXT);
  assert.equal(claimState(task, 7), "free");
  const mine = claimed(task, { owner: "s", lane: 7, at: "2026-11-07 02:00" });
  assert.equal(mine.fields.status, "进行中");
  assert.equal(claimState(mine, 7), "mine");
  assert.equal(claimState(mine, 3), "theirs");
  assert.deepEqual(mine.fields.scope, ["scripts/", "docs/roadmap.md"], "no --scope keeps the declared one");
});

test("stale claims: lane gone, its session exited, or a quiet day", () => {
  const task = claimed(parseTask(TEXT), { owner: "s", lane: 7, at: "2026-11-07 02:00" });
  const now = Date.parse("2026-11-07T03:00");
  assert.match(staleReason(task, { laneExists: false, now }), /不存在/);
  assert.match(staleReason(task, { laneExists: true, ownerPidAlive: false, now }), /退出/);
  assert.equal(staleReason(task, { laneExists: true, ownerPidAlive: true, now }), null);
  assert.equal(staleReason(task, { laneExists: true, ownerPidAlive: null, now }), null);
  const later = Date.parse("2026-11-08T03:00");
  assert.match(staleReason(task, { laneExists: true, ownerPidAlive: null, now: later }), /24 小时/);
  assert.equal(staleReason(task, { laneExists: true, ownerPidAlive: null, lastLaneCommitMs: later - 1000, now: later }), null);
  assert.equal(staleReason(parseTask(TEXT), { laneExists: false, now }), null, "free tasks are never stale");
});

test("handoff lines collect under one heading, before later sections", () => {
  const once = addHandoff("说明", "下一步：写测试");
  assert.equal(once, "说明\n\n## 交接\n\n- 下一步：写测试");
  assert.equal(addHandoff(`${once}\n\n## 其他\n\nx`, "第二条"), "说明\n\n## 交接\n\n- 下一步：写测试\n- 第二条\n\n## 其他\n\nx");
});

test("scopes overlap by file or folder; changed files fall in a scope", () => {
  assert.deepEqual(scopeOverlap(["scripts/"], ["scripts/tasks/tasks.mjs", "src/"]), ["scripts/"]);
  assert.deepEqual(scopeOverlap(["docs/a.md"], ["docs/b.md"]), []);
  assert.deepEqual(filesInScope(["scripts/x.mjs", "src/y.ts"], ["scripts/"]), ["scripts/x.mjs"]);
});

test("the board puts known sections first and ids in natural order", () => {
  const make = (id, section) => ({ fields: { id, section }, body: "" });
  const groups = groupBySection([make("F10", "第五优先：多会话协作"), make("F2", "第五优先：多会话协作"), make("A6", "第一优先：Agent 会话定位"), make("Z1", "别的")]);
  assert.deepEqual([...groups.keys()], ["第一优先：Agent 会话定位", "第五优先：多会话协作", "别的"]);
  assert.deepEqual(groups.get("第五优先：多会话协作").map((task) => task.fields.id), ["F2", "F10"]);
});

test("check finds broken files and task rows left in the roadmap", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tasks-"));
  mkdirSync(path.join(root, "docs/tasks"), { recursive: true });
  writeFileSync(path.join(root, "docs/tasks/F1.md"), TEXT);
  writeFileSync(path.join(root, "docs/roadmap.md"), "# 待完善任务\n");
  assert.deepEqual(checkTasks(root), []);
  writeFileSync(path.join(root, "docs/tasks/F2.md"), "oops");
  writeFileSync(path.join(root, "docs/roadmap.md"), "| A1 | x | 待做 | | |\n");
  assert.equal(checkTasks(root).length, 2);
});
