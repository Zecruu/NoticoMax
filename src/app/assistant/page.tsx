"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Send,
  Mic,
  MicOff,
  Sparkles,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  Brain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecondaryBottomNav } from "@/components/layout/secondary-nav";
import type { RecurrenceRule } from "@/lib/db/indexed-db";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createItem } from "@/lib/sync/sync-engine";
import { toast } from "@/lib/native-toast";
import {
  buildNoticoLocalMemorySummary,
  emptyNoticoLocalMemory,
  getNoticoLocalMemory,
  hasNoticoLocalMemory,
  NOTICO_LOCAL_MEMORY_EVENT,
  NOTICO_LOCAL_MEMORY_KEY,
  type NoticoLocalMemory,
} from "@/lib/notico-local-memory";

interface Memory {
  id: string;
  type: string;
  content: string;
  source: string;
  confidence: number;
  pinned: boolean;
  createdAt: string;
}
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}
type Status = "loading" | "ready" | "disabled";

// --- Web Speech API (browser/webview dictation) — typed loosely since it's not
// in the standard DOM lib and is prefixed on WebKit. ---
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface PendingReminder {
  title?: string;
  dateKey?: string;
  hour?: number;
  minute?: number;
  recurrence: RecurrenceRule;
  needsRecurrenceClarification?: boolean;
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const WEEKDAY_ALIASES: Record<string, number> = {
  sunday: 0,
  sundays: 0,
  sun: 0,
  monday: 1,
  mondays: 1,
  mon: 1,
  tuesday: 2,
  tuesdays: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wednesdays: 3,
  wed: 3,
  thursday: 4,
  thursdays: 4,
  thurs: 4,
  thu: 4,
  friday: 5,
  fridays: 5,
  fri: 5,
  saturday: 6,
  saturdays: 6,
  sat: 6,
};

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateFromKey(key: string, hour = 9, minute = 0): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

function nextWeekdayDateKey(targetDay: number, forceNext = false): string {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let delta = (targetDay - base.getDay() + 7) % 7;
  if (delta === 0 && forceNext) delta = 7;
  base.setDate(base.getDate() + delta);
  return dateKey(base);
}

function formatReminderDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatReminderTime(hour: number, minute: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(dateFromKey(dateKey(new Date()), hour, minute));
}

function titleCaseTitle(value: string): string {
  const trimmed = value
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/g, "")
    .trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function parseWeekday(text: string): { day: number; pluralish: boolean } | null {
  const normalized = text.toLowerCase().replace(/[’']/g, "");
  for (const [alias, day] of Object.entries(WEEKDAY_ALIASES)) {
    const pattern = new RegExp(`\\b${alias}\\b`, "i");
    if (pattern.test(normalized)) {
      const pluralish = alias.endsWith("s") || /\b\w+days\b/i.test(normalized);
      return { day, pluralish };
    }
  }
  return null;
}

function parseDateKey(text: string): string | undefined {
  const lower = text.toLowerCase();
  const now = new Date();
  if (/\btoday\b/.test(lower)) return dateKey(now);
  if (/\btomorrow\b/.test(lower)) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return dateKey(tomorrow);
  }
  const weekday = parseWeekday(text);
  if (!weekday) return undefined;
  return nextWeekdayDateKey(weekday.day, /\bnext\b/i.test(text));
}

function parseTime(text: string): { hour: number; minute: number } | null {
  const lower = text.toLowerCase();
  if (/\bnoon\b/.test(lower)) return { hour: 12, minute: 0 };
  if (/\bmidnight\b/.test(lower)) return { hour: 0, minute: 0 };
  if (/\bmorning\b/.test(lower)) return { hour: 9, minute: 0 };
  if (/\bafternoon\b/.test(lower)) return { hour: 13, minute: 0 };
  if (/\bevening\b|\btonight\b/.test(lower)) return { hour: 18, minute: 0 };

  const meridiemMatch = lower.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] ?? "0");
    const meridiem = meridiemMatch[3].replace(/\./g, "");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return { hour, minute };
  }

  const explicit24HourMatch = lower.match(/\bat\s+([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (explicit24HourMatch) {
    return { hour: Number(explicit24HourMatch[1]), minute: Number(explicit24HourMatch[2]) };
  }

  return null;
}

function parseRecurrence(text: string): {
  recurrence?: RecurrenceRule;
  needsClarification?: boolean;
} {
  const lower = text.toLowerCase().replace(/[’']/g, "");
  if (/\b(one[-\s]?time|once|only|just this|this .+ only)\b/.test(lower)) {
    return { recurrence: "none", needsClarification: false };
  }
  if (/\b(every day|daily)\b/.test(lower)) return { recurrence: "daily" };
  if (/\b(every week|weekly)\b/.test(lower)) return { recurrence: "weekly" };
  if (/\b(every month|monthly)\b/.test(lower)) return { recurrence: "monthly" };
  if (/\b(every year|yearly|annually)\b/.test(lower)) return { recurrence: "yearly" };

  const weekday = parseWeekday(lower);
  if (weekday?.pluralish || /\bevery\s+\w+day\b/.test(lower)) {
    return { recurrence: "weekly", needsClarification: !/\bevery\b/.test(lower) };
  }

  return {};
}

function stripSchedulingWords(value: string): string {
  const weekdayPattern = WEEKDAYS.join("|");
  return value
    .replace(new RegExp(`\\b(?:on|this|next|every)\\s+(?:${weekdayPattern})s?\\b.*$`, "i"), "")
    .replace(/\b(?:today|tomorrow)\b.*$/i, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?.*$/i, "")
    .replace(/\b(?:morning|afternoon|evening|tonight|noon|midnight)\b.*$/i, "");
}

function extractReminderTitle(text: string): string | undefined {
  const withoutGreeting = text.replace(/^\s*(hi|hey|hello)\b[^,.;!?]*[,.;!?]?\s*/i, "");
  const forParts = withoutGreeting.split(/\bfor\b/i).map((part) => part.trim()).filter(Boolean);
  const candidateFromFor = forParts.length > 1 ? forParts[forParts.length - 1] : "";
  const toMatch = withoutGreeting.match(/\b(?:remind me to|reminder to|remember to|schedule)\s+(.+)$/i);
  const candidate = candidateFromFor || toMatch?.[1] || "";
  const cleaned = titleCaseTitle(
    stripSchedulingWords(candidate)
      .replace(/\bme\b/gi, "")
      .replace(/\b(on|at|for)\b$/i, "")
  );
  return cleaned || undefined;
}

function isReminderIntent(text: string): boolean {
  return /\b(remind|reminder|appointment|schedule|calendar)\b/i.test(text);
}

function parseReminderDraft(text: string): Partial<PendingReminder> {
  const time = parseTime(text);
  const recurrence = parseRecurrence(text);
  return {
    title: extractReminderTitle(text),
    dateKey: parseDateKey(text),
    hour: time?.hour,
    minute: time?.minute,
    recurrence: recurrence.recurrence,
    needsRecurrenceClarification: recurrence.needsClarification,
  };
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export default function AssistantPage() {
  const tokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [disabledReason, setDisabledReason] = useState("");

  const [name, setName] = useState("Notico");
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const [memories, setMemories] = useState<Memory[]>([]);
  const [memInput, setMemInput] = useState("");
  const [showMemory, setShowMemory] = useState(false);
  const [localMemory, setLocalMemory] = useState<NoticoLocalMemory>(() =>
    emptyNoticoLocalMemory()
  );

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [pendingReminder, setPendingReminder] = useState<PendingReminder | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speechSupported = getSpeechRecognition() !== null;
  const localMemorySummary = buildNoticoLocalMemorySummary(localMemory);

  const authFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const t = tokenRef.current ?? (await getAccessToken());
    tokenRef.current = t;
    return fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
    });
  }, []);

  const appendAssistantMessage = useCallback((content: string) => {
    setMessages((prev) =>
      prev[prev.length - 1]?.role === "assistant" && prev[prev.length - 1]?.content === content
        ? prev
        : [...prev, { role: "assistant", content }]
    );
  }, []);

  const refreshMemories = useCallback(async () => {
    const res = await authFetch("/api/assistant/memory");
    if (res.ok) {
      const j = await res.json();
      setMemories(j.memories ?? []);
    }
  }, [authFetch]);

  const refreshLocalMemory = useCallback(() => {
    setLocalMemory(getNoticoLocalMemory());
  }, []);

  useEffect(() => {
    refreshLocalMemory();
    const onStorage = (event: StorageEvent) => {
      if (event.key === NOTICO_LOCAL_MEMORY_KEY) refreshLocalMemory();
    };
    window.addEventListener(NOTICO_LOCAL_MEMORY_EVENT, refreshLocalMemory);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(NOTICO_LOCAL_MEMORY_EVENT, refreshLocalMemory);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshLocalMemory]);

  // Bootstrap: token → status → profile + memory.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getAccessToken();
      tokenRef.current = t;
      if (!t) {
        if (!cancelled) {
          setStatus("disabled");
          setDisabledReason("Sign in to use Notico.");
        }
        return;
      }
      const res = await fetch("/api/assistant/chat", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (cancelled) return;
      if (res.status === 403) {
        setStatus("disabled");
        setDisabledReason("Notico isn't available on your account yet.");
        return;
      }
      if (!res.ok) {
        setStatus("disabled");
        setDisabledReason("Notico is unavailable right now. Try again later.");
        return;
      }
      const data = await res.json();

      const [pRes, mRes] = await Promise.all([
        fetch("/api/assistant/profile", { headers: { Authorization: `Bearer ${t}` } }),
        fetch("/api/assistant/memory", { headers: { Authorization: `Bearer ${t}` } }),
      ]);
      if (cancelled) return;
      if (pRes.ok) {
        const pj = await pRes.json();
        setName(pj.profile?.displayName ?? "Notico");
      }
      if (mRes.ok) {
        const mj = await mRes.json();
        setMemories(mj.memories ?? []);
      }

      if (data.migrationsReady === false) {
        setStatus("disabled");
        setDisabledReason(
          "Notico's database isn't set up yet. Run the assistant Supabase migrations (0011 + 0012), then reload.",
        );
        return;
      }
      if (!data.configured) {
        setStatus("disabled");
        setDisabledReason(
          "Notico isn't configured yet — the GEMINI_API_KEY isn't set on the server.",
        );
        return;
      }
      if (!data.enabled && data.blockedReason) {
        setStatus("disabled");
        setDisabledReason(`Usage limit reached: ${data.blockedReason}.`);
        return;
      }
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-scroll the transcript on new messages.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const completeOrAskReminder = useCallback(
    async (draft: PendingReminder): Promise<boolean> => {
      if (!draft.title) {
        setPendingReminder(draft);
        appendAssistantMessage("What should I call the reminder?");
        return true;
      }

      if (!draft.dateKey) {
        setPendingReminder(draft);
        appendAssistantMessage(`What day should I remind you about ${draft.title}?`);
        return true;
      }

      if (draft.needsRecurrenceClarification) {
        setPendingReminder(draft);
        appendAssistantMessage(
          `Should ${draft.title} repeat every ${WEEKDAYS[dateFromKey(draft.dateKey).getDay()]} or just this once? What time should I remind you?`
        );
        return true;
      }

      if (draft.hour === undefined || draft.minute === undefined) {
        setPendingReminder(draft);
        appendAssistantMessage(`What time should I remind you about ${draft.title}?`);
        return true;
      }

      const scheduledAt = dateFromKey(draft.dateKey, draft.hour, draft.minute);
      try {
        await createItem({
          type: "reminder",
          title: draft.title,
          content: "Created by Notico.",
          reminderDate: scheduledAt.toISOString(),
          reminderCompleted: false,
          recurrence: draft.recurrence,
          tags: [],
          pinned: false,
        });
        setPendingReminder(null);
        appendAssistantMessage(
          `Done. I set a ${draft.recurrence === "weekly" ? "weekly " : ""}reminder for ${draft.title} on ${formatReminderDate(scheduledAt)} at ${formatReminderTime(draft.hour, draft.minute)}.`
        );
        toast.success("Reminder created");
      } catch {
        appendAssistantMessage("I couldn't save that reminder locally. Please try again.");
      }
      return true;
    },
    [appendAssistantMessage]
  );

  const handleLocalReminderAction = useCallback(
    async (text: string): Promise<boolean> => {
      const incoming = parseReminderDraft(text);
      const hasFollowUpSignal =
        pendingReminder &&
        (incoming.dateKey ||
          incoming.hour !== undefined ||
          incoming.recurrence ||
          /\b(only|once|weekly|every|just this|this\b|next\b|today|tomorrow)\b/i.test(text));

      if (!pendingReminder && !isReminderIntent(text)) return false;
      if (pendingReminder && !hasFollowUpSignal && !isReminderIntent(text)) return false;

      const merged: PendingReminder = {
        recurrence: pendingReminder?.recurrence ?? "none",
        ...pendingReminder,
        ...Object.fromEntries(
          Object.entries(incoming).filter(([, value]) => value !== undefined)
        ),
      };

      if (incoming.recurrence === "none") merged.needsRecurrenceClarification = false;
      if (incoming.recurrence && incoming.recurrence !== "none") {
        merged.needsRecurrenceClarification = false;
      }

      return completeOrAskReminder(merged);
    },
    [completeOrAskReminder, pendingReminder]
  );

  const toggleMic = async () => {
    const SR = getSpeechRecognition();
    if (!SR) {
      const notice =
        "Voice input is not available in this app view. Tap the message field and use the iOS keyboard microphone or dictation.";
      setVoiceNotice(notice);
      toast.info(notice);
      appendAssistantMessage(notice);
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        const notice = "Microphone permission was denied. Enable microphone access, then try again.";
        setVoiceNotice(notice);
        toast.error(notice);
        appendAssistantMessage(notice);
        return;
      }
    }
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setVoiceNotice("Voice captured. Review it, then send.");
      }
    };
    rec.onerror = (event) => {
      setListening(false);
      const notice =
        event.error === "not-allowed"
          ? "Microphone permission was denied. Enable microphone access, then try again."
          : event.error === "no-speech"
            ? "I didn't hear anything. Try again or use keyboard dictation."
            : "Voice input stopped. Try again or use keyboard dictation.";
      setVoiceNotice(notice);
      toast.error(notice);
    };
    rec.onend = () => {
      setListening(false);
      setVoiceNotice((current) => (current === "Listening..." ? "Voice input stopped." : current));
    };
    recognitionRef.current = rec;
    setListening(true);
    setVoiceNotice("Listening...");
    try {
      rec.start();
    } catch {
      setListening(false);
      const notice = "Voice input could not start here. Use keyboard dictation instead.";
      setVoiceNotice(notice);
      toast.error(notice);
      appendAssistantMessage(notice);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const handledLocally = await handleLocalReminderAction(text);
      if (handledLocally) return;

      const res = await authFetch("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: next,
          localMemory: localMemorySummary || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg =
          res.status === 503
            ? "Notico isn't configured yet."
            : (j.error as string) || "Something went wrong.";
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
        return;
      }
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: (data.reply as string) || "(no response)" },
      ]);
      if (data.savedMemory) void refreshMemories();
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ Network error." }]);
    } finally {
      setSending(false);
    }
  };

  const saveName = async () => {
    const v = nameInput.trim();
    setEditingName(false);
    if (!v || v === name) return;
    const res = await authFetch("/api/assistant/profile", {
      method: "PUT",
      body: JSON.stringify({ displayName: v }),
    });
    if (res.ok) {
      const j = await res.json();
      setName(j.profile?.displayName ?? v);
      toast.success("Assistant name updated");
    } else {
      toast.error("Couldn't update the name");
    }
  };

  const addMemory = async () => {
    const v = memInput.trim();
    if (!v) return;
    const res = await authFetch("/api/assistant/memory", {
      method: "POST",
      body: JSON.stringify({ content: v }),
    });
    if (res.status === 422) {
      const j = await res.json().catch(() => ({}));
      toast.error((j.error as string) || "Couldn't save that.");
      return;
    }
    if (res.ok) {
      const j = await res.json();
      setMemories((prev) => [j.memory as Memory, ...prev]);
      setMemInput("");
      toast.success("Notico will remember that");
    }
  };

  const deleteMemory = async (id: string) => {
    const res = await authFetch(`/api/assistant/memory?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Bot className="h-5 w-5 text-primary" />
          {editingName ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="h-8 w-40 text-sm"
                maxLength={40}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveName}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setEditingName(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              className="group flex items-center gap-1.5"
              onClick={() => {
                setNameInput(name);
                setEditingName(true);
              }}
              disabled={status === "disabled"}
            >
              <h1 className="text-lg font-semibold">{name}</h1>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMemory((v) => !v)}
              aria-label="What Notico remembers"
              disabled={status === "disabled"}
            >
              <Brain className={showMemory ? "h-4 w-4 text-primary" : "h-4 w-4"} />
            </Button>
          </div>
        </div>
      </header>

      {status === "disabled" ? (
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Bot className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-5 max-w-sm text-sm text-muted-foreground">{disabledReason}</p>
          <div className="mt-4 max-w-sm rounded-md border bg-muted/30 p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Local memory
            </p>
            {hasNoticoLocalMemory(localMemory) ? (
              <p className="mt-1.5 text-sm">
                Ready on this device{localMemory.preferredName ? ` for ${localMemory.preferredName}` : ""}.
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Add your name, likes, dislikes, and preferences in Settings.
              </p>
            )}
            <Link
              href="/settings"
              className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
            >
              Edit Notico memory
            </Link>
          </div>
        </main>
      ) : (
        <>
          {/* Memory drawer */}
          {showMemory && (
            <div className="border-b bg-muted/30 px-4 py-3 md:px-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What {name} remembers
              </p>
              <div className="mb-3 rounded-md border bg-background p-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">Local memory on this device</p>
                  <Link href="/settings" className="text-xs text-primary hover:underline">
                    Edit
                  </Link>
                </div>
                {localMemorySummary ? (
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {localMemorySummary}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Add your name, likes, dislikes, and preferences in Settings. Local memory is
                    included with chat context but is not stored in Notico&apos;s cloud memory table.
                  </p>
                )}
              </div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Cloud memories
              </p>
              <div className="mb-2 flex gap-2">
                <Input
                  value={memInput}
                  onChange={(e) => setMemInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addMemory();
                  }}
                  placeholder={`Teach ${name} a preference…`}
                  className="h-8 text-sm"
                />
                <Button size="sm" className="h-8 shrink-0" onClick={addMemory} disabled={!memInput.trim()}>
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </div>
              {memories.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nothing yet. Say &quot;remember that…&quot;, &quot;I like…&quot;, or &quot;always…&quot; in chat,
                  or add one above. Notico never stores passwords or secrets.
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-auto">
                  {memories.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5"
                    >
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {m.type}
                      </span>
                      <span className="flex-1 truncate text-xs">{m.content}</span>
                      <button
                        onClick={() => deleteMemory(m.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Forget this"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transcript */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto px-4 py-4 md:px-6 pb-[calc(5rem+env(safe-area-inset-bottom)+var(--keyboard-height,0px))]"
          >
            {messages.length === 0 ? (
              <div className="mx-auto mt-10 max-w-sm text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Bot className="h-7 w-7 text-primary" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">Hi, I&apos;m {name}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Ask me anything, or tell me a preference to remember. I can help with your notes,
                  reminders, and URLs. I&apos;ll never reveal your saved passwords.
                </p>
                {localMemory.preferredName && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Local memory is loaded for {localMemory.preferredName}.
                  </p>
                )}
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-3">
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                  >
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
                          : "max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap"
                      }
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Composer — sits above the footer nav. */}
          <div
            data-keyboard-keep-visible
            className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0"
          >
            <div className="mx-auto max-w-2xl">
              <div className="flex items-center gap-2">
                <Button
                  variant={listening ? "default" : "ghost"}
                  size="icon"
                  onClick={toggleMic}
                  aria-label={speechSupported ? "Voice input" : "Voice input unavailable"}
                  title={
                    speechSupported
                      ? "Tap to dictate"
                      : "Voice input isn't available here. Use your keyboard's dictation."
                  }
                  className="shrink-0"
                >
                  {listening ? (
                    <Mic className="h-4 w-4 animate-pulse" />
                  ) : speechSupported ? (
                    <Mic className="h-4 w-4" />
                  ) : (
                    <MicOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={`Message ${name}…`}
                  className="flex-1"
                />
                <Button size="icon" onClick={send} disabled={!input.trim() || sending} className="shrink-0">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {voiceNotice && (
                <p
                  className={
                    listening
                      ? "mt-1.5 text-xs font-medium text-primary"
                      : "mt-1.5 text-xs text-muted-foreground"
                  }
                  aria-live="polite"
                >
                  {voiceNotice}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      <SecondaryBottomNav active="assistant" />
    </div>
  );
}
