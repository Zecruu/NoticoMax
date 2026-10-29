import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { nextReminderDate, reminderTiming, reminderDateLabel, reminderOccurrences } from "../src/lib/items/reminder-schedule.ts";

const now = new Date(2026, 9, 29, 15, 20);
const iso = (year, month, day, hour = 9, minute = 0) => new Date(year, month - 1, day, hour, minute).toISOString();
const parts = (date) => date && [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];

test("passed annual birthday displays next year, without changing its saved date", () => {
  const item = { reminderDate: iso(2025, 5, 13, 1), recurrence: "yearly" };
  const before = JSON.stringify(item);
  const timing = reminderTiming(item, now);
  assert.deepEqual(parts(timing.date), [2027, 5, 13, 1, 0]);
  assert.equal(timing.overdue, false);
  assert.equal(timing.repeatLabel, "Repeats every year");
  assert.match(reminderDateLabel(timing, now, "en-US"), /^Next · .*May 13, 2027$/);
  assert.equal(JSON.stringify(item), before);
});

test("upcoming annual dates stay in this year and a future series never starts early", () => {
  assert.deepEqual(parts(nextReminderDate(iso(2020, 11, 3), "yearly", now)), [2026, 11, 3, 9, 0]);
  assert.deepEqual(parts(nextReminderDate(iso(2028, 5, 13), "yearly", now)), [2028, 5, 13, 9, 0]);
});

test("annual date rolls forward after its time, including later on the same day", () => {
  assert.deepEqual(parts(nextReminderDate(iso(2020, 10, 29, 9), "yearly", now)), [2027, 10, 29, 9, 0]);
  assert.deepEqual(parts(nextReminderDate(iso(2020, 10, 29, 16), "yearly", now)), [2026, 10, 29, 16, 0]);
  assert.equal(nextReminderDate(iso(2020, 10, 29, 16), "yearly", new Date(2026, 9, 29, 16)).getTime(), new Date(2026, 9, 29, 16).getTime());
});

test("one-time reminders retain overdue state and completed reminders retain their saved date", () => {
  const original = iso(2025, 5, 13);
  const overdue = reminderTiming({ reminderDate: original }, now);
  assert.equal(overdue.overdue, true);
  assert.match(reminderDateLabel(overdue, now, "en-US"), /^Overdue/);
  const completed = reminderTiming({ reminderDate: original, recurrence: "yearly", reminderCompleted: true }, now);
  assert.equal(completed.overdue, false);
  assert.equal(completed.date.toISOString(), original);
  assert.match(reminderDateLabel(completed, now, "en-US"), /^Completed/);
});

test("short months clamp monthly reminders but restore the original day afterward", () => {
  const original = iso(2026, 1, 31);
  assert.deepEqual(parts(nextReminderDate(original, "monthly", new Date(2026, 1, 1))), [2026, 2, 28, 9, 0]);
  assert.deepEqual(parts(nextReminderDate(original, "monthly", new Date(2026, 1, 28, 10))), [2026, 3, 31, 9, 0]);
});

test("leap birthdays use February 28 in non-leap years and restore February 29", () => {
  const original = iso(2024, 2, 29);
  assert.deepEqual(parts(nextReminderDate(original, "yearly", now)), [2027, 2, 28, 9, 0]);
  assert.deepEqual(parts(nextReminderDate(original, "yearly", new Date(2028, 0, 1))), [2028, 2, 29, 9, 0]);
});

test("daily and weekly series jump directly from old anchors and preserve local time", () => {
  assert.deepEqual(parts(nextReminderDate(iso(2000, 1, 1, 9, 30), "daily", now)), [2026, 10, 30, 9, 30]);
  assert.deepEqual(parts(nextReminderDate(iso(2020, 10, 29, 9), "weekly", now)), [2026, 11, 5, 9, 0]);
});

test("missing or invalid dates do not render Invalid Date or invent a schedule", () => {
  for (const reminderDate of [undefined, "", "not-a-date"]) {
    const timing = reminderTiming({ reminderDate, recurrence: "yearly" }, now);
    assert.equal(timing.date, null);
    assert.equal(timing.overdue, false);
    assert.equal(reminderDateLabel(timing, now), "No date set");
  }
});

test("local today/tomorrow labels and explicit years distinguish scheduled dates from edit dates", () => {
  assert.match(reminderDateLabel(reminderTiming({ reminderDate: iso(2026, 10, 29, 16) }, now), now, "en-US"), /^Today · .*2026$/);
  assert.match(reminderDateLabel(reminderTiming({ reminderDate: iso(2026, 10, 30) }, now), now, "en-US"), /^Tomorrow · .*2026$/);
});

test("calendar expansion includes the last day's time and matches annual/monthly next dates", () => {
  const from = new Date(2027, 1, 1);
  const through = new Date(2027, 2, 1, 0, 0, 0, -1);
  assert.deepEqual(reminderOccurrences(iso(2024, 2, 29), "yearly", from, through).map(parts), [[2027, 2, 28, 9, 0]]);
  assert.deepEqual(reminderOccurrences(iso(2026, 1, 31), "monthly", from, through).map(parts), [[2027, 2, 28, 9, 0]]);
  assert.equal(reminderOccurrences(iso(2020, 1, 1, 23, 30), "daily", from, through).length, 28);
  assert.equal(reminderOccurrences(iso(2020, 1, 1), "none", from, through).length, 0);
});

test("daily and weekly recurrence preserve wall-clock time across US daylight-saving changes", () => {
  const module = new URL("../src/lib/items/reminder-schedule.ts", import.meta.url).href;
  const script = `import { nextReminderDate } from ${JSON.stringify(module)};
    const daily = nextReminderDate(new Date(2026,2,7,9).toISOString(), 'daily', new Date(2026,2,8));
    const weekly = nextReminderDate(new Date(2026,9,25,9).toISOString(), 'weekly', new Date(2026,10,1));
    console.log(JSON.stringify([daily.toISOString(),weekly.toISOString()]));`;
  const result = execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result.trim()), ["2026-03-08T13:00:00.000Z", "2026-11-01T14:00:00.000Z"]);
});
