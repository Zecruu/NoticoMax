/** Server-side Responses API adapter. The key is supplied only by the route. */
export const ASSISTANT_MODEL = "gpt-6.1-terra";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface AssistantTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AssistantResult {
  text: string;
  functionCalls: AssistantFunctionCall[];
  inputTokens: number;
  outputTokens: number;
}

export async function generateReply(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  maxOutputTokens: number;
  tools?: readonly AssistantTool[];
  signal?: AbortSignal;
}): Promise<AssistantResult> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      instructions: opts.systemPrompt,
      input: opts.messages,
      max_output_tokens: opts.maxOutputTokens,
      reasoning: { effort: "low" },
      store: false,
      parallel_tool_calls: false,
      tools: opts.tools?.map((tool) => ({
        type: "function",
        ...tool,
        // Existing validators handle optional fields and bind writes to the
        // authenticated user. Keep those fields optional in the API schema.
        strict: false,
      })),
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    // Provider error bodies can contain user input. Keep them out of logs.
    throw Object.assign(new Error(`OpenAI request failed (${res.status})`), { status: res.status });
  }

  const json = await res.json() as {
    status?: string;
    output?: Array<{
      type: string;
      name?: string;
      arguments?: string;
      content?: Array<{ type: string; text?: string; refusal?: string }>;
    }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (json.status !== "completed") {
    throw new Error("OpenAI did not complete the response");
  }

  const text: string[] = [];
  const functionCalls: AssistantFunctionCall[] = [];
  for (const item of json.output ?? []) {
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && part.text) text.push(part.text);
        if (part.type === "refusal" && part.refusal) text.push(part.refusal);
      }
    } else if (item.type === "function_call" && item.name) {
      const args: unknown = JSON.parse(item.arguments ?? "{}");
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new Error("OpenAI returned invalid tool arguments");
      }
      functionCalls.push({ name: item.name, args: args as Record<string, unknown> });
    }
  }

  return {
    text: text.join("\n"),
    functionCalls,
    inputTokens: json.usage?.input_tokens ?? 0,
    // Responses usage includes billed reasoning tokens in output_tokens.
    outputTokens: json.usage?.output_tokens ?? 0,
  };
}
