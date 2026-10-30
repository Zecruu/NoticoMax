/** One-shot location sharing only. These limits are also enforced by the database. */
export const CHECKIN_CAPTURE_MAX_AGE_MS = 5 * 60 * 1000;
export const CHECKIN_CAPTURE_MAX_FUTURE_MS = 60 * 1000;

export interface FamilyCheckinInput {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
}

export interface FamilyCheckin extends FamilyCheckinInput {
  userId: string;
  sharedAt: string;
  expiresAt: string;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function parseFamilyCheckin(
  value: unknown,
  now = Date.now(),
): { ok: true; checkin: FamilyCheckinInput } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "A location check-in is required." };
  }
  const body = value as Record<string, unknown>;
  const { latitude, longitude, capturedAt } = body;
  const accuracy = body.accuracy ?? null;
  if (
    typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    (accuracy !== null && (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000))
  ) {
    return { ok: false, error: "A valid location and accuracy are required." };
  }
  // Explicit timezone prevents device/server timezone differences and accidental numeric dates.
  const capturedMs = typeof capturedAt === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(capturedAt)
    ? Date.parse(capturedAt)
    : NaN;
  if (!Number.isFinite(capturedMs) || capturedMs < now - CHECKIN_CAPTURE_MAX_AGE_MS || capturedMs > now + CHECKIN_CAPTURE_MAX_FUTURE_MS) {
    return { ok: false, error: "This location is stale. Capture your current location again." };
  }
  return {
    ok: true,
    checkin: { latitude, longitude, accuracy, capturedAt: new Date(capturedMs).toISOString() },
  };
}

/** Only expose intentional RPC errors, never raw database internals. */
export function familyRpcError(error: { message?: string } | null): { error: string; status: number } {
  const errors: Record<string, { error: string; status: number }> = {
    unauthorized: { error: "Sign in to use Family.", status: 401 },
    family_membership_required: { error: "You are no longer a member of this family.", status: 403 },
    location_sharing_paused: { error: "Enable check-in sharing before sharing your location.", status: 409 },
    invalid_checkin: { error: "This location is invalid or stale. Capture your current location again.", status: 400 },
    family_not_found: { error: "Family not found.", status: 404 },
    family_limit_reached: { error: "You already own a family. Use that family or delete it before creating another.", status: 409 },
    invalid_family_name: { error: "Name required (max 60 characters).", status: 400 },
    invite_not_found: { error: "Invitation or request not found.", status: 404 },
    invite_not_for_you: { error: "This invitation is not for you.", status: 403 },
    invite_expired: { error: "This invitation or request has expired.", status: 410 },
    invite_already_responded: { error: "This invitation or request has already been answered.", status: 409 },
    family_owner_required: { error: "Only the family owner can approve requests.", status: 403 },
    family_seat_limit: { error: "This family is full. A member must leave before someone else can join.", status: 409 },
  };
  return errors[error?.message ?? ""] ?? { error: "Family is temporarily unavailable. Please try again.", status: 500 };
}
