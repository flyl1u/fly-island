import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { cargoTargetDir } from "../../scripts/release/cargo-target.mjs";

test("an explicit CARGO_TARGET_DIR wins over Cargo's own answer", () => {
  const saved = process.env.CARGO_TARGET_DIR;
  process.env.CARGO_TARGET_DIR = "some/target";
  try {
    assert.equal(cargoTargetDir(), resolve("some/target"));
  } finally {
    if (saved === undefined) delete process.env.CARGO_TARGET_DIR;
    else process.env.CARGO_TARGET_DIR = saved;
  }
});

test("without it, the directory Cargo reports is used", () => {
  const saved = process.env.CARGO_TARGET_DIR;
  delete process.env.CARGO_TARGET_DIR;
  try {
    assert.ok(cargoTargetDir().length > 0);
  } finally {
    if (saved !== undefined) process.env.CARGO_TARGET_DIR = saved;
  }
});
