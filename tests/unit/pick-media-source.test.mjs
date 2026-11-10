import assert from "node:assert/strict";
import test from "node:test";
import { pickMediaSource } from "../../src/features/media/pickMediaSource.ts";

const order = [{ id: "qq" }, { id: "netease" }, { id: "chrome" }];

test("a playing player wins over a paused one ranked above it", () => {
  const sessions = [{ id: "qq", playing: false }, { id: "netease", playing: true }];
  assert.equal(pickMediaSource(sessions, order), "netease");
});

test("among players playing at once, the one ranked first wins", () => {
  const sessions = [{ id: "chrome", playing: true }, { id: "netease", playing: true }];
  assert.equal(pickMediaSource(sessions, order), "netease");
  assert.equal(pickMediaSource(sessions, [{ id: "chrome" }, { id: "netease" }]), "chrome");
});

test("with none playing the first open one is followed; none listed gives null", () => {
  assert.equal(pickMediaSource([{ id: "chrome", playing: false }, { id: "netease", playing: false }], order), "netease");
  assert.equal(pickMediaSource([{ id: "spotify", playing: true }], order), null);
  assert.equal(pickMediaSource([], order), null);
});
