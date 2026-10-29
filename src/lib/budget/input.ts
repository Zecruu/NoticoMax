/** Budget inputs use local calendar dates and cents, independent of UTC offsets. */
export function parseBudgetAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(trimmed)) return null;
  const amount = Number(trimmed);
  return Number.isFinite(amount) &&
    Number.isSafeInteger(Math.round(amount * 100))
    ? amount
    : null;
}

export function defaultExpenseDate(monthKey: string, now = new Date()): string {
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
  return `${monthKey}-${
    current === monthKey ? String(now.getDate()).padStart(2, "0") : "01"
  }`;
}

export function expenseDateToIso(
  value: string,
  monthKey: string
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 7) !== monthKey)
    return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    return null;
  return date.toISOString();
}

export function billDueDate(value: string): Date {
  return new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  );
}
