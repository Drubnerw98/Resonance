import { ApiError } from "./api.ts";

export interface SSEHandlers {
  onEvent: (event: string, data: unknown) => void;
  signal?: AbortSignal;
}

interface ParsedEvent {
  event: string;
  data: string;
}

function parseChunk(buffer: string): {
  events: ParsedEvent[];
  remainder: string;
} {
  // Events are separated by a blank line. Within an event, lines are
  // `field: value`. We only consume `event:` and `data:` here.
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const events: ParsedEvent[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    let event = "message";
    let data = "";
    for (const line of part.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    events.push({ event, data });
  }
  return { events, remainder };
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

/**
 * POST a JSON body to an SSE endpoint and dispatch parsed events to the
 * supplied handler. Returns when the server closes the stream.
 */
export async function postSSE(
  path: string,
  body: unknown,
  token: string | null,
  handlers: SSEHandlers,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    ...(handlers.signal ? { signal: handlers.signal } : {}),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || res.statusText);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, remainder } = parseChunk(buffer);
    buffer = remainder;
    for (const e of events) {
      let data: unknown = null;
      if (e.data) {
        try {
          data = JSON.parse(e.data);
        } catch {
          data = e.data;
        }
      }
      handlers.onEvent(e.event, data);
    }
  }
}
