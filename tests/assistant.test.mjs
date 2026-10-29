import assert from "node:assert/strict";
import { test } from "node:test";
import { ASSISTANT_MODEL, generateReply } from "../src/lib/ai/openai.ts";
import { estimateCostCents, maxOutputTokensForCap } from "../src/lib/ai/usage.ts";

const options = {
  apiKey: "test-only-key",
  model: ASSISTANT_MODEL,
  messages: [{ role: "user", content: "Save a note" }],
  systemPrompt: "You are Lyte.",
  maxOutputTokens: 2048,
  tools: [{ name: "create_note", description: "Save a note", parameters: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } }],
};

test("Terra uses Responses with private storage and preserves validated tool arguments", async (t) => {
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(request.headers.Authorization, "Bearer test-only-key");
    assert.equal(request.signal, signal);
    const body = JSON.parse(request.body);
    assert.equal(body.model, "gpt-6.1-terra");
    assert.equal(body.store, false);
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.tools[0].strict, false);
    assert.deepEqual(body.input, options.messages);
    assert.equal(body.tools[0].type, "function");
    assert.equal(body.instructions, "You are Lyte.");
    assert.equal(body.max_output_tokens, 2048);
    return Response.json({
      status: "completed",
      output: [
        { type: "reasoning", content: [{ type: "summary_text", text: "Do not show this" }] },
        { type: "message", content: [{ type: "output_text", text: "Here you go." }] },
        { type: "function_call", name: "create_note", arguments: '{"content":"Buy milk"}' },
      ],
      usage: { input_tokens: 80, output_tokens: 120, output_tokens_details: { reasoning_tokens: 100 } },
    });
  });
  assert.deepEqual(await generateReply({ ...options, signal }), {
    text: "Here you go.",
    functionCalls: [{ name: "create_note", args: { content: "Buy milk" } }],
    inputTokens: 80,
    outputTokens: 120,
  });
});

test("provider failures preserve status without leaking the response body", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("private prompt details", { status: 429 }));
  await assert.rejects(generateReply(options), (error) => error.status === 429 && !error.message.includes("private"));
});

for (const args of ["{", "null", "[]", '"text"']) {
  test(`malformed tool arguments are rejected: ${args}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json({ status: "completed", output: [{ type: "function_call", name: "create_note", arguments: args }] }));
    await assert.rejects(generateReply(options));
  });
}

test("an incomplete response cannot execute a tool", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ status: "incomplete", output: [{ type: "function_call", name: "create_note", arguments: '{"content":"partial"}' }] }));
  await assert.rejects(generateReply(options), /did not complete/);
});

test("refusals are surfaced as text", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "I can't reveal passwords." }] }] }));
  assert.equal((await generateReply(options)).text, "I can't reveal passwords.");
});

test("cost accounting uses Terra input and all billed output tokens", () => {
  assert.equal(estimateCostCents(1_000_000, 1_000_000), 600);
  assert.equal(maxOutputTokensForCap(), 2048);
  assert.ok(estimateCostCents(1000, maxOutputTokensForCap()) < 5);
});
