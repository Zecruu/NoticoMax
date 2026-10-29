"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
  lazy,
  Suspense,
} from "react";
import Link from "next/link";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowUp,
  Brain,
  Check,
  Copy,
  FileText,
  Bell,
  Mic,
  SquarePen,
  Trash2,
  X,
  Loader2,
  RefreshCw,
  PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  loadAssistantSession,
  type AssistantStatus,
  type AssistantTransport,
} from "@/lib/ai/assistant-session";
import { toast } from "@/lib/native-toast";
import { ConversationHistory } from "./conversation-history";
import type { CloudStorage, Conversation, ConversationTurn } from "@/lib/ai/conversation-types";

const AssistantMessage = lazy(() =>
  import("./message").then((module) => ({ default: module.AssistantMessage }))
);

interface Memory {
  id: string;
  content: string;
}
interface ChatMessage {
  turnState?: ConversationTurn["status"];
  role: "user" | "assistant";
  content: string;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function speechRecognition(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return;
  const browser = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
const subscribe = () => () => {};
const hasSpeech = () => !!speechRecognition();
const serverSpeech = () => false;
const browserTransport: AssistantTransport = {
  getAccessToken: async () => {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  },
  fetch: (...args) => fetch(...args),
};
const prompts = [
  { icon: FileText, label: "Find a note", draft: "Help me find a note about " },
  { icon: Bell, label: "Set a reminder", draft: "Remind me to " },
  { icon: Brain, label: "Remember something", draft: "Remember that " },
];

export function AssistantChat({
  transport = browserTransport,
}: {
  transport?: AssistantTransport;
}) {
  const [status, setStatus] = useState<AssistantStatus>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("Lyte");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [storage, setStorage] = useState<CloudStorage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [hasMoreChats, setHasMoreChats] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [oldestTurn, setOldestTurn] = useState<number | null>(null);
  const [hasOlderTurns, setHasOlderTurns] = useState(false);
  const drafts = useRef(new Map<string, string>());
  const chatLoadSequence = useRef(0);
  const historyLoadSequence = useRef(0);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [listening, setListening] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryState, setMemoryState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [memoryInput, setMemoryInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [savingMemory, setSavingMemory] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const memoryTitle = useRef<HTMLHeadingElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const sendingLock = useRef(false);
  const stickToBottom = useRef(true);
  const mounted = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const supportsSpeech = useSyncExternalStore(
    subscribe,
    hasSpeech,
    serverSpeech
  );

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      // Read the current session for every action, including refreshed tokens.
      const token = await transport.getAccessToken();
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return transport.fetch(path, { ...init, headers });
    },
    [transport]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setStatus({
        state: "disabled",
        reason: "Lyte is taking longer to connect. Please try again.",
        retryable: true,
      });
    }, 10_000);
    void loadAssistantSession({
      transport,
      signal: controller.signal,
      onName: setName,
      onStatus: (next) => {
        clearTimeout(timeout);
        setStatus(next);
      },
    });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [transport, attempt]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      recognition.current?.stop();
      clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (transport !== browserTransport) return;
    try {
      let account: string | null | undefined;
      const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
        const next = session?.user.id ?? null;
        // Clear the entire in-memory workspace on account changes, including
        // drafts and in-flight replies. Token refreshes keep the same account.
        if (account !== undefined && account !== next) window.location.reload();
        account = next;
      });
      return () => data.subscription.unsubscribe();
    } catch {
      // Session initialization already reports missing/offline configuration.
    }
  }, [transport]);

  useLayoutEffect(() => {
    const field = composer.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 176)}px`;
  }, [input, status.state]);

  useEffect(() => {
    if (stickToBottom.current)
      transcript.current?.scrollTo({
        top: transcript.current.scrollHeight,
        behavior: "instant",
      });
  }, [messages, sending]);

  const loadMemories = useCallback(async () => {
    setMemoryState("loading");
    try {
      const response = await authFetch("/api/assistant/memory");
      if (!response.ok) throw new Error("memory unavailable");
      const data = await response.json();
      if (mounted.current) {
        setMemories(data.memories ?? []);
        setMemoryState("ready");
      }
    } catch {
      if (mounted.current) setMemoryState("error");
    }
  }, [authFetch]);

  const refreshHistory = useCallback(async (offset = 0) => {
    const sequence = ++historyLoadSequence.current;
    setHistoryLoading(true);
    setHistoryError("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await authFetch(`/api/assistant/conversations?offset=${offset}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't load your chats.");
      if (!mounted.current || sequence !== historyLoadSequence.current) return;
      setConversations((previous) => offset
        ? [...new Map([...previous, ...data.conversations].map((chat: Conversation) => [chat.id, chat])).values()]
        : data.conversations);
      setHasMoreChats(data.hasMore);
      setStorage(data.storage);
    } catch (error) {
      if (mounted.current && sequence === historyLoadSequence.current)
        setHistoryError(error instanceof Error ? error.message : "Couldn't load your chats.");
    } finally {
      clearTimeout(timeout);
      if (mounted.current && sequence === historyLoadSequence.current) setHistoryLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (status.state !== "loading" && !(status.state === "disabled" && status.signIn))
      void refreshHistory();
  }, [status, refreshHistory]);

  const turnMessages = (turns: ConversationTurn[]): ChatMessage[] => turns.flatMap((turn) => [
    { role: "user" as const, content: turn.user_content, turnState: turn.status },
    ...(turn.assistant_content ? [{ role: "assistant" as const, content: turn.assistant_content }] : []),
  ]);

  const openChat = async (id: string, older = false) => {
    if (sendingLock.current || (older && oldestTurn === null)) return;
    const sequence = ++chatLoadSequence.current;
    if (older) setOlderLoading(true); else setChatLoading(true);
    const previousHeight = transcript.current?.scrollHeight ?? 0;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await authFetch(`/api/assistant/conversations/${id}${older ? `?before=${oldestTurn}` : ""}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't open this chat.");
      if (!mounted.current || sequence !== chatLoadSequence.current) return;
      if (!older) {
        drafts.current.set(selectedId ?? "new", input);
        setInput(drafts.current.get(id) ?? "");
        setSelectedId(id);
        setSendError("");
        setShowHistory(false);
        stickToBottom.current = true;
      } else stickToBottom.current = false;
      setMessages((previous) => older ? [...turnMessages(data.turns), ...previous] : turnMessages(data.turns));
      setOldestTurn(data.turns[0]?.id ?? null);
      setHasOlderTurns(data.hasMore);
      if (older) requestAnimationFrame(() => {
        if (transcript.current) transcript.current.scrollTop += transcript.current.scrollHeight - previousHeight;
      });
    } catch (error) {
      if (mounted.current && sequence === chatLoadSequence.current)
        toast.error(error instanceof Error ? error.message : "Couldn't open this chat.");
    } finally {
      clearTimeout(timeout);
      if (mounted.current && sequence === chatLoadSequence.current) { setChatLoading(false); setOlderLoading(false); }
    }
  };

  const newChat = () => {
    if (sendingLock.current) return;
    chatLoadSequence.current++;
    drafts.current.set(selectedId ?? "new", input);
    setSelectedId(null);
    setMessages([]);
    setInput(selectedId ? drafts.current.get("new") ?? "" : input);
    setSendError("");
    setHasOlderTurns(false);
    setChatLoading(false);
    setOlderLoading(false);
    setShowHistory(false);
    stickToBottom.current = true;
    composer.current?.focus();
  };

  const deleteChat = async (id: string) => {
    setDeletingChat(true);
    try {
      const response = await authFetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't delete this chat.");
      drafts.current.delete(id);
      if (selectedId === id) {
        // Do not preserve a draft for a conversation the user chose to remove.
        setInput(""); setSelectedId(null); setMessages([]); setHasOlderTurns(false); setSendError("");
      }
      setConversations((previous) => previous.filter((chat) => chat.id !== id));
      await refreshHistory();
      toast.success("Chat deleted. Its storage has been freed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete this chat.");
      throw error;
    } finally { setDeletingChat(false); }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sendingLock.current || chatLoading || deletingChat || status.state !== "ready") return;
    sendingLock.current = true;
    const conversationId = selectedId ?? crypto.randomUUID();
    const requestId = crypto.randomUUID();
    drafts.current.delete(selectedId ?? "new");
    setSelectedId(conversationId);
    recognition.current?.stop();
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    stickToBottom.current = true;
    setMessages(next);
    setInput("");
    setSendError("");
    setSending(true);
    let preflightRejected = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await authFetch("/api/assistant/chat", {
        method: "POST", signal: controller.signal,
        body: JSON.stringify({
          conversationId, requestId, message: text,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        preflightRejected = response.status === 400 || response.status === 413;
        throw new Error(typeof data.error === "string" ? data.error : "The reply didn't arrive. Please try again.");
      }
      if (typeof data.reply !== "string" || !data.reply.trim())
        throw new Error("The reply was empty. Please try again.");
      if (!mounted.current) return;
      setMessages((previous) => [
        ...previous.map((message) => ({ ...message, turnState: undefined })),
        { role: "assistant", content: data.reply },
      ]);
      if (data.savedMemory) {
        setMemoryState("idle");
        if (showMemory) void loadMemories();
      }
    } catch (error) {
      if (!mounted.current) return;
      // Never put transport errors into model history or automatically replay
      // an uncertain request that may already have performed a write tool.
      // Preserve the submitted text on screen. Recovery reads server history;
      // it never repeats the provider call or its write tools.
      if (preflightRejected) {
        setMessages(messages);
        setInput((draft) => draft ? `${text}\n\n${draft}` : text);
        setSelectedId(selectedId);
      } else setMessages([...messages, { role: "user", content: text, turnState: "failed" }]);
      setSendError(
        error instanceof Error
          ? error.message
          : "The reply didn't arrive. Please try again."
      );
    } finally {
      clearTimeout(timeout);
      sendingLock.current = false;
      if (mounted.current) { setSending(false); void refreshHistory(); }
    }
  };

  const toggleMic = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Recognition = speechRecognition();
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.onresult = (event) => {
      const text = event.results?.[0]?.[0]?.transcript;
      if (text && mounted.current)
        setInput((draft) => (draft ? `${draft} ${text}` : text));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognition.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const copyReply = async (content: string, index: number) => {
    try {
      try {
        await navigator.clipboard.writeText(content);
      } catch {
        // Some webviews deny the modern clipboard API. A readonly selection
        // keeps the user-triggered copy usable without opening the keyboard.
        const focused = document.activeElement as HTMLElement | null;
        const field = document.createElement("textarea");
        field.value = content;
        field.readOnly = true;
        field.style.cssText =
          "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
        document.body.appendChild(field);
        try {
          field.select();
          field.setSelectionRange(0, field.value.length);
          if (!document.execCommand("copy"))
            throw new Error("copy unavailable");
        } finally {
          field.remove();
          focused?.focus({ preventScroll: true });
        }
      }
      if (!mounted.current) return;
      setCopied(index);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error(
        "Couldn't copy the reply. You can select the text to copy it."
      );
    }
  };

  const saveName = async () => {
    const value = nameInput.trim();
    if (!value || savingName) return;
    setSavingName(true);
    try {
      const response = await authFetch("/api/assistant/profile", {
        method: "PUT",
        body: JSON.stringify({ displayName: value }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setName(data.profile?.displayName ?? value);
      toast.success("Assistant name updated");
    } catch {
      toast.error("Couldn't update the name. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  const addMemory = async () => {
    if (!memoryInput.trim() || savingMemory) return;
    setSavingMemory(true);
    try {
      const response = await authFetch("/api/assistant/memory", {
        method: "POST",
        body: JSON.stringify({ content: memoryInput.trim() }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Couldn't save that memory.");
      setMemoryInput("");
      await loadMemories();
      toast.success(`${name} will remember that`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that memory."
      );
    } finally {
      setSavingMemory(false);
    }
  };

  const forgetMemory = async (id: string) => {
    try {
      const response = await authFetch(
        `/api/assistant/memory?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error();
      setMemories((previous) => previous.filter((memory) => memory.id !== id));
    } catch {
      toast.error("Couldn't forget that memory. Please try again.");
    }
  };

  const historyProps = {
    conversations, selectedId, storage, loading: historyLoading || status.state === "loading", error: status.state === "disabled" && status.signIn ? status.reason : historyError,
    hasMore: hasMoreChats, disabled: sending || chatLoading || deletingChat,
    onNew: newChat, onOpen: (id: string) => void openChat(id), onDelete: deleteChat,
    onMore: () => void refreshHistory(conversations.length), onRetry: () => void refreshHistory(),
  };
  const selectedTitle = conversations.find((chat) => chat.id === selectedId)?.title;

  return (
    <div className="app-viewport flex flex-col overflow-hidden bg-background pb-[var(--bottom-nav-height)]">
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside aria-label="Chat history" className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-muted/30 pt-[env(safe-area-inset-top)] lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Link href="/" className="inline-flex min-h-11 items-center gap-3 rounded-lg text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-4" /> Back to NoticoMax</Link>
        </div>
        <ConversationHistory {...historyProps} />
      </aside>
      <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border/60 bg-background pt-[env(safe-area-inset-top)]">
        <div className="flex h-16 items-center gap-3 px-3 md:px-6">
          <Button variant="ghost" size="icon" aria-label="Open past conversations" className="size-11 rounded-xl transition-colors lg:hidden" onClick={() => setShowHistory(true)}><PanelLeft className="size-5" /></Button>
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
            {name}
            {selectedTitle && <span className="ml-3 hidden text-sm font-normal text-muted-foreground sm:inline">{selectedTitle}</span>}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-xl transition-colors"
            aria-label="New chat"
            title="New chat"
            disabled={sending || deletingChat}
            onClick={newChat}
          >
            <SquarePen className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 rounded-xl transition-colors"
            aria-label="Memory and preferences"
            title="Memory and preferences"
            disabled={status.state !== "ready"}
            onClick={() => {
              setNameInput(name);
              setShowMemory(true);
              if (memoryState === "idle") void loadMemories();
            }}
          >
            <Brain className="size-5" />
          </Button>
        </div>
      </header>

      <main
        ref={transcript}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onScroll={() => {
          const el = transcript.current;
          if (el)
            stickToBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div
          className={
            messages.length
              ? "mx-auto max-w-3xl space-y-7 px-5 py-7 md:px-6"
              : "mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-10"
          }
        >
          {hasOlderTurns && <Button variant="ghost" className="mx-auto flex min-h-11 transition-colors" disabled={olderLoading || sending} onClick={() => selectedId && void openChat(selectedId, true)}>{olderLoading ? "Loading earlier messages..." : "Load earlier messages"}</Button>}
          {chatLoading && <p role="status" className="py-2 text-center text-sm text-muted-foreground">Opening chat...</p>}
          {messages.length === 0 ? (
            <div className="pb-6 text-center">
              <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                What&apos;s on your mind?
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Find what you saved, capture an idea, or set a reminder.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-2">
                {prompts.map(({ icon: Icon, label, draft }) => (
                  <button
                    key={label}
                    type="button"
                    disabled={status.state === "disabled"}
                    onClick={() => {
                      setInput(draft);
                      composer.current?.focus();
                    }}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <article
                key={index}
                aria-label={message.role === "user" ? "You" : name}
                className={
                  message.role === "user"
                    ? "ml-auto w-fit max-w-[90%] rounded-2xl bg-muted px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words"
                    : "min-w-0"
                }
              >
                {message.role === "user" ? (
                  <>{message.content}
                    {message.turnState && message.turnState !== "completed" && <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-muted-foreground">{message.turnState === "pending" ? "Reply not confirmed yet. Reopen this chat to check." : "No reply confirmed. Check your saved items before sending this request again."}</p>}
                  </>
                ) : (
                  <>
                    <Suspense
                      fallback={
                        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                          {message.content}
                        </p>
                      }
                    >
                      <AssistantMessage content={message.content} />
                    </Suspense>
                    <button
                      type="button"
                      onClick={() => void copyReply(message.content, index)}
                      aria-label={
                        copied === index ? "Reply copied" : "Copy reply"
                      }
                      className="mt-2 inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {copied === index ? (
                        <Check className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </button>
                  </>
                )}
              </article>
            ))
          )}
          {sending && (
            <div
              role="status"
              className="flex items-center gap-2 py-1 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {name} is thinking…
            </div>
          )}
        </div>
      </main>

      <div
        data-keyboard-keep-visible
        className="shrink-0 bg-background px-4 pb-4 pt-2 md:pb-6"
      >
        <div className="mx-auto max-w-3xl">
          {sendError && (
            <p role="alert" className="mb-3 px-1 text-sm text-destructive">
              {sendError}
              {selectedId && <button type="button" className="ml-2 min-h-11 underline underline-offset-4" onClick={() => void openChat(selectedId)}>Reopen chat</button>}
            </p>
          )}
          {status.state === "disabled" ? (
            <div role="status" className="rounded-2xl bg-muted/60 p-4 text-sm">
              <p>{status.reason}</p>
              {status.signIn && (
                <Link
                  href="/"
                  className="mt-2 inline-flex min-h-11 items-center font-medium underline underline-offset-4"
                >
                  Go to sign in
                </Link>
              )}
              {status.retryable && (
                <Button
                  variant="ghost"
                  className="mt-2 min-h-11 px-0"
                  onClick={() => {
                    setStatus({ state: "loading" });
                    setAttempt((value) => value + 1);
                  }}
                >
                  <RefreshCw className="size-4" />
                  Try connecting again
                </Button>
              )}
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              className="rounded-2xl border border-input bg-muted/30 p-2 focus-within:border-ring"
            >
              <textarea
                ref={composer}
                aria-label={`Message ${name}`}
                placeholder={`Message ${name}`}
                value={input}
                disabled={chatLoading || deletingChat}
                rows={1}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    !window.matchMedia("(pointer: coarse)").matches
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
                className="block max-h-44 min-h-14 w-full resize-none bg-transparent px-3 py-3 text-base leading-6 outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                {supportsSpeech ? (
                  <Button
                    type="button"
                    variant={listening ? "secondary" : "ghost"}
                    size="icon"
                    className="size-11 rounded-full transition-colors"
                    aria-label={
                      listening ? "Stop dictation" : "Dictate a message"
                    }
                    aria-pressed={listening}
                    disabled={sending || chatLoading || deletingChat}
                    onClick={toggleMic}
                  >
                    <Mic
                      className={listening ? "size-5 animate-pulse" : "size-5"}
                    />
                  </Button>
                ) : (
                  <span className="px-2 text-xs text-muted-foreground">
                    Notes, links, reminders. Just ask.
                  </span>
                )}
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  className="size-11 rounded-full transition-colors"
                  disabled={
                    !input.trim() || sending || chatLoading || deletingChat || status.state !== "ready"
                  }
                >
                  <ArrowUp className="size-5" />
                </Button>
              </div>
            </form>
          )}
          {status.state === "loading" && (
            <p
              role="status"
              className="mt-2 text-center text-xs text-muted-foreground"
            >
              Connecting to {name}… You can start typing.
            </p>
          )}
        </div>
      </div>

      </section>
      </div>
      <Sheet open={showHistory} onOpenChange={setShowHistory}>
        <SheetContent side="left" showCloseButton={false} className="!top-[var(--visual-viewport-top)] !bottom-auto !h-[var(--visual-viewport-height)] w-[min(88vw,320px)] gap-0 bg-background data-[state=open]:duration-200 data-[state=closed]:duration-150">
          <SheetHeader className="relative flex h-20 shrink-0 justify-center px-5 pr-16 pt-[max(1rem,env(safe-area-inset-top))]">
            <SheetTitle>Conversations</SheetTitle>
            <SheetDescription className="sr-only">Reopen or delete a saved chat.</SheetDescription>
            <Button variant="ghost" size="icon" aria-label="Close conversations" className="absolute right-2 top-4 size-11 transition-colors" onClick={() => setShowHistory(false)}><X className="size-5" /></Button>
          </SheetHeader>
          <ConversationHistory {...historyProps} />
        </SheetContent>
      </Sheet>
      <Sheet open={showMemory} onOpenChange={setShowMemory}>
        <SheetContent
          side="right"
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            memoryTitle.current?.focus({ preventScroll: true });
          }}
          className="!top-[var(--visual-viewport-top)] !bottom-auto !h-[var(--visual-viewport-height)] w-full gap-0 overflow-y-auto data-[state=open]:duration-200 data-[state=closed]:duration-150 sm:max-w-sm"
        >
          <SheetHeader className="relative px-6 pr-16 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
            <SheetTitle
              ref={memoryTitle}
              tabIndex={-1}
              className="outline-none"
            >
              Memory and preferences
            </SheetTitle>
            <SheetDescription>Make {name} feel more like you.</SheetDescription>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 size-11 rounded-xl transition-colors"
              aria-label="Close memories"
              onClick={() => setShowMemory(false)}
            >
              <X className="size-5" />
            </Button>
          </SheetHeader>
          <div className="space-y-7 px-6 pb-8">
            <div className="space-y-2">
              <Label htmlFor="lyte-name">Assistant name</Label>
              <div className="flex gap-2">
                <Input
                  id="lyte-name"
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  maxLength={40}
                  className="min-h-11"
                />
                <Button
                  className="min-h-11 transition-colors"
                  disabled={
                    savingName || !nameInput.trim() || nameInput.trim() === name
                  }
                  onClick={() => void saveName()}
                >
                  Save
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <Label htmlFor="lyte-memory">Something to remember</Label>
              <Input
                id="lyte-memory"
                value={memoryInput}
                onChange={(event) => setMemoryInput(event.target.value)}
                placeholder="I prefer short answers"
                className="min-h-11"
              />
              <Button
                variant="secondary"
                className="min-h-11 transition-colors"
                disabled={!memoryInput.trim() || savingMemory}
                onClick={() => void addMemory()}
              >
                {savingMemory ? "Remembering…" : "Remember this"}
              </Button>
            </div>
            <section aria-labelledby="memory-heading">
              <h2 id="memory-heading" className="mb-3 text-sm font-semibold">
                What {name} remembers
              </h2>
              {memoryState === "loading" && (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading memories…
                </p>
              )}
              {memoryState === "error" && (
                <Button variant="ghost" onClick={() => void loadMemories()}>
                  Try loading memories again
                </Button>
              )}
              {memoryState === "ready" &&
                (memories.length ? (
                  <ul className="divide-y">
                    {memories.map((memory) => (
                      <li
                        key={memory.id}
                        className="flex items-start gap-2 py-3"
                      >
                        <p className="min-w-0 flex-1 break-words text-sm leading-relaxed">
                          {memory.content}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11 transition-colors"
                          aria-label="Forget this memory"
                          onClick={() => void forgetMemory(memory.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Nothing saved yet. Tell {name} a preference here or say
                    &quot;remember that…&quot; in chat.
                  </p>
                ))}
            </section>
          </div>
        </SheetContent>
      </Sheet>
      <MobileNav
        activeFilter="all"
        activeFolder={null}
        onFilterChange={() => undefined}
        onFolderChange={() => undefined}
        onCreateNew={() => undefined}
        folders={[]}
        folderItemCounts={{}}
        onAddFolder={async () => undefined}
        onEditFolder={async () => undefined}
        onRemoveFolder={async () => undefined}
        activeView="assistant"
        navigationMode="links"
      />
    </div>
  );
}
