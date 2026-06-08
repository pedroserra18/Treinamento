import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { captureException, isSentryEnabled } from "./config/sentry";
import { initializeWebPush } from "./modules/push/push.service";
import { startPushWorker, stopPushWorker } from "./modules/push/push.worker";

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

// Inicializa Web Push (VAPID) ANTES de subir o listener — assim os
// endpoints já refletem o estado correto (configurado vs no-op) desde
// a primeira request. Idempotente: se as env vars não estiverem setadas,
// o módulo fica em modo no-op e logger.warn alerta no boot.
initializeWebPush();

const server = app.listen(env.port, () => {
  logger.info("api_started", {
    port: env.port,
    environment: env.nodeEnv,
    sentryEnabled: isSentryEnabled()
  });
  // Worker depois do listen pra não atrasar o readiness — se demorar
  // pra fazer o primeiro tick, o /healthz já responde 200 e o Render
  // não trata como deploy falho.
  startPushWorker();
});

// Graceful shutdown: para o worker e fecha o HTTP server. Render manda
// SIGTERM antes de reciclar o processo; sem isso, jobs em-vôo morrem
// abrupto e o intervalo continua agendado por mais 1s desperdiçando ciclos.
const shutdown = (signal: string): void => {
  logger.info(`api_shutdown_signal`, { signal });
  stopPushWorker();
  server.close(() => {
    process.exit(0);
  });
  // Hard timeout — se algo travar, derruba mesmo assim em 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
