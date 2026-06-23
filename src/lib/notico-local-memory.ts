export interface NoticoLocalMemory {
  preferredName: string;
  likes: string;
  dislikes: string;
  preferences: string;
  updatedAt?: string;
}

export const NOTICO_LOCAL_MEMORY_KEY = "noticomax_notico_local_memory";
export const NOTICO_LOCAL_MEMORY_EVENT = "notico-local-memory-changed";

const MAX_FIELD_LENGTH = 800;

const EMPTY_MEMORY: NoticoLocalMemory = {
  preferredName: "",
  likes: "",
  dislikes: "",
  preferences: "",
};

const SENSITIVE_PATTERNS = [
  /\b(password|passcode|pin|secret|api[_ -]?key|token|private[_ -]?key|credential)\b/i,
  /\b(credit card|card number|cvv|cvc|social security|ssn)\b/i,
  /\b(sk|pk|rk|ghp|gho|github_pat|xox[baprs])_[A-Za-z0-9_-]{12,}\b/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
];

function cleanField(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}

export function emptyNoticoLocalMemory(): NoticoLocalMemory {
  return { ...EMPTY_MEMORY };
}

export function normalizeNoticoLocalMemory(
  input: Partial<NoticoLocalMemory> | null | undefined,
): NoticoLocalMemory {
  return {
    preferredName: cleanField(input?.preferredName),
    likes: cleanField(input?.likes),
    dislikes: cleanField(input?.dislikes),
    preferences: cleanField(input?.preferences),
    updatedAt: input?.updatedAt,
  };
}

export function hasNoticoLocalMemory(memory: NoticoLocalMemory): boolean {
  return Boolean(
    memory.preferredName.trim() ||
      memory.likes.trim() ||
      memory.dislikes.trim() ||
      memory.preferences.trim(),
  );
}

export function containsSensitiveNoticoMemory(memory: NoticoLocalMemory): boolean {
  const text = [
    memory.preferredName,
    memory.likes,
    memory.dislikes,
    memory.preferences,
  ].join("\n");
  return containsSensitiveText(text);
}

export function containsSensitiveText(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

export function buildNoticoLocalMemorySummary(memory: NoticoLocalMemory): string {
  const normalized = normalizeNoticoLocalMemory(memory);
  const lines: string[] = [];
  if (normalized.preferredName) lines.push(`Preferred name: ${normalized.preferredName}`);
  if (normalized.likes) lines.push(`Likes: ${normalized.likes}`);
  if (normalized.dislikes) lines.push(`Dislikes: ${normalized.dislikes}`);
  if (normalized.preferences) lines.push(`Preferences/notes: ${normalized.preferences}`);
  return lines.join("\n").slice(0, 1800);
}

function emitMemoryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTICO_LOCAL_MEMORY_EVENT));
}

export function getNoticoLocalMemory(): NoticoLocalMemory {
  if (typeof window === "undefined") return emptyNoticoLocalMemory();
  const raw = window.localStorage.getItem(NOTICO_LOCAL_MEMORY_KEY);
  if (!raw) return emptyNoticoLocalMemory();
  try {
    return normalizeNoticoLocalMemory(JSON.parse(raw) as Partial<NoticoLocalMemory>);
  } catch {
    return emptyNoticoLocalMemory();
  }
}

export function saveNoticoLocalMemory(input: NoticoLocalMemory): NoticoLocalMemory {
  if (typeof window === "undefined") return normalizeNoticoLocalMemory(input);
  const memory = {
    ...normalizeNoticoLocalMemory(input),
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(NOTICO_LOCAL_MEMORY_KEY, JSON.stringify(memory));
  emitMemoryChanged();
  return memory;
}

export function clearNoticoLocalMemory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(NOTICO_LOCAL_MEMORY_KEY);
  emitMemoryChanged();
}
