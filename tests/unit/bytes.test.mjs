import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes } from "../../src/utils/bytes.ts";

test("byte counts read as B, KB, MB and GB", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(820), "820 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(12.4 * 1024), "12 KB");
  assert.equal(formatBytes(2_150_400), "2.1 MB");
  assert.equal(formatBytes(5 * 1024 ** 3), "5.0 GB");
  assert.equal(formatBytes(Number.NaN), "0 B");
  assert.equal(formatBytes(-5), "0 B");
});
