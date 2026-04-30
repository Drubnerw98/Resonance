const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

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

  return res.json() as Promise<T>;
}
