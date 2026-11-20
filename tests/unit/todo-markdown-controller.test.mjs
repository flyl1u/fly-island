import assert from "node:assert/strict";
import test from "node:test";
import { baselineFromSignature, createTodoMarkdownSync } from "../../src/features/todos/todoMarkdownSync.ts";
import { getTodoSignature } from "../../src/features/todos/markdown.ts";

const task = (title, id = title) => ({ id, title, completed: false, createdAt: 1 });
const document = (titles, dailyNote = "") => ({ todos: titles.map(title => task(title)), dailyNote });

function harness(baseline = document(["a", "b"]), text = "- [ ] a\n- [ ] b") {
  let now = 10_000;
  let serial = 0;
  let local = { document: structuredClone(baseline), editedAt: 0 };
  let disk = { filePath: "D:/notes/2026-11-19.md", content: text, version: text === null ? null : "v0", modifiedAt: 1000 };
  let editing = false;
  let beforeWrite = () => {};
  let beforeRead = () => {};
  const writes = [], applied = [], saved = [];
  const sync = createTodoMarkdownSync({
    baseline,
    getLocal: () => local,
    isEditing: () => editing,
    now: () => now,
    createId: () => `new-${++serial}`,
    read: async () => { await beforeRead(); return { ...disk }; },
    write: async (content, version, recovery) => {
      await beforeWrite();
      if (disk.version !== version) return { saved: false, snapshot: { ...disk } };
      writes.push({ content, recovery });
      disk = { ...disk, content, version: `v${++serial}`, modifiedAt: now };
      return { saved: true, snapshot: { ...disk } };
    },
    apply: document => { local = { ...local, document }; applied.push(document); },
    onSaved: (document, path) => saved.push({ document, path }),
  });
  return {
    sync, writes, applied, saved,
    local: () => local.document, disk: () => disk,
    advance: (ms = 1500) => { now += ms; },
    edit: document => { local = { document, editedAt: now }; },
    external: (content, modifiedAt = now) => { disk = { ...disk, content, version: content === null ? null : `v${++serial}`, modifiedAt }; },
    setEditing: value => { editing = value; },
    beforeWrite: fn => { beforeWrite = fn; },
    beforeRead: fn => { beforeRead = fn; },
    stable: async () => { await sync.poll(); now += 1500; return sync.poll(); },
  };
}

test("unchanged and self-written files do not apply or write on subsequent polls", async () => {
  const h = harness();
  await h.stable();
  assert.equal(h.applied.length, 0);
  assert.equal(h.writes.length, 0);
  h.edit(document(["a", "b", "island new"]));
  await h.sync.save();
  assert.equal(h.writes.length, 1);
  for (let i = 0; i < 5; i++) await h.sync.poll();
  const saves = h.saved.length;
  h.external(h.disk().content); // The final native handle close can advance mtime alone.
  await h.stable();
  assert.equal(h.writes.length, 1);
  assert.equal(h.applied.length, 0);
  assert.equal(h.saved.length, saves);
});

test("stable external changes import once, preserve IDs and are marked saved", async () => {
  const h = harness();
  await h.stable();
  h.external("* [X] b\n- a\n- new\n\n## Notes\nexternal");
  await h.sync.poll();
  assert.deepEqual(h.local().todos.map(t => t.title), ["a", "b"]);
  h.advance();
  await h.sync.poll();
  assert.deepEqual(h.local().todos.map(t => [t.id, t.completed]), [["b", true], ["a", false], ["new-2", false]]);
  assert.equal(h.local().dailyNote, "## Notes\nexternal");
  assert.equal(h.writes.length, 0);
  assert.equal(h.applied.length, 1);
  await h.sync.save();
  assert.equal(h.writes.length, 0);
});

test("autosave reads first and merges pending file edits with unsaved island additions", async () => {
  const h = harness();
  await h.stable();
  h.edit(document(["island new", "a", "b"]));
  h.external("- [x] b\n- [ ] a\n- remote new");
  assert.equal((await h.sync.save()).deferred, true);
  assert.equal(h.writes.length, 0);
  h.advance();
  await h.sync.poll();
  assert.deepEqual(h.local().todos.map(t => t.title), ["b", "a", "remote new", "island new"]);
  assert.equal(h.local().todos[0].completed, true);
  assert.match(h.disk().content, /remote new/);
  assert.match(h.disk().content, /island new/);
});

