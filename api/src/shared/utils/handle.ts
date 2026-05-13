// Handle (`@<handle>`) shared rules. Single source of truth so the zod schema,
// the Google OAuth backfill and the `update handle` endpoint all agree.

import { prisma } from "../../config/prisma";

// Pattern: 3–30 chars, lowercase alnum + `._-`, must start and end with alnum.
// Enforces no leading/trailing separators which would look broken in `@name.`.
export const HANDLE_REGEX = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

// Names that we either route on, look ambiguous next to system text, or
// reserve for future admin pages. Lowercased — the regex already enforces it.
const RESERVED_HANDLES = new Set([
  "admin", "administrator", "root", "support", "help", "contact",
  "settings", "profile", "login", "logout", "signin", "signout",
  "register", "signup", "me", "you", "user", "users", "api",
  "www", "terms", "privacy", "about", "feed", "home", "explore",
  "search", "notifications", "dashboard", "system",
]);

export function isHandleReserved(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.toLowerCase());
}

// Returns a normalised, valid handle or null if the input can't be salvaged.
// Used both as a defensive normaliser for client input and as the base for
// auto-generation from arbitrary strings (e.g. Google display name / email).
export function normaliseHandle(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  // Replace anything outside the allowed set with `_`, collapse runs of
  // separators so we don't produce ugly `__` chains, then trim separators
  // at the edges to satisfy the regex's alnum-start/end rule.
  const sanitised = trimmed
    .replace(/[^a-z0-9_.-]/g, "_")
    .replace(/[_.\-]{2,}/g, "_")
    .replace(/^[_.\-]+|[_.\-]+$/g, "");
  if (sanitised.length < HANDLE_MIN_LENGTH || sanitised.length > HANDLE_MAX_LENGTH) {
    return null;
  }
  return HANDLE_REGEX.test(sanitised) ? sanitised : null;
}

// Picks a base handle from the user's email local-part, with a safe fallback
// when normalisation fails (e.g. an email like `1@x.com`). Mirrors the SQL
// backfill so behaviour is consistent between migration and runtime signups.
export function deriveHandleBase(email: string, fallbackSeed: string): string {
  const local = email.split("@")[0] ?? "";
  const normalised = normaliseHandle(local);
  if (normalised) return normalised;
  return `user_${fallbackSeed.slice(0, 6).toLowerCase()}`;
}

// Finds the first free handle by appending `_2`, `_3`, ... up to `_99`. The
// cap is so we don't hammer the DB if every value is taken; in practice no
// real-world email local-part should collide that many times.
export async function generateUniqueHandle(base: string): Promise<string> {
  const truncated = base.slice(0, HANDLE_MAX_LENGTH);
  const existing = await prisma.user.findUnique({
    where: { handle: truncated },
    select: { id: true },
  });
  if (!existing) return truncated;

  for (let i = 2; i <= 99; i++) {
    const suffix = `_${i}`;
    const candidate = `${base.slice(0, HANDLE_MAX_LENGTH - suffix.length)}${suffix}`;
    const taken = await prisma.user.findUnique({
      where: { handle: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  // Worst case: append a short id-derived suffix so we always return something.
  const fallback = `${base.slice(0, HANDLE_MAX_LENGTH - 7)}_${Math.random().toString(36).slice(2, 8)}`;
  return fallback;
}
