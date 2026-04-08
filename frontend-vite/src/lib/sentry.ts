import * as Sentry from "@sentry/react";

type SentryUser = {
  id: string;
  email?: string;
  role?: string;
};

const dsn = import.meta.env.VITE_SENTRY_DSN;

function parseSampleRate(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }

  return parsed;
}

export function initSentryFrontend(): void {
  if (!dsn) {
    return;
  }

  const tracesSampleRate = parseSampleRate(
    import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
    import.meta.env.MODE === "production" ? 0.2 : 1
  );

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate,
    integrations: [Sentry.browserTracingIntegration()],
    sendDefaultPii: false,
    beforeSend(event, hint) {
      const originalError = hint.originalException;
      if (originalError instanceof Error && originalError.message.includes("Sessao expirada")) {
        return null;
      }

      return event;
    }
  });
}

export function setSentryUser(user: SentryUser | null): void {
  if (!dsn) {
    return;
  }

  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.id,
    email: user.email
  });

  if (user.role) {
    Sentry.setTag("user_role", user.role);
  }
}

export { Sentry };