test("empty/truncated/removed files block autosave without clearing local data", async () => {
  for (const external of ["", "- [ ] a\n- [", null]) {
    const h = harness();
    await h.stable();
    h.edit(document(["a", "b", "local"]));
    h.external(external);
    await h.stable();
    assert.equal((await h.sync.save()).blocked, true);
    assert.deepEqual(h.local().todos.map(t => t.title), ["a", "b", "local"]);
    assert.equal(h.writes.length, 0);
    h.external("- [x] b\n- a");
    await h.stable();
    assert.ok(h.local().todos.find(t => t.title === "local"));
  }
});

test("title/note editing defers both import and writes, then merges the committed draft", async () => {
  const h = harness();
  await h.stable();
  h.setEditing(true);
  h.external("- [x] a\n- b");
  await h.stable();
  assert.equal(h.applied.length, 0);
  assert.equal((await h.sync.save()).deferred, true);
  h.edit({ todos: [task("draft committed", "a"), task("b")], dailyNote: "" });
  h.setEditing(false);
  await h.stable();
  h.advance();
  await h.sync.poll();
  assert.equal(h.local().todos[0].title, "draft committed");
  assert.equal(h.local().todos[0].completed, true);
});

test("conflicts choose the newer side and write recovery before applying", async () => {
  for (const newer of ["island", "file"]) {
    const h = harness(document(["a"], "base"), "- a\n\nbase");
    await h.stable();
    h.edit(document(["a"], "island note"));
    h.external("- a\n\nfile note", newer === "file" ? 20_000 : 1000);
    await h.stable();
    assert.equal(h.writes[0].recovery, "- [ ] a\n\nisland note");
    assert.equal(h.local().dailyNote, `${newer} note`);
  }
});

test("a replacement during a conditional save is never overwritten", async () => {
  const h = harness();
  await h.stable();
  h.edit(document(["local", "a", "b"]));
  h.beforeWrite(() => { h.external("- a\n- b\n- racing file edit"); h.beforeWrite(() => {}); });
  assert.equal((await h.sync.save()).deferred, true);
  assert.equal(h.writes.length, 0);
  assert.match(h.disk().content, /racing file edit/);
  await h.stable();
  assert.match(h.disk().content, /racing file edit/);
  assert.match(h.disk().content, /local/);
});

test("local edits committed during IPC survive the imported change", async () => {
  const h = harness();
  await h.stable();
  h.edit(document(["a", "b", "local before write"]));
  h.external("- [x] a\n- b");
  h.beforeWrite(() => { h.edit(document(["a", "b", "local before write", "local during write"])); h.beforeWrite(() => {}); });
  await h.stable();
  assert.deepEqual(h.local().todos.map(t => t.title), ["a", "b", "local before write", "local during write"]);
  assert.equal(h.local().todos[0].completed, true);
  await h.sync.save();
  assert.match(h.disk().content, /local during write/);
});

test("dispose during a read cancels imports and further writes for an old day/path", async () => {
  const h = harness();
  h.beforeRead(() => h.sync.dispose());
  await h.sync.poll();
  h.advance();
  await h.sync.save();
  assert.equal(h.applied.length, 0);
  assert.equal(h.writes.length, 0);
});

test("a title editor opened during IPC stays mounted until its draft commits", async () => {
  const h = harness();
  await h.stable();
  h.edit(document(["a", "b", "local"]));
  h.external("- b");
  h.beforeWrite(() => { h.setEditing(true); h.beforeWrite(() => {}); });
  await h.stable();
  assert.ok(h.local().todos.some(todo => todo.id === "a"));
  assert.equal(h.applied.length, 0);
  h.edit({ todos: [task("draft", "a"), task("b"), task("local")], dailyNote: "" });
  h.setEditing(false);
  await h.sync.save();
  assert.ok(h.local().todos.some(todo => todo.title === "draft"));
  assert.match(h.disk().content, /draft/);
  assert.ok(h.writes[h.writes.length - 1].recovery);
});

test("missing daily file is created from current island data", async () => {
  const h = harness(document(["a"]), null);
  await h.sync.save();
  assert.equal(h.disk().content, "- [ ] a");
});

test("restart recovers the last common signature, invalid or other-day values fall back", () => {
  const current = document(["a", "new"]);
  const signature = getTodoSignature("2026-11-19", current.todos.slice(0, 1), "old note");
  assert.deepEqual(baselineFromSignature("2026-11-19", signature, current), { todos: [current.todos[0]], dailyNote: "old note" });
  for (const value of [null, "{", "null", "{}", '{"date":"2026-11-19","todos":[null],"dailyNote":""}', signature]) {
    assert.equal(baselineFromSignature("2026-11-20", value, current), current);
  }
});
