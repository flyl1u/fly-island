import assert from "node:assert/strict";
import test from "node:test";
import { todoEvents } from "../../src/features/calendar/todoEvents.ts";

const now = new Date(2026, 10, 7, 9, 0).getTime();
const at = (h, m) => new Date(2026, 10, 7, h, m).getTime();
const todo = (title, completed = false) => ({ id: title, title, completed });

test("todos that start with a time become today's events", () => {
  const events = todoEvents(
    [todo("15:00 周会"), todo("9:30-10:15 站会 https://meeting.tencent.com/dm/abc"), todo("14：00～15：30 评审"), todo("写周报"), todo("16:00 已完成", true), todo("25:00 不对")],
    now,
    "任务清单",
  );
  assert.deepEqual(
    events.map((event) => [event.title, event.startMs, event.endMs, event.meetingLink, event.calendar]),
    [
      ["周会", at(15, 0), at(15, 30), null, "任务清单"],
      ["站会", at(9, 30), at(10, 15), "https://meeting.tencent.com/dm/abc", "任务清单"],
      ["评审", at(14, 0), at(15, 30), null, "任务清单"],
    ],
  );
  assert.deepEqual(todoEvents([todo("15:00")], now, "x"), []);
});
