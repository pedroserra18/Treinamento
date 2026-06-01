import { env } from "../../config/env";
import { logger } from "../../config/logger";

// Sightengine moderation — runs against competition proof photos before
// they hit Storage. Three models we care about:
//
//   - nudity-2.0: catches explicit content (the obvious cheat surface)
//   - gore: catches violence / blood (rare but cheap to add)
//   - offensive: catches hate signs / offensive gestures
//
// Free tier: 500 ops/month. Each upload = 1 op. With 100 active users
// posting 2x/day, that's 6k ops/month → upgrade to pay-as-you-go ($0.012
// per op, ~$70/mo at that scale) or block at the WAF layer first.
//
// Pricing https://sightengine.com/pricing — see the "Image moderation"
// row. Don't enable in dev unless you've set the keys; the function is
// a no-op without them.

type ModerationResult =
  | { ok: true; reason: "disabled" | "clean" }
  | { ok: false; reason: "nudity" | "gore" | "offensive"; score: number };

// Thresholds — Sightengine returns 0..1 per category. Anything above
// these triggers a rejection. Tuned to be permissive on borderline
// (gym selfies show skin) but firm on explicit content.
const THRESHOLDS = {
  nudity: 0.65,
  gore: 0.5,
  offensive: 0.7
} as const;

export function isModerationConfigured(): boolean {
  return Boolean(env.sightengineApiUser && env.sightengineApiSecret);
}

export async function checkImageModeration(buffer: Buffer, mimeType: string): Promise<ModerationResult> {
  if (!isModerationConfigured()) {
    // Documented behaviour: no key = no check. The user opts in by
    // setting the env vars. Keeps dev/local upload working without an
    // external API roundtrip on every save.
    return { ok: true, reason: "disabled" };
  }

  // Sightengine accepts multipart form-data. Node 18+ has File and
  // FormData built in.
  const form = new FormData();
  // Allocate a fresh Uint8Array so the Blob constructor gets a plain
  // ArrayBuffer — Node's Buffer is technically ArrayBufferLike (could
  // be SharedArrayBuffer) which TypeScript refuses to narrow for Blob.
  // The extra copy is cheap (<3MB image) and unambiguous.
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  form.append("media", new Blob([bytes], { type: mimeType }), "photo");
  form.append("models", "nudity-2.0,gore,offensive");
  form.append("api_user", env.sightengineApiUser as string);
  form.append("api_secret", env.sightengineApiSecret as string);

  let json: unknown;
  try {
    const res = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: form
    });
    json = await res.json();
  } catch (err) {
    // Network failure to Sightengine shouldn't block the upload — log
    // and let it through. Failing closed (blocking) here means a 5xx
    // at their end takes down our upload path entirely.
    logger.warn("image_moderation_fetch_failed", { err });
    return { ok: true, reason: "clean" };
  }

  type SightengineResponse = {
    status?: string;
    nudity?: { sexual_activity?: number; sexual_display?: number; erotica?: number };
    gore?: { prob?: number };
    offensive?: { prob?: number };
    error?: { message?: string };
  };
  const data = json as SightengineResponse;

  if (data.status !== "success") {
    logger.warn("image_moderation_api_error", { error: data.error });
    return { ok: true, reason: "clean" };
  }

  // Pick the highest sub-score across the nudity sub-categories — any
  // explicit signal trips the gate.
  const nudityScore = Math.max(
    data.nudity?.sexual_activity ?? 0,
    data.nudity?.sexual_display ?? 0,
    data.nudity?.erotica ?? 0
  );
  if (nudityScore >= THRESHOLDS.nudity) {
    return { ok: false, reason: "nudity", score: nudityScore };
  }

  const goreScore = data.gore?.prob ?? 0;
  if (goreScore >= THRESHOLDS.gore) {
    return { ok: false, reason: "gore", score: goreScore };
  }

  const offensiveScore = data.offensive?.prob ?? 0;
  if (offensiveScore >= THRESHOLDS.offensive) {
    return { ok: false, reason: "offensive", score: offensiveScore };
  }

  return { ok: true, reason: "clean" };
}
