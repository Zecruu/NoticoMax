import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadAssistantSession,
  statusFromResponse,
} from "../src/lib/ai/assistant-session.ts";

test("a slow profile never delays chat readiness and memory is not loaded on entry", async () => {
  const requests = [];
  const statuses = [];
  let finishProfile;
  const profile = new Promise((resolve) => {
    finishProfile = resolve;
  });
  const names = [];
  await loadAssistantSession({
    signal: new AbortController().signal,
    transport: {
      getAccessToken: async () => "test-token",
      fetch: async (path, init) => {
        requests.push(path);
        assert.equal(init.headers.Authorization, "Bearer test-token");
        if (path.endsWith("/profile")) return profile;
        return Response.json({
          enabled: true,
          configured: true,
          migrationsReady: true,
        });
      },
    },
    onStatus: (status) => statuses.push(status),
    onName: (name) => names.push(name),
  });
  assert.deepEqual(statuses, [{ state: "ready" }]);
  assert.deepEqual(names, []);
  assert.deepEqual(requests, ["/api/assistant/chat", "/api/assistant/profile"]);
  finishProfile(Response.json({ profile: { displayName: "My Lyte" } }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(names, ["My Lyte"]);
});

test("signed-out entry does not call any assistant endpoints", async () => {
  const statuses = [];
  await loadAssistantSession({
    signal: new AbortController().signal,
    transport: {
      getAccessToken: async () => null,
      fetch: async () => {
        assert.fail("no network request expected");
      },
    },
    onStatus: (status) => statuses.push(status),
    onName: () => assert.fail("no profile expected"),
  });
  assert.equal(statuses[0].signIn, true);
});

test("profile failure is optional while status network failure is recoverable", async () => {
  for (const failStatus of [false, true]) {
    let status;
    await loadAssistantSession({
      signal: new AbortController().signal,
      transport: {
        getAccessToken: async () => "test-token",
        fetch: async (path) => {
          if (path.endsWith("/profile") || failStatus)
            throw new Error("offline");
          return Response.json({ enabled: true, configured: true });
        },
      },
      onStatus: (next) => {
        status = next;
      },
      onName: () => assert.fail("no profile expected"),
    });
    assert.equal(status.state, failStatus ? "disabled" : "ready");
    if (failStatus) assert.equal(status.retryable, true);
  }
});

test("aborting a navigation prevents stale UI updates", async () => {
  const controller = new AbortController();
  controller.abort();
  await loadAssistantSession({
    signal: controller.signal,
    transport: {
      getAccessToken: async () => "token",
      fetch: async () => {
        assert.fail("no request after abort");
      },
    },
    onStatus: () => assert.fail("no stale status"),
    onName: () => assert.fail("no stale profile"),
  });
});

test("a disabled or unconfigured account never enables sending", () => {
  assert.equal(statusFromResponse(403, {}).state, "disabled");
  assert.equal(
    statusFromResponse(200, { configured: true, enabled: false }).state,
    "disabled"
  );
  assert.equal(
    statusFromResponse(200, { configured: false, enabled: true }).state,
    "disabled"
  );
  assert.equal(
    statusFromResponse(200, {
      configured: true,
      enabled: true,
      migrationsReady: false,
    }).state,
    "disabled"
  );
  assert.equal(statusFromResponse(503, {}).retryable, true);
});
