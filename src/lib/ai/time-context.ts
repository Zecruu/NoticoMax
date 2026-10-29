/** Validate browser timezone metadata before including it in instructions. */
export function normalizeTimeZone(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 80) return undefined;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function schedulingTimeContext(
  timeZone: unknown,
  now: Date = new Date()
): string {
  const zone = normalizeTimeZone(timeZone);
  const utc = `Current UTC date and time: ${now.toISOString()}.`;
  if (!zone) {
    return `${utc} The device timezone is unavailable. Before creating a reminder or alarm, ask for the user's timezone unless they have explicitly supplied one in this conversation. Never assume UTC is the user's local time.`;
  }
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);
  return `${utc} The user's device timezone is ${zone}; their current local date and time is ${local}. Interpret dates and times such as '9am' in this timezone unless the user explicitly chooses another. Apply the timezone's offset on the scheduled date, including daylight-saving changes. Tool remindAt must include Z or an explicit UTC offset.`;
}
