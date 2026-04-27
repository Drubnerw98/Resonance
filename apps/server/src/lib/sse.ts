import type { Response } from "express";

/**
 * Minimal SSE writer. Each event is `event: <name>` + `data: <json>` + blank
 * line. We JSON-encode the data so newlines in payloads don't break the SSE
 * line discipline.
 */
export class SSEWriter {
  constructor(private readonly res: Response) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
  }

  send(event: string, data: unknown): void {
    this.res.write(`event: ${event}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  end(): void {
    this.res.end();
  }
}
