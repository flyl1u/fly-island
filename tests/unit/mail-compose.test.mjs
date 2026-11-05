import assert from "node:assert/strict";
import test from "node:test";
import { splitRecipients } from "../../src/features/messages/mail/compose.ts";

test("recipients split on commas, semicolons (also full-width) and spaces", () => {
  assert.deepEqual(splitRecipients("a@x.com, b@y.com；c@z.com，d@w.com; e@v.com f@u.com"), ["a@x.com", "b@y.com", "c@z.com", "d@w.com", "e@v.com", "f@u.com"]);
  assert.deepEqual(splitRecipients("  "), []);
  assert.deepEqual(splitRecipients(""), []);
});
