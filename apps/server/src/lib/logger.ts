import pino from "pino";
import { env } from "../env.js";

// pino-http logs req.headers by default — without redaction, every
// authenticated request would write the Clerk Bearer token into stdout
// (and through to Render's log sink). Same for cookies and any field
// shaped like an API key.
const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.apiKey",
  "*.api_key",
];

// JSON in prod (parsable by log aggregators), pretty-printed in dev
// (readable in terminal). Dev opts in to pino-pretty via the transport.
export const logger = pino(
  env.NODE_ENV === "production"
    ? { level: "info", redact: redactPaths }
    : {
        level: "debug",
        redact: redactPaths,
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l" },
        },
      },
);
