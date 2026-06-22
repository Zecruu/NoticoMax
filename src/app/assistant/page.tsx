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
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/native-toast";

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
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

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

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speechSupported = getSpeechRecognition() !== null;

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

  const refreshMemories = useCallback(async () => {
    const res = await authFetch("/api/assistant/memory");
    if (res.ok) {
      const j = await res.json();
      setMemories(j.memories ?? []);
    }
  }, [authFetch]);

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

      if (!data.configured) {
        setStatus("disabled");
        setDisabledReason("Notico isn't configured yet — check back soon.");
        return;
      }
      if (!data.enabled && data.blockedReason) {
        setStatus("disabled");
        setDisabledReason(data.blockedReason);
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

  const toggleMic = () => {
    const SR = getSpeechRecognition();
    if (!SR) {
      toast.info("Voice input isn't available here — use your keyboard's mic / dictation.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript ?? "";
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
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
      const res = await authFetch("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ messages: next }),
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
        </main>
      ) : (
        <>
          {/* Memory drawer */}
          {showMemory && (
            <div className="border-b bg-muted/30 px-4 py-3 md:px-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What {name} remembers
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
            <div className="mx-auto flex max-w-2xl items-center gap-2">
              <Button
                variant={listening ? "default" : "ghost"}
                size="icon"
                onClick={toggleMic}
                aria-label={speechSupported ? "Voice input" : "Voice input unavailable"}
                title={
                  speechSupported
                    ? "Tap to dictate"
                    : "Voice input isn't available here — use your keyboard's dictation"
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
          </div>
        </>
      )}

      <SecondaryBottomNav active="assistant" />
    </div>
  );
}
