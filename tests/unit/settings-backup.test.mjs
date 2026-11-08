import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_KEYS, backupFileName, buildBackup, parseBackup } from "../../src/features/settings-backup/backup.ts";

test("a backup holds the set settings keys and nothing else", () => {
  const stored = {
    "focusd-island-settings": '{"opacity":95}',
    "focusd-island-locale": "en",
    "focusd-island-todos": "[secret todo]",
    "focusd-island-position": '{"x":1,"y":2}',
  };
  const backup = buildBackup((key) => stored[key] ?? null, new Date("2026-11-06T06:30:00Z"));
  assert.deepEqual(backup, {
    app: "fly-island",
    version: 1,
    exportedAt: "2026-11-06T06:30:00.000Z",
    keys: { "focusd-island-settings": '{"opacity":95}', "focusd-island-locale": "en" },
  });
  // Todos, window positions, migration markers and one-off requests are never in a backup.
  for (const key of ["focusd-island-todos", "focusd-island-position", "focusd-island-todos-migrated-v1", "focusd-island-settings-focus"]) {
    assert.ok(!BACKUP_KEYS.includes(key), key);
  }
});

test("a backup carries the AI Agent approval and phone push choices and lyrics offsets", () => {
  for (const key of ["focusd-island-agent-approval", "focusd-island-agent-push", "focusd-island-lyrics-offsets"]) {
    assert.ok(BACKUP_KEYS.includes(key), key);
  }
  // What sessions were looked at or removed is per-computer state, not a preference.
  for (const key of ["focusd-island-agent-seen-turns", "focusd-island-agent-hidden-sessions"]) {
    assert.ok(!BACKUP_KEYS.includes(key), key);
  }
});

test("backup files are named by local date and time", () => {
  assert.equal(backupFileName(new Date(2026, 10, 6, 9, 5)), "fly-island-settings-2026-11-06-0905.json");
});

test("restoring takes known text keys and refuses other files", () => {
  const file = JSON.stringify({
    app: "fly-island",
    version: 1,
    keys: { "focusd-island-locale": "en", "focusd-island-todos": "[x]", "focusd-island-settings": { opacity: 1 } },
  });
  assert.deepEqual(parseBackup(`﻿${file}`), { keys: { "focusd-island-locale": "en" } });
  assert.deepEqual(parseBackup("not json"), { problem: "notJson" });
  assert.deepEqual(parseBackup('{"app":"other","keys":{}}'), { problem: "notBackup" });
  assert.deepEqual(parseBackup('{"app":"fly-island","version":2,"keys":{}}'), { problem: "newerVersion" });
  assert.deepEqual(parseBackup('{"app":"fly-island","version":1,"keys":{"focusd-island-todos":"[x]"}}'), { problem: "empty" });
});
