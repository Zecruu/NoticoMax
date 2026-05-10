import ICAL from "ical.js";
import db, { type LocalItem, type RecurrenceRule } from "@/lib/db/indexed-db";
import { getDeviceId } from "@/lib/device";

export interface ParsedIcsEvent {
  uid: string;
  title: string;
  description: string;
  startISO: string;
  recurrence: RecurrenceRule;
}

/** Map an iCal RRULE FREQ to our simplified recurrence rule. */
function rruleToRecurrence(rrule: ICAL.Recur | null): RecurrenceRule {
  if (!rrule) return "none";
  switch (rrule.freq) {
    case "DAILY": return "daily";
    case "WEEKLY": return "weekly";
    case "MONTHLY": return "monthly";
    case "YEARLY": return "yearly";
    default: return "none";
  }
}

/** Parse a .ics file's text contents into a list of events. */
export function parseIcs(text: string): ParsedIcsEvent[] {
  const jcal = ICAL.parse(text);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents("vevent");

  const out: ParsedIcsEvent[] = [];
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (!event.startDate) continue;

    const startISO = event.startDate.toJSDate().toISOString();
    let recurrence: RecurrenceRule = "none";
    if (event.isRecurring()) {
      const rrule = vevent.getFirstPropertyValue("rrule");
      if (rrule instanceof ICAL.Recur) {
        recurrence = rruleToRecurrence(rrule);
      }
    }

    out.push({
      uid: event.uid || crypto.randomUUID(),
      title: event.summary || "(untitled event)",
      description: event.description || "",
      startISO,
      recurrence,
    });
  }
  return out;
}

/**
 * Insert parsed ICS events as reminder items in IndexedDB.
 * Skips events whose UID is already present (idempotent re-imports).
 */
export async function importIcsEvents(events: ParsedIcsEvent[]): Promise<{ inserted: number; skipped: number }> {
  const deviceId = getDeviceId();
  const existing = await db.items
    .where("type").equals("reminder")
    .toArray();
  const existingTitles = new Set(
    existing
      .filter((i) => !i.deleted && i.reminderDate)
      .map((i) => `${i.title}|${i.reminderDate}`),
  );

  let inserted = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const ev of events) {
    const dedupeKey = `${ev.title}|${ev.startISO}`;
    if (existingTitles.has(dedupeKey)) {
      skipped++;
      continue;
    }

    const item: LocalItem = {
      clientId: crypto.randomUUID(),
      type: "reminder",
      title: ev.title,
      content: ev.description,
      reminderDate: ev.startISO,
      reminderCompleted: false,
      recurrence: ev.recurrence,
      tags: ["imported"],
      pinned: false,
      deviceId,
      deleted: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.items.add(item);
    inserted++;
  }

  return { inserted, skipped };
}
