import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createPlugin } from "../src/index.mjs";

test("shutdown handlers finish even though the island closes stdin right after shutdown", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const order = [];
  let exited;
  const done = new Promise((resolve) => {
    exited = resolve;
  });
  const plugin = createPlugin({
    input,
    output,
    exit: (code) => {
      order.push(`exit ${code}`);
      exited();
    },
  });
  plugin.onShutdown(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    order.push("handler done");
  });
  input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "shutdown", params: {} })}\n`);
  input.end();
  await done;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(order[0], "handler done");
  assert.ok(order.slice(1).every((entry) => entry === "exit 0"));
});

test("closing stdin without shutdown exits at once", async () => {
  const input = new PassThrough();
  let code;
  await new Promise((resolve) => {
    createPlugin({
      input,
      output: new PassThrough(),
      exit: (value) => {
        code = value;
        resolve();
      },
    });
    input.end();
  });
  assert.equal(code, 0);
});
