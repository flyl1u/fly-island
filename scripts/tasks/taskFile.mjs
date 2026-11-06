// One task per file in docs/tasks/<id>.md: a front matter block of `key: value`
// lines, then free Markdown (notes, and the "交接" handoff a session leaves for
// the next one). Two sessions claiming the same task edit the same file, so the
// later land fails its rebase; different tasks never touch each other's files.

export const STATUSES = ["待做", "进行中", "待用户确认", "已完成", "不做"];
export const OPEN_STATUSES = ["待做", "进行中", "待用户确认"];

/** Fields in the order they are written; any other key is kept after them. */
const FIELDS = ["id", "title", "section", "status", "owner", "lane", "claimed", "scope", "depends", "parent", "commits"];
const LIST_FIELDS = ["scope", "depends", "commits"];

/** Board order; sections not listed come after, in name order. */
export const SECTIONS = [
  "第一优先：Agent 会话定位",
  "第二优先：Agent 页体验",
  "B6 Agent 岛上交互",
  "第三优先：竞品都有、我们还缺的",
  "第四优先：质量与发布",
  "第五优先：多会话协作",
];

export const HANDOFF_HEADING = "## 交接";

const ID = /^[A-Z][0-9]+[a-z]?(\.[0-9]+)*$/;

export function isTaskId(id) {
  return ID.test(id);
}

/** Splits a list field written as `a, b`; empty for none. */
function splitList(value) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

/** `{ fields, body }` from a task file's text; throws on a missing or broken front matter. */
export function parseTask(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (!match) throw new Error("missing the --- front matter block");
  const fields = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon < 1) throw new Error(`front matter line without a key: ${line}`);
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    fields[key] = LIST_FIELDS.includes(key) ? splitList(value) : value;
  }
  for (const key of LIST_FIELDS) fields[key] ??= [];
  return { fields, body: match[2].replace(/^\n+/, "").replace(/\s+$/, "") };
}

/** The file text for `task`; LF line endings, one trailing newline. */
export function formatTask({ fields, body }) {
  const keys = [...FIELDS, ...Object.keys(fields).filter((key) => !FIELDS.includes(key))];
  const lines = keys
    .filter((key) => fields[key] !== undefined)
    .map((key) => `${key}: ${Array.isArray(fields[key]) ? fields[key].join(", ") : fields[key]}`);
  return `---\n${lines.join("\n")}\n---\n${body ? `\n${body}\n` : ""}`;
}

/** Problems with one task, given every task id; empty when it is fine. */
export function taskProblems({ fields }, fileId, ids) {
  const problems = [];
  if (fields.id !== fileId) problems.push(`id "${fields.id}" does not match the file name ${fileId}.md`);
  if (!isTaskId(fields.id ?? "")) problems.push(`id "${fields.id}" is not like A7, B6.1.12 or F10`);
  if (!fields.title) problems.push("no title");
  if (!fields.section) problems.push("no section");
  if (!STATUSES.includes(fields.status)) problems.push(`status "${fields.status}" is not one of ${STATUSES.join(" / ")}`);
  if (fields.status === "进行中" && !fields.owner) problems.push("in progress without an owner");
  if (fields.lane && !/^[0-9]+$/.test(fields.lane)) problems.push(`lane "${fields.lane}" is not a number`);
  for (const dependency of [...fields.depends, ...(fields.parent ? [fields.parent] : [])]) {
    if (!ids.has(dependency)) problems.push(`refers to unknown task ${dependency}`);
  }
  return problems;
}

/** `text` with `line` added under the handoff heading, which is created at the end when missing. */
export function addHandoff(body, line) {
  if (!body.includes(HANDOFF_HEADING)) return `${body ? `${body}\n\n` : ""}${HANDOFF_HEADING}\n\n- ${line}`;
  const start = body.indexOf(HANDOFF_HEADING) + HANDOFF_HEADING.length;
  const next = body.slice(start).search(/\n## /);
  const end = next === -1 ? body.length : start + next;
  const rest = body.slice(end).replace(/^\s+/, "");
  return `${body.slice(0, end).replace(/\s+$/, "")}\n- ${line}${rest ? `\n\n${rest}` : ""}`;
}

/** The claim fields for `owner` in `lane`, keeping everything else. */
export function claimed(task, { owner, lane, at, scope }) {
  return {
    ...task,
    fields: { ...task.fields, status: "进行中", owner, lane: String(lane ?? ""), claimed: at, scope: scope ?? task.fields.scope },
  };
}

/** Whose the task is: "free", "mine" (same lane), or "theirs". */
export function claimState({ fields }, lane) {
  if (fields.status !== "进行中" || !fields.owner) return "free";
  return fields.lane && String(lane) === fields.lane ? "mine" : "theirs";
}

function sectionRank(section) {
  const index = SECTIONS.findIndex((name) => section.startsWith(name));
  return index === -1 ? SECTIONS.length : index;
}

function compareIds(a, b) {
  return a.localeCompare(b, "en", { numeric: true });
}

/** Tasks grouped for the board: sections in board order, ids in natural order within each. */
export function groupBySection(tasks) {
  const groups = new Map();
  for (const task of [...tasks].sort((a, b) => sectionRank(a.fields.section) - sectionRank(b.fields.section)
    || a.fields.section.localeCompare(b.fields.section) || compareIds(a.fields.id, b.fields.id))) {
    const list = groups.get(task.fields.section) ?? [];
    list.push(task);
    groups.set(task.fields.section, list);
  }
  return groups;
}

/** Paths that both scopes cover: a scope entry is a file or a folder ending in "/". */
export function scopeOverlap(a, b) {
  const covers = (outer, inner) => outer === inner || (outer.endsWith("/") && inner.startsWith(outer));
  return a.filter((x) => b.some((y) => covers(x, y) || covers(y, x)));
}

/** Changed files that fall inside `scope`. */
export function filesInScope(files, scope) {
  return files.filter((file) => scope.some((entry) => entry === file || (entry.endsWith("/") && file.startsWith(entry))));
}
