/**
 * Minimal server-side client for Google's Generative Language API (Gemini).
 *
 * Uses plain fetch — no SDK dependency. MUST only ever run server-side: the API
 * key comes from process.env.GEMINI_API_KEY and must never reach the browser.
 */

/** Model id for the assistant. Confirmed via the Task 4 addendum. */
export const ASSISTANT_MODEL = "gemini-3.1-flash-lite";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiResult {
  text: string;
  functionCalls: GeminiFunctionCall[];
  inputTokens: number;
  outputTokens: number;
}

/** Gemini `tools` entry — a set of callable function declarations. */
export interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Send a chat turn to Gemini and return the reply plus token usage.
 *
 * @throws Error with a `status` property on non-2xx / network failure so the
 *         route can map it to an HTTP response.
 */
export async function generateReply(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  maxOutputTokens: number;
  tools?: GeminiTool[];
  signal?: AbortSignal;
}): Promise<GeminiResult> {
  const contents: GeminiContent[] = opts.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens,
      temperature: 0.7,
    },
  };
  if (opts.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };
  }
  if (opts.tools?.length) {
    body.tools = opts.tools;
  }

  const res = await fetch(
    `${ENDPOINT}/${encodeURIComponent(opts.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(
      `Gemini request failed (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: {
        parts?: {
          text?: string;
          functionCall?: { name?: string; args?: Record<string, unknown> };
        }[];
      };
    }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  let text = "";
  const functionCalls: GeminiFunctionCall[] = [];
  for (const p of parts) {
    if (typeof p.text === "string") text += p.text;
    if (p.functionCall?.name) {
      functionCalls.push({ name: p.functionCall.name, args: p.functionCall.args ?? {} });
    }
  }

  return {
    text,
    functionCalls,
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
