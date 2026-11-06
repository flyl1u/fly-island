import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { LANE_PORT_BASE, laneNumber, lanePreview, targetDir } from "../../scripts/build-dirs.mjs";
import { isInUse, moveAsideIfRunning, removeOldExes } from "../../scripts/build-exe.mjs";
import { previewConfig } from "../../scripts/dev-lane.mjs";

test("a lane's number comes from its folder under fly-island-lanes", () => {
  assert.equal(laneNumber("E:\\Projects\\fly-island-lanes\\2"), 2);
  assert.equal(laneNumber("/e/Projects/fly-island-lanes/17/"), 17);
  assert.equal(laneNumber("E:\\Projects\\fly-island"), null);
  assert.equal(laneNumber("E:\\Projects\\fly-island-lanes\\x"), null);
  assert.equal(laneNumber("E:\\Projects\\other\\2"), null);
});

test("each lane previews on its own port, identifier and build folder, apart from the user's", () => {
  const main = path.join("E:", "Projects", "fly-island");
  const two = lanePreview(main, 2);
  assert.equal(two.port, LANE_PORT_BASE + 2);
  assert.notEqual(two.port, 1420, "the main dev server");
  assert.notEqual(two.port, 1460, "the regression runner");
  assert.equal(two.identifier, "com.focusd.island.lane-2");
  assert.equal(two.target, targetDir(main, "lane-2"));
  assert.notEqual(lanePreview(main, 3).port, two.port);
  const config = previewConfig(two.port);
  assert.equal(config.build.devUrl, `http://localhost:${two.port}`);
  assert.doesNotMatch(config.build.beforeDevCommand, /stop-running-island/, "the user's island keeps running");
  assert.match(config.build.beforeDevCommand, new RegExp(`--port ${two.port} --strictPort`));
});

test("a running exe is moved aside and a new one can take its place", { skip: process.platform !== "win32" }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "build-exe-"));
  const exe = path.join(dir, "focusd-island.exe");
  try {
    copyFileSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "ping.exe"), exe);
    assert.equal(isInUse(exe), false);
    assert.equal(moveAsideIfRunning(exe), null, "not running: left in place");

    const running = spawn(exe, ["-n", "30", "127.0.0.1"], { stdio: "ignore", windowsHide: true });
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(isInUse(exe), true);
    const aside = moveAsideIfRunning(exe, new Date("2026-11-06T06:00:00Z"));
    assert.equal(path.basename(aside), "focusd-island.exe.old-20261106060000000");
    assert.equal(existsSync(exe), false);
    writeFileSync(exe, "new build");
    assert.equal(removeOldExes(dir), 1, "still running: kept");
    running.kill();
    await new Promise((resolve) => running.on("exit", resolve));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(removeOldExes(dir), 0, "no longer running: deleted");
    assert.deepEqual(readdirSync(dir), ["focusd-island.exe"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a build lock counts while its process runs and for under an hour", async () => {
  const { lockHeld } = await import("../../scripts/build-exe.mjs");
  const now = 10 * 60 * 60 * 1000;
  assert.equal(lockHeld({ pid: 1, since: now - 1000 }, now, () => true), true);
  assert.equal(lockHeld({ pid: 1, since: now - 1000 }, now, () => false), false);
  assert.equal(lockHeld({ pid: 1, since: now - 61 * 60 * 1000 }, now, () => true), false);
  assert.equal(lockHeld(null, now, () => true), false);
});

test("the shortcut script quotes the exe path for PowerShell", async () => {
  const { shortcutScript } = await import("../../scripts/build-exe.mjs");
  const script = shortcutScript(String.raw`C:\it's\focusd-island.exe`);
  assert.ok(script.startsWith(String.raw`$exe = 'C:\it''s\focusd-island.exe'`));
  assert.match(script, /fly-island\.lnk/);
});
