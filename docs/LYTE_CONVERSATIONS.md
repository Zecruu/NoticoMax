# Lyte conversations

Lyte has a centered transcript, a desktop history sidebar, and a mobile history drawer. New chats are created on the first message. The first message supplies the title, without another model call. History loads in pages of 40 chat titles or 30 turns; the server sends only the latest 20 confirmed messages to the model. Curated memories remain separate.

## Storage policy

Migration `0015_lyte_conversations.sql` uses the existing account storage allowance: 100 MiB included, or the account's existing personal/family storage tier. It does not change prices, billing entitlements, or Lyte's existing access gate.

Saved title and message content count as their UTF-8 bytes. Database/index overhead is excluded. Each pending turn temporarily reserves 64 KiB for its reply before any provider or tool call. Completing or failing a turn replaces that reservation with actual reply bytes or releases it. Existing storage usage is preserved. The history sidebar and Settings both show the account total.

All storage mutations lock the account's entitlement row. This serializes reservations across chats and makes quota checks, insertion, completion, and deletion transactional. A full account can still read and delete its own history. Deleting a chat permanently removes its turns and reclaims its bytes; notes, reminders, bookmarks, and curated memories created from the chat remain separate. The UI confirms this deletion inline.

Interrupted requests retain their submitted text. A new turn in the same chat can release an abandoned reply reservation after two minutes; deleting the chat after that interval also releases it. Until then, reservations remain visible in the storage total. There is no automatic background cleanup job. Future storage writers must use the same entitlement-row locking contract.

This meters saved conversation content. It does not backfill storage accounting for pre-existing notes, URLs, curated memories, or other database records.

## Ownership and recovery

All APIs authenticate the caller using the existing Lyte gate. Every history query includes the owner ID. RLS permits owners to read their rows but grants no direct client writes. Only service-role RPCs can mutate history or its meter; their search paths are fixed.

The client sends a conversation UUID, a unique request UUID, the latest message, and its IANA timezone. The server loads conversation context itself. A repeated request ID returns the saved completed answer or rejects pending/failed work; it never repeats a model or tool call. A second pending turn in one chat is blocked. These protections cover retained history, not replays after the user permanently deletes that history.

Lost or unconfirmed replies prompt the user to reopen the chat and check saved items. Reopening only reads stored turns. A tool may have completed before a network or persistence failure, so requests are never automatically resent. A storage-limit or validation rejection preserves the draft for correction. A failed turn does not enter future model context.

Provider calls retain `store: false`; Supabase owns the history. Existing AI spend/action quota implementation is unchanged by this work and is separate from atomic storage reservations.

## Release order

1. Review and apply `supabase/migrations/0015_lyte_conversations.sql` to the NoticoMax Supabase project after migrations 0010–0014. It adds two tables, indexes, read-only ownership policies, and service-only functions. It does not rewrite existing user records. Its schema creation is transactional and intended to run once.
2. Confirm `lyte_conversations` and `lyte_conversation_turns` are available through the REST schema cache, and `lyte_begin_turn`, `lyte_finish_turn`, and `lyte_delete_conversation` are installed.
3. Merge the validated feature into `main`, push, and verify the Railway deployment. Do not deploy the new chat contract ahead of the migration.
4. Check an authenticated chat across reloads/devices and its storage meter. Check a physical iPhone keyboard separately; browser viewport emulation cannot validate iOS keyboard behavior.

The new request contract requires the current web client. An already-open old client should reload before sending after this release.

Production migration 0015 was applied on 2026-10-29, including its migration-ledger entry. Both tables were verified through REST, along with RLS and service-only mutation permissions. A live rollback transaction verified reservation, completion, request deduplication, and byte reclamation without retaining test data.

## Local verification

`node --experimental-strip-types --test tests/conversations.test.mjs` runs the actual migration and SQL functions in an isolated in-memory PostgreSQL engine (PGlite). Its bootstrap substitutes only the existing auth/entitlements prerequisites. It covers UTF-8 accounting, quota rejection/rollback, competing reservations, request deduplication, ownership/RLS, service-only mutation permissions, oversized replies, failure/expiry, and byte reclamation. PGlite uses one connection; this is not a multi-connection production load test.

`node --experimental-strip-types --test tests/*.test.mjs` runs the full focused regression set. `npm run build -- --webpack` validates the production bundle. The PGlite package is development-only and is not imported by the app.
