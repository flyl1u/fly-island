import assert from "node:assert/strict";
import test from "node:test";
import { markUnreadMailRead } from "../../src/features/messages/mail/markAllRead.ts";

test("mark-all reads only the captured unread list serially and continues after a failure", async () => {
  const items = [{ id: "a", unread: true }, { id: "read", unread: false }, { id: "b", unread: true }, { id: "c", unread: true }];
  const calls = [];
  let active = 0;
  const failed = await markUnreadMailRead("demo@qq.com", items, async (email, id) => {
    assert.equal(active++, 0, "requests must not overlap");
    calls.push([email, id]);
    await Promise.resolve();
    if (id === "a") items.push({ id: "new-arrival", unread: true });
    active--;
    return id !== "b";
  });
  assert.equal(failed, 1);
  assert.deepEqual(calls, [["demo@qq.com", "a"], ["demo@qq.com", "b"], ["demo@qq.com", "c"]]);
  assert.equal(items.find((item) => item.id === "b").unread, true);
});

test("empty or already-read mail makes no server calls", async () => {
  const unexpected = async () => { assert.fail("no unread mail"); };
  assert.equal(await markUnreadMailRead("demo@qq.com", [], unexpected), 0);
  assert.equal(await markUnreadMailRead("demo@qq.com", [{ id: "read", unread: false }], unexpected), 0);
});
