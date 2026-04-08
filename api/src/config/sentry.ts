import * as Sentry from "@sentry/node";
import { env } from "./env";
import { Request } from "express";

const sentryEnabled = Boolean(env.sentryDsn);

const tracesSampleRate = env.nodeEnv === "production" ? 0.2 : 1;

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
