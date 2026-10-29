import type { ItemType, LocalItem, RecurrenceRule } from "@/lib/db/indexed-db";

export type ItemInput = Omit<
  LocalItem,
  "id" | "clientId" | "createdAt" | "updatedAt" | "deleted"
>;
export interface ItemDraft {
  type: ItemType;
  title: string;
  content: string;
  url: string;
  reminderDate: string;
  recurrence: RecurrenceRule;
  tags: string[];
  pinned: boolean;
  folderId?: string;
}

export function normalizeWebUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed);
  try {
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname)
      return null;
    if (
      !hasScheme &&
      !url.hostname.includes(".") &&
      url.hostname !== "localhost"
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function plainTextLine(line: string): string {
  return line
    .replace(/^\s*(?:[-*+] \[[ xX]\] |[-*+] |\d+\. |[a-z]\. |#+\s+)/, "")
    .trim();
}

export function linkLabel(value: string): string {
  const normalized = normalizeWebUrl(value);
  return normalized
    ? new URL(normalized).hostname.replace(/^www\./, "")
    : value;
}

export type PreparedDraft =
  | { kind: "empty" }
  | {
      kind: "invalid";
      field: "url" | "reminderDate" | "content";
      message: string;
    }
  | { kind: "ready"; item: ItemInput };

export function prepareItemDraft(
  draft: ItemDraft,
  original?: LocalItem | null
): PreparedDraft {
  const content = draft.content.trim();
  if (
    !draft.title.trim() &&
    !content &&
    !(draft.type === "url" && draft.url.trim())
  ) {
    return original
      ? {
          kind: "invalid",
          field: "content",
          message: "Add a title or some text before saving.",
        }
      : { kind: "empty" };
  }
  const url = draft.type === "url" ? normalizeWebUrl(draft.url) : undefined;
  if (draft.type === "url" && !url) {
    return {
      kind: "invalid",
      field: "url",
      message: "Enter a website address, like example.com.",
    };
  }
  let reminderDate: string | undefined;
  if (draft.type === "reminder" && draft.reminderDate) {
    const date = new Date(draft.reminderDate);
    if (!Number.isFinite(date.getTime())) {
      return {
        kind: "invalid",
        field: "reminderDate",
        message: "Choose a valid date and time.",
      };
    }
    reminderDate = date.toISOString();
  }
  const title =
    draft.title.trim() ||
    (draft.type === "url" && url
      ? linkLabel(url)
      : content.split("\n").map(plainTextLine).find(Boolean)?.slice(0, 60)) ||
    "Untitled note";
  return {
    kind: "ready",
    item: {
      type: draft.type,
      title,
      content,
      url: url || undefined,
      reminderDate,
      reminderCompleted: original?.reminderCompleted ?? false,
      recurrence: draft.type === "reminder" ? draft.recurrence : undefined,
      tags: [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))],
      pinned: draft.pinned,
      color: original?.color,
      folderId: draft.folderId || undefined,
    },
  };
}

export function notePreview(content: string, title: string): string {
  return content
    .split("\n")
    .map(plainTextLine)
    .filter((line) => line && line !== title)
    .join(" ");
}

export function hasItemChanges(item: ItemInput, original: LocalItem): boolean {
  return Object.entries(item).some(([key, value]) => {
    const previous =
      key === "recurrence" && item.type === "reminder"
        ? original.recurrence ?? "none"
        : original[key as keyof LocalItem];
    return JSON.stringify(value) !== JSON.stringify(previous);
  });
}

export function checklistTasks(
  content: string
): { index: number; text: string; checked: boolean }[] {
  // Fenced code examples are text, not interactive tasks.
  let fence: string | null = null;
  const tasks: { index: number; text: string; checked: boolean }[] = [];
  for (const line of content.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (
        fence[0] === marker[1][0] &&
        marker[1].length >= fence.length &&
        !line.slice(marker[0].length).trim()
      )
        fence = null;
      continue;
    }
    if (fence) continue;
    const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)/);
    if (task)
      tasks.push({
        index: tasks.length,
        checked: task[1] !== " ",
        text: task[2],
      });
  }
  return tasks;
}

export function toggleChecklistTask(content: string, index: number): string {
  let fence: string | null = null;
  let current = 0;
  return content
    .split("\n")
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (
          fence[0] === marker[1][0] &&
          marker[1].length >= fence.length &&
          !line.slice(marker[0].length).trim()
        )
          fence = null;
        return line;
      }
      if (fence || !/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) return line;
      if (current++ !== index) return line;
      return line.replace(
        /^(\s*[-*+]\s+\[)([ xX])(\])/,
        (_, before, mark, after) => before + (mark === " " ? "x" : " ") + after
      );
    })
    .join("\n");
}
