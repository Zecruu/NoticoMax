import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Assistant profile: the per-user name + style the assistant goes by. Stored in
 * the `assistant_profile` table (migration 0012). All access is server-side via
 * the gated assistant API.
 */

export const DEFAULT_ASSISTANT_NAME = "Notico";
const MAX_NAME = 40;
const MAX_STYLE = 500;

export interface AssistantProfile {
  displayName: string;
  styleSummary: string | null;
}

/** Trim/collapse/clamp a proposed assistant name; null if empty. */
export function sanitizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return null;
  return name.length > MAX_NAME ? name.slice(0, MAX_NAME) : name;
}

export async function getProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<AssistantProfile> {
  const { data } = await admin
    .from("assistant_profile")
    .select("display_name, style_summary")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    displayName: (data?.display_name as string | undefined)?.trim() || DEFAULT_ASSISTANT_NAME,
    styleSummary: (data?.style_summary as string | null) ?? null,
  };
}

export async function upsertProfile(
  admin: SupabaseClient,
  userId: string,
  input: { displayName?: string | null; styleSummary?: string | null },
): Promise<AssistantProfile> {
  const patch: Record<string, unknown> = { user_id: userId };
  if (input.displayName !== undefined) {
    patch.display_name = sanitizeDisplayName(input.displayName) ?? DEFAULT_ASSISTANT_NAME;
  }
  if (input.styleSummary !== undefined) {
    const s =
      typeof input.styleSummary === "string" ? input.styleSummary.trim().slice(0, MAX_STYLE) : "";
    patch.style_summary = s || null;
  }

  const { data, error } = await admin
    .from("assistant_profile")
    .upsert(patch, { onConflict: "user_id" })
    .select("display_name, style_summary")
    .single();
  if (error) throw error;
  return {
    displayName: (data.display_name as string)?.trim() || DEFAULT_ASSISTANT_NAME,
    styleSummary: (data.style_summary as string | null) ?? null,
  };
}
