import assert from "node:assert/strict";
import test from "node:test";
import { cachedFileIcon, loadFileIcon } from "../../src/features/clipboard/fileIconCache.ts";

test("file icons are read once per id and a missing file's answer is kept too", async () => {
  const reads = [];
  const read = async (id) => { reads.push(id); return id === "gone" ? null : `data:${id}`; };
  const [a, b] = await Promise.all([loadFileIcon("a", read), loadFileIcon("a", read)]);
  assert.equal(a, "data:a");
  assert.equal(b, "data:a");
  assert.equal(await loadFileIcon("gone", read), null);
  assert.equal(await loadFileIcon("gone", read), null);
  assert.deepEqual(reads, ["a", "gone"], "neither is read again");
  assert.equal(cachedFileIcon("gone"), null, "null is an answer");
  assert.equal(cachedFileIcon("never-asked"), undefined);
});

test("the oldest icons drop past the limit, and a failed read is not cached", async () => {
  const read = async (id) => `data:${id}`;
  for (let i = 0; i < 301; i++) await loadFileIcon(`n${i}`, read);
  assert.equal(cachedFileIcon("n0"), undefined);
  assert.equal(cachedFileIcon("n300"), "data:n300");
  let calls = 0;
  const failing = async () => { calls++; throw new Error("ipc"); };
  await assert.rejects(loadFileIcon("broken", failing));
  await assert.rejects(loadFileIcon("broken", failing));
  assert.equal(calls, 2);
  assert.equal(cachedFileIcon("broken"), undefined);
});
