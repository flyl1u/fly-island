import assert from "node:assert/strict";
import { test } from "node:test";
import { cachedAuthorAvatar, githubAvatarUrl, loadAuthorAvatar } from "../../src/features/plugins/authorAvatarCache.ts";

test("avatar requests are shared and cached across market remounts, with retry after a failed request", async () => {
  const oldFetch = globalThis.fetch;
  const oldImage = globalThis.Image;
  let calls = 0;
  globalThis.Image = class { async decode() {} };
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(new Blob(["image"], { type: "image/png" }));
  };
  try {
    const source = githubAvatarUrl("https://github.com/flyl1u");
    const [first, second] = await Promise.all([loadAuthorAvatar(source), loadAuthorAvatar(source)]);
    assert.equal(calls, 1);
    assert.ok(first.startsWith("blob:"));
    assert.equal(first, second);
    assert.equal(cachedAuthorAvatar(source), first);
    assert.equal(await loadAuthorAvatar(source), first);
    assert.equal(calls, 1, "reopening the market must not make another network request");
    const retry = githubAvatarUrl("https://github.com/example");
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal(await loadAuthorAvatar(retry), null);
    globalThis.fetch = async () => new Response(new Blob(["retry"], { type: "image/png" }));
    assert.ok((await loadAuthorAvatar(retry)).startsWith("blob:"));
    for (const url of ["https://github.com/flyl1u/repo", "https://example.com/user", "http://github.com/user"]) {
      assert.equal(githubAvatarUrl(url), null);
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldImage === undefined) delete globalThis.Image;
    else globalThis.Image = oldImage;
  }
});
