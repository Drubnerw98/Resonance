import { env } from "./env.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { recoverOrphanedJobs } from "./services/jobs.js";

const app = createApp();

// Boot-time orphan sweep — any job left in `running` is the result of a
// process that died mid-work; flip those rows to `failed` so the polling
// client sees a clean status instead of waiting forever. Fire-and-forget:
// listen first, recover second, so we don't delay request handling on a
// flaky DB. A failure here just means orphans linger until the periodic
// pruner picks them up — non-fatal.
app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening");
  recoverOrphanedJobs().catch((err: unknown) => {
    logger.warn({ err }, "job: orphan recovery failed at boot");
  });
});
