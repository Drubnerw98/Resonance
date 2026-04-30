import pino from "pino";
import { env } from "../env.js";

// JSON in prod (parsable by log aggregators), pretty-printed in dev
// (readable in terminal). Dev opts in to pino-pretty via the transport.
export const logger = pino(
  env.NODE_ENV === "production"
    ? { level: "info" }
    : {
        level: "debug",
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l" },
        },
      },
);
