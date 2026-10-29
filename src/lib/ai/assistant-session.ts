export interface AssistantTransport {
  getAccessToken: () => Promise<string | null>;
  fetch: typeof fetch;
}

export type AssistantStatus =
  | { state: "loading" }
  | { state: "ready" }
  | {
      state: "disabled";
      reason: string;
      signIn?: boolean;
      retryable?: boolean;
    };

export function statusFromResponse(
  status: number,
  data: Record<string, unknown>
): AssistantStatus {
  if (status === 401)
    return {
      state: "disabled",
      reason: "Sign in to chat with Lyte.",
      signIn: true,
    };
  if (status === 403)
    return {
      state: "disabled",
      reason: "Lyte isn't available on your account yet.",
    };
  if (status < 200 || status >= 300)
    return {
      state: "disabled",
      reason: "Couldn't connect to Lyte. Please try again.",
      retryable: true,
    };
  if (data.migrationsReady === false || !data.configured)
    return {
      state: "disabled",
      reason: "Lyte isn't available yet. Please try again later.",
      retryable: true,
    };
  if (!data.enabled)
    return {
      state: "disabled",
      reason:
        typeof data.blockedReason === "string"
          ? data.blockedReason
          : "You've reached your Lyte usage limit. Please try again later.",
    };
  return { state: "ready" };
}

/** Profile is optional decoration, never a dependency of chat readiness.
 * Memory is deliberately absent here: fetch it only when the drawer opens. */
export async function loadAssistantSession(options: {
  transport: AssistantTransport;
  signal: AbortSignal;
  onStatus: (status: AssistantStatus) => void;
  onName: (name: string) => void;
}): Promise<void> {
  const { transport, signal, onStatus, onName } = options;
  try {
    const token = await transport.getAccessToken();
    if (signal.aborted) return;
    if (!token) {
      onStatus(statusFromResponse(401, {}));
      return;
    }
    const init = { headers: { Authorization: `Bearer ${token}` }, signal };
    // Start both requests together; don't await the profile before allowing chat.
    const statusRequest = transport.fetch("/api/assistant/chat", init);
    void transport
      .fetch("/api/assistant/profile", init)
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (!signal.aborted && typeof data.profile?.displayName === "string")
          onName(data.profile.displayName);
      })
      .catch(() => {
        /* The default name keeps the screen usable. */
      });
    const response = await statusRequest;
    const data = await response.json().catch(() => ({}));
    if (!signal.aborted) onStatus(statusFromResponse(response.status, data));
  } catch {
    if (!signal.aborted)
      onStatus({
        state: "disabled",
        reason: "Couldn't connect to Lyte. Please try again.",
        retryable: true,
      });
  }
}
