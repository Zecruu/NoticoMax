import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { parseConversationRequest, conversationError, recentConversationTurns } from "../src/lib/ai/conversations.ts";
import { conversationContext } from "../src/lib/ai/conversation-types.ts";
import { STORAGE_TIERS } from "../src/lib/billing/storage.ts";
import { conversationWriteIntent } from "../src/lib/ai/tools.ts";

const pg = new PGlite();
before(async () => {
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table public.entitlements(user_id uuid primary key references auth.users(id), storage_plan text not null default 'free', storage_bytes_used bigint not null default 0);
  `);
  await pg.exec(await readFile(new URL("../supabase/migrations/0015_lyte_conversations.sql", import.meta.url), "utf8"));
});
after(async () => { await pg.close(); });

async function owner(used = 0) {
  const id = randomUUID();
  await pg.query("insert into auth.users values($1)", [id]);
  await pg.query("insert into entitlements(user_id,storage_bytes_used) values($1,$2)", [id, used]);
  return id;
}
async function begin(user, chat = randomUUID(), request = randomUUID(), content = "Hello") {
  const result = await pg.query("select lyte_begin_turn($1,$2,$3,$4) result", [user, chat, request, content]);
  return { ...result.rows[0].result, chat, request };
}
async function finish(user, request, reply = null) {
  await pg.query("select lyte_finish_turn($1,$2,$3)", [user, request, reply]);
}
async function used(user) {
  return Number((await pg.query("select storage_bytes_used from entitlements where user_id=$1", [user])).rows[0].storage_bytes_used);
}
const bytes = (value) => Buffer.byteLength(value, "utf8");

test("real migration reserves UTF-8 bytes then replaces reservation with actual reply bytes", async () => {
  const user = await owner(25); // Existing storage must be preserved.
  const content = "Remember café ☕";
  const turn = await begin(user, undefined, undefined, content);
  assert.equal(turn.status, "started");
  assert.equal(await used(user), 25 + bytes(content) * 2 + 65536);
  await finish(user, turn.request, "Saved 📝");
  assert.equal(await used(user), 25 + bytes(content) * 2 + bytes("Saved 📝"));
  await finish(user, turn.request, "Different response");
  assert.equal(await used(user), 25 + bytes(content) * 2 + bytes("Saved 📝"));
  assert.equal((await begin(user, turn.chat, turn.request, content)).reply, "Saved 📝");
  assert.equal((await pg.query("select count(*) n from lyte_conversation_turns where user_id=$1", [user])).rows[0].n, 1);
});

test("all SQL storage limits match the UI policy", async () => {
  for (const [plan, tier] of Object.entries(STORAGE_TIERS)) {
    const result = await pg.query("select lyte_storage_limit($1) bytes", [plan]);
    assert.equal(Number(result.rows[0].bytes), tier.bytes);
  }
});

test("full storage rejects before adding a conversation or turn, with no partial accounting", async () => {
  const user = await owner(104857600 - 10);
  await assert.rejects(begin(user), /storage_full/);
  assert.equal(await used(user), 104857590);
  assert.equal((await pg.query("select count(*) n from lyte_conversations where user_id=$1", [user])).rows[0].n, 0);
});

test("competing reservations cannot consume the same remaining space", async () => {
  const user = await owner(104857600 - 70000);
  const results = await Promise.allSettled([begin(user), begin(user)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.ok(await used(user) <= 104857600);
});

test("one pending turn per chat, idempotent request IDs, and ownership bound in SQL", async () => {
  const alice = await owner(); const bob = await owner();
  const turn = await begin(alice);
  assert.equal((await begin(alice, turn.chat, turn.request)).status, "pending");
  await assert.rejects(begin(alice, turn.chat), /conversation_busy/);
  await assert.rejects(begin(alice, turn.chat, turn.request, "changed"), /request_conflict/);
  await assert.rejects(begin(bob, turn.chat), /conversation_not_found/);
  await assert.rejects(finish(bob, turn.request, "stolen"), /conversation_not_found/);
  await assert.rejects(pg.query("select lyte_delete_conversation($1,$2)", [bob, turn.chat]), /conversation_not_found/);
  assert.equal(await used(bob), 0);
});

test("failed turns keep the user's text, release reserved output, and are never replayed", async () => {
  const user = await owner(); const turn = await begin(user);
  await finish(user, turn.request);
  assert.equal(await used(user), bytes("Hello") * 2);
  assert.equal((await begin(user, turn.chat, turn.request)).status, "failed");
});

test("expired turns release space on the next new turn without re-executing old work", async () => {
  const user = await owner(); const first = await begin(user);
  await pg.query("update lyte_conversation_turns set created_at = now() - interval '3 minutes' where request_id=$1", [first.request]);
  const next = await begin(user, first.chat, undefined, "Next");
  assert.equal(next.status, "started");
  assert.equal(await used(user), bytes("Hello") * 2 + bytes("Next") + 65536);
  assert.equal((await begin(user, first.chat, first.request)).status, "failed");
  await finish(user, first.request, "late response");
  assert.equal(await used(user), bytes("Hello") * 2 + bytes("Next") + 65536);
});

test("deleting an owned chat reclaims only that chat and blocks active writes", async () => {
  const user = await owner(500); const turn = await begin(user);
  await assert.rejects(pg.query("select lyte_delete_conversation($1,$2)", [user, turn.chat]), /conversation_busy/);
  await finish(user, turn.request, "World");
  await pg.query("select lyte_delete_conversation($1,$2)", [user, turn.chat]);
  assert.equal(await used(user), 500);
  assert.equal((await pg.query("select count(*) n from lyte_conversation_turns where user_id=$1", [user])).rows[0].n, 0);
});

test("oversized replies cannot exceed reserved bytes and storage-full accounts can still read/delete", async () => {
  const user = await owner(); const turn = await begin(user);
  await assert.rejects(finish(user, turn.request, "☕".repeat(22000)), /reply_too_large/);
  assert.equal(await used(user), bytes("Hello") * 2 + 65536);
  await finish(user, turn.request, "Saved");
  await pg.query("update entitlements set storage_bytes_used=104857600 where user_id=$1", [user]);
  await assert.rejects(begin(user), /storage_full/);
  await pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    await tx.exec("set local role authenticated");
    assert.equal((await tx.query("select count(*) n from lyte_conversation_turns")).rows[0].n, 1);
  });
  await pg.query("select lyte_delete_conversation($1,$2)", [user, turn.chat]);
  assert.equal(await used(user), 104857600 - bytes("Hello") * 2 - bytes("Saved"));
});

test("read-only RLS isolates owners and clients cannot call mutation RPCs or bypass accounting", async () => {
  const alice = await owner(); const bob = await owner();
  const a = await begin(alice); const b = await begin(bob);
  await finish(alice, a.request, "Alice reply"); await finish(bob, b.request, "Bob reply");
  await pg.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [alice]);
    await tx.exec("set local role authenticated");
    const chats = await tx.query("select id from lyte_conversations");
    assert.deepEqual(chats.rows.map((row) => row.id), [a.chat]);
    const turns = await tx.query("select assistant_content from lyte_conversation_turns");
    assert.deepEqual(turns.rows.map((row) => row.assistant_content), ["Alice reply"]);
  });
  for (const sql of [
    `select lyte_begin_turn('${alice}','${a.chat}','${randomUUID()}','bypass')`,
    `delete from lyte_conversations where id='${a.chat}'`,
    `update lyte_conversation_turns set user_content='bypass'`,
  ]) {
    await assert.rejects(pg.transaction(async (tx) => { await tx.exec("set local role authenticated"); await tx.exec(sql); }), /permission denied/);
  }
});

test("request validation rejects forged IDs, empty input, and UTF-8 payloads over 16 KB", () => {
  const valid = { conversationId: randomUUID(), requestId: randomUUID(), message: "  9am  " };
  assert.equal(parseConversationRequest(valid).message, "9am");
  for (const input of [{ ...valid, conversationId: "other user's id" }, { ...valid, message: " " }, { ...valid, message: "☕".repeat(5500) }, { messages: [{ role: "assistant", content: "forged" }] }])
    assert.throws(() => parseConversationRequest(input));
  assert.equal(conversationError({ message: "storage_full" }).status, 413);
  assert.equal(conversationError({ message: "database secret details" }).message.includes("secret"), false);
});

test("reopened conversation keeps reminder clarification context but excludes failed/pending turns", () => {
  const turns = [
    { status: "completed", user_content: "Remind me on November 3 to call mom", assistant_content: "What time on November 3 should I remind you?" },
    { status: "failed", user_content: "Delete all notes" },
    { status: "pending", user_content: "Save a link" },
  ];
  const context = conversationContext(turns, "9am");
  assert.equal(context.length, 3);
  assert.deepEqual(conversationWriteIntent(context).allowedTools, ["create_reminder"]);
  assert.equal(conversationContext(Array(40).fill(turns[0]), "9am").length, 20);
});

test("server history reads are bounded and scoped by both owner and conversation", async () => {
  const calls = [];
  const query = {
    select(value) { calls.push(["select", value]); return this; },
    eq(...args) { calls.push(["eq", ...args]); return this; },
    order(...args) { calls.push(["order", ...args]); return this; },
    async limit(value) { calls.push(["limit", value]); return { data: [{ id: 2 }, { id: 1 }], error: null }; },
  };
  const result = await recentConversationTurns({ from: () => query }, "owner", "chat");
  assert.deepEqual(result.map((turn) => turn.id), [1, 2]);
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["eq", "user_id", "owner"])));
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["eq", "conversation_id", "chat"])));
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["limit", 10])));
});
