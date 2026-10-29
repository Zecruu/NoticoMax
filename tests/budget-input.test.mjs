import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  parseBudgetAmount,
  defaultExpenseDate,
  expenseDateToIso,
  billDueDate,
} from "../src/lib/budget/input.ts";

test("bill dates accept local date-only values and legacy timestamps", () => {
  assert.equal(billDueDate("2026-11-03").getDate(), 3);
  assert.equal(billDueDate("2026-11-03").getHours(), 12);
  assert.equal(
    billDueDate("2026-11-03T14:00:00Z").toISOString(),
    "2026-11-03T14:00:00.000Z"
  );
});

test("money accepts whole dollars or cents, rejecting ambiguous and nonfinite input", () => {
  for (const [input, expected] of [
    ["0", 0],
    ["12", 12],
    [" 12.50 ", 12.5],
    ["0.01", 0.01],
    [".50", 0.5],
    ["12.", 12],
  ])
    assert.equal(parseBudgetAmount(input), expected);
  for (const input of [
    "",
    " ",
    "-5",
    "1.234",
    "Infinity",
    "1e4",
    "50 gas",
    "1,000",
    "9007199254740992",
  ])
    assert.equal(parseBudgetAmount(input), null, input);
});

test("expense defaults to today in the current month and a visible first day otherwise", () => {
  const now = new Date(2026, 9, 29, 15);
  assert.equal(defaultExpenseDate("2026-10", now), "2026-10-29");
  assert.equal(defaultExpenseDate("2026-09", now), "2026-09-01");
  assert.equal(defaultExpenseDate("2027-01", now), "2027-01-01");
});

test("dates must exist and belong to the viewed month", () => {
  for (const value of [
    "2026-02-29",
    "2026-02-30",
    "2026-01-31",
    "2026-02-00",
    "2026-2-01",
    "bad",
  ])
    assert.equal(expenseDateToIso(value, "2026-02"), null, value);
  assert.ok(expenseDateToIso("2028-02-29", "2028-02"));
});

test("first and last day remain in the selected month across device time zones", () => {
  for (const TZ of [
    "America/La_Paz",
    "America/New_York",
    "Pacific/Kiritimati",
    "Pacific/Pago_Pago",
  ]) {
    const script = `import { expenseDateToIso } from './src/lib/budget/input.ts'; for (const value of ['2026-11-01', '2026-11-30']) { const date = new Date(expenseDateToIso(value, '2026-11')); if (date.getMonth() !== 10 || date.getDate() !== Number(value.slice(-2))) process.exit(1); }`;
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      { env: { ...process.env, TZ }, stdio: "pipe" }
    );
  }
});
