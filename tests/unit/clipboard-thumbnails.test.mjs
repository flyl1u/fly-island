import assert from "node:assert/strict";
import test from "node:test";
import { cachedThumbnail, loadThumbnail, thumbnailCacheSize } from "../../src/features/clipboard/thumbnailCache.ts";

test("thumbnails are read once per id, shared while pending, and the oldest drop past the limit", async () => {
  const reads = [];
  const read = async (id) => { reads.push(id); return `data:${id}`; };
  const [a, b] = await Promise.all([loadThumbnail("a", read), loadThumbnail("a", read)]);
  assert.equal(a, "data:a");
  assert.equal(b, "data:a");
  assert.deepEqual(reads, ["a"]);
  assert.equal(await loadThumbnail("a", read), "data:a");
  assert.deepEqual(reads, ["a"], "a cached thumbnail is not read again");
  for (let i = 0; i < 300; i++) await loadThumbnail(`n${i}`, read);
  assert.equal(thumbnailCacheSize(), 300);
  assert.equal(cachedThumbnail("a"), null, "the least recently used one went first");
  assert.equal(cachedThumbnail("n299"), "data:n299");
});

test("a failed read is not cached, so the row can ask again", async () => {
  let calls = 0;
  const failing = async () => { calls++; throw new Error("gone"); };
  await assert.rejects(loadThumbnail("broken", failing));
  await assert.rejects(loadThumbnail("broken", failing));
  assert.equal(calls, 2);
  assert.equal(cachedThumbnail("broken"), null);
});
