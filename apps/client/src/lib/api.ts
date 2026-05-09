const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

// Threshold for treating a request as "slow." Render's free-tier cold start
// is ~30s, well past this; real warm requests come back in <1s. Tuned to be
// long enough to avoid flickering on transient network blips and short enough
// that the user gets feedback well before the cold start finishes.
const SLOW_REQUEST_MS = 3000;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Returns the bearer token to send with the request, or null for anonymous. */
  getToken?: () => Promise<string | null>;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, getToken, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  finalHeaders.set("Content-Type", "application/json");
  if (getToken) {
    const token = await getToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  // Cold-start visibility: if the response hasn't arrived in SLOW_REQUEST_MS,
  // fire a global event so a top-level toast can let the user know the server
  // is warming up. Listener clears the timer once the request settles
  // (success or failure) so the toast doesn't cling around.
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  if (typeof window !== "undefined") {
    slowTimer = setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("resonance:slow-fetch", { detail: { path } }),
      );
    }, SLOW_REQUEST_MS);
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: finalHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      // 401 from a logged-in client = expired Clerk session (the long-idle-tab
      // case). Fire a global signal so a single banner can prompt re-auth
      // instead of letting the raw error bubble into N hooks' error states.
      if (res.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new Event("resonance:session-expired"));
      }
      throw new ApiError(res.status, text || res.statusText);
    }

    return (await res.json()) as T;
  } finally {
    if (slowTimer !== undefined) clearTimeout(slowTimer);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("resonance:slow-fetch:settled"));
    }
  }
}
