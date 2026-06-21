import * as Sentry from "@sentry/node";
import { env } from "./env";
import { Request } from "express";

const sentryEnabled = Boolean(env.sentryDsn);

// Amostragem de performance traces. Cada transação é ENVIADA do servidor pro
// Sentry → é egress que conta na banda do Render (free tier = 5 GB/mês). Com
// 0.2 isso gerava ~126k transações/semana. Default baixo (0.05) corta ~4x esse
// egress sem afetar a captura de ERROS (erros não são amostrados). Ajustável
// via SENTRY_TRACES_SAMPLE_RATE (ex.: "0" desliga tracing por completo).
function resolveTracesSampleRate(): number {
  if (env.nodeEnv !== "production") return 1;
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.05;
}

const tracesSampleRate = resolveTracesSampleRate();

if (sentryEnabled) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.nodeEnv,
    tracesSampleRate,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
    sendDefaultPii: false
  });
}

type CaptureOptions = {
  level?: "warning" | "error" | "fatal";
  request?: Request;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export function captureException(error: unknown, options: CaptureOptions = {}): void {
  if (!sentryEnabled) {
    return;
  }

  Sentry.withScope((scope) => {
    if (options.level) {
      scope.setLevel(options.level);
    }

    if (options.tags) {
      for (const [key, value] of Object.entries(options.tags)) {
        scope.setTag(key, value);
      }
    }

    if (options.extra) {
      for (const [key, value] of Object.entries(options.extra)) {
        scope.setExtra(key, value);
      }
    }

    if (options.request) {
      const { request } = options;
      scope.setTag("request_id", request.context?.requestId ?? "unknown");
      scope.setContext("http", {
        method: request.method,
        path: request.originalUrl,
        query: request.query,
        params: request.params,
        ip: request.ip
      });

      if (request.context?.userId) {
        scope.setUser({
          id: request.context.userId,
          role: request.context.userRole
        });
      }
    }

    Sentry.captureException(error);
  });
}

export function isSentryEnabled(): boolean {
  return sentryEnabled;
}
