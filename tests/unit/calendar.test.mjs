import assert from "node:assert/strict";
import test from "node:test";
import { STARTED_HOLD_MS, nextChangeAt, upcomingMeeting } from "../../src/features/calendar/upcoming.ts";
import { DEFAULT_CALENDAR_SETTINGS, normalizeCalendarSettings } from "../../src/features/calendar/calendarSettings.ts";

const MIN = 60_000;
const event = (title, startMs, endMs, fields = {}) => ({ uid: title, title, startMs, endMs, allDay: false, location: null, meetingLink: null, calendar: "工作", ...fields });

test("the countdown starts within the reminder window and holds a started meeting for five minutes", () => {
  const now = 1_000 * MIN;
  const standup = event("站会", now + 9.5 * MIN, now + 20 * MIN);
  assert.deepEqual(upcomingMeeting([standup], now, 10), { event: standup, minutes: 10 });
  assert.equal(upcomingMeeting([standup], now, 5), null);
  assert.equal(upcomingMeeting([standup], now, 0), null);
  assert.deepEqual(upcomingMeeting([standup], standup.startMs + 2 * MIN, 10), { event: standup, minutes: 0 });
  assert.equal(upcomingMeeting([standup], standup.startMs + STARTED_HOLD_MS, 10), null);
  assert.deepEqual(upcomingMeeting([standup], standup.startMs - 10_000, 10)?.minutes, 1);
});

test("an upcoming meeting beats one already going; all-day and zero-length events do not count", () => {
  const now = 1_000 * MIN;
  const going = event("周会", now - MIN, now + 30 * MIN);
  const next = event("1:1", now + 4 * MIN, now + 30 * MIN);
  assert.equal(upcomingMeeting([going, next], now, 10)?.event, next);
  assert.equal(upcomingMeeting([going], now, 10)?.event, going);
  assert.equal(upcomingMeeting([event("假期", now - MIN, now + 60 * MIN, { allDay: true })], now, 10), null);
  assert.equal(upcomingMeeting([event("提醒", now + MIN, now + MIN)], now, 10), null);
});

test("the island wakes at the next minute while counting down, else at the next window start", () => {
  const now = 1_000 * MIN;
  const later = event("评审", now + 60 * MIN, now + 90 * MIN);
  assert.equal(nextChangeAt([later], now, 10), later.startMs - 10 * MIN);
  const soon = event("站会", now + 5 * MIN + 20_000, now + 20 * MIN);
  assert.equal(nextChangeAt([soon], now, 10), now + 20_000);
  assert.equal(nextChangeAt([soon], now, 0), null);
  assert.equal(nextChangeAt([], now, 10), null);
});

test("calendar settings keep only known values", () => {
  assert.deepEqual(normalizeCalendarSettings({}), DEFAULT_CALENDAR_SETTINGS);
  assert.deepEqual(normalizeCalendarSettings({ calendarEnabled: false, calendarRemindMinutes: 30, calendarShowTitle: false }), {
    calendarEnabled: false,
    calendarRemindMinutes: 30,
    calendarShowTitle: false,
  });
  assert.equal(normalizeCalendarSettings({ calendarRemindMinutes: 7 }).calendarRemindMinutes, 10);
});
