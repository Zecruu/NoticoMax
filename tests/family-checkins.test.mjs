import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFamilyCheckin, familyRpcError, isUuid } from "../src/lib/family/checkins.ts";

const now = Date.parse("2026-10-30T12:00:00Z");
const location = (values = {}) => ({ latitude: 26.1, longitude: -80.1, accuracy: 12.5, capturedAt: new Date(now).toISOString(), ...values });

test("one-shot check-in preserves accuracy, valid zero coordinates and explicit capture time", () => {
  const result = parseFamilyCheckin(location({ latitude: 0, longitude: 0, accuracy: 0 }), now);
  assert.deepEqual(result, { ok: true, checkin: location({ latitude: 0, longitude: 0, accuracy: 0 }) });
  assert.equal(parseFamilyCheckin(location({ accuracy: undefined }), now).checkin.accuracy, null);
});

test("check-in payload never accepts forged identity, consent or lifetime", () => {
  const result = parseFamilyCheckin(location({ userId: "someone-else", sharingEnabled: true, expiresAt: "2099-01-01T00:00:00Z" }), now);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.checkin).sort(), ["accuracy", "capturedAt", "latitude", "longitude"]);
});

test("non-finite, out-of-range and string coordinates or accuracy are rejected", () => {
  for (const values of [
    { latitude: 91 }, { latitude: -91 }, { latitude: NaN }, { latitude: Infinity }, { latitude: "26.1" },
    { longitude: 181 }, { longitude: -181 }, { longitude: -Infinity },
    { accuracy: -1 }, { accuracy: 100001 }, { accuracy: NaN }, { accuracy: "10" },
  ]) assert.equal(parseFamilyCheckin(location(values), now).ok, false, JSON.stringify(values));
  assert.equal(parseFamilyCheckin(location({ latitude: -90, longitude: 180, accuracy: 100000 }), now).ok, true);
});

test("stale captures, impossible timestamps and timezone-free dates cannot be shared", () => {
  for (const capturedAt of [undefined, null, "invalid", "2026-10-30T12:00:00", 1793361600000,
    new Date(now - 300001).toISOString(), new Date(now + 60001).toISOString()]) {
    assert.equal(parseFamilyCheckin(location({ capturedAt }), now).ok, false, String(capturedAt));
  }
  assert.equal(parseFamilyCheckin(location({ capturedAt: new Date(now - 300000).toISOString() }), now).ok, true);
  assert.equal(parseFamilyCheckin(location({ capturedAt: new Date(now + 60000).toISOString() }), now).ok, true);
});

test("invalid JSON shapes and family IDs fail cleanly", () => {
  for (const body of [null, [], 42, "location", {}, true]) assert.equal(parseFamilyCheckin(body, now).ok, false);
  assert.equal(isUuid("c843a0b1-c416-4505-ae82-85cb646248f1"), true);
  for (const value of [null, "", "family", "' OR true --"]) assert.equal(isUuid(value), false);
});

test("RPC errors are actionable without exposing database internals", () => {
  assert.equal(familyRpcError({ message: "family_membership_required" }).status, 403);
  assert.equal(familyRpcError({ message: "location_sharing_paused" }).status, 409);
  assert.equal(familyRpcError({ message: "family_seat_limit" }).status, 409);
  assert.equal(familyRpcError({ message: "invite_expired" }).status, 410);
  assert.deepEqual(familyRpcError({ message: "private table schema details" }), { error: "Family is temporarily unavailable. Please try again.", status: 500 });
});
