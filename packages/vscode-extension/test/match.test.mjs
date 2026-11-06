import assert from "node:assert/strict";
import test from "node:test";

import match from "../match.js";

const { parseQuery, pickTerminal } = match;

test("the island's link gives the session's process chain and title", () => {
  assert.deepEqual(parseQuery("pids=120,88,x,-3,4&title=%E2%9C%B3%20%E4%BF%AE%E5%A4%8D"), {
    pids: [120, 88, 4],
    title: "✳ 修复",
  });
  assert.deepEqual(parseQuery(""), { pids: [], title: "" });
});

test("the terminal whose shell is in the session's process chain is picked first", () => {
  const terminals = [
    { processId: 10, name: "pwsh" },
    { processId: 88, name: "pwsh" },
    { processId: undefined, name: "修复登录" },
  ];
  assert.equal(pickTerminal(terminals, { pids: [120, 88, 4], title: "修复登录" }), 1);
});

test("without a process, only a terminal that alone carries the title is picked", () => {
  const terminals = [
    { processId: 1, name: "✳ 修复登录问题" },
    { processId: 2, name: "pwsh" },
    { processId: 3, name: "pwsh" },
  ];
  assert.equal(pickTerminal(terminals, { pids: [], title: "修复登录问题" }), 0);
  assert.equal(pickTerminal(terminals, { pids: [], title: "修复登录…" }), 0);
  assert.equal(pickTerminal(terminals, { pids: [], title: "修复登录" }), -1);
  assert.equal(pickTerminal(terminals, { pids: [], title: "pwsh" }), -1);
  assert.equal(pickTerminal(terminals, { pids: [], title: "✳" }), -1);
  assert.equal(pickTerminal([], { pids: [5], title: "修复登录问题" }), -1);
});
