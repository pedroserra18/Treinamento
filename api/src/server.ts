import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { captureException, isSentryEnabled } from "./config/sentry";

process.on("unhandledRejection", (reason) => {
  captureException(reason, {
    level: "error",
    tags: {
      error_type: "process_unhandled_rejection"
    }
  });

  logger.error("process_unhandled_rejection", {
    reason
  });
});

process.on("uncaughtException", (error) => {
  captureException(error, {
    level: "fatal",
    tags: {
      error_type: "process_uncaught_exception"
    }
  });

  logger.error("process_uncaught_exception", {
    err: error
  });
});

app.listen(env.port, () => {
  logger.info("api_started", {
    port: env.port,
    environment: env.nodeEnv,
    sentryEnabled: isSentryEnabled()
  });
});
