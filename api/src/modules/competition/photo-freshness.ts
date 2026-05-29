import exifr from "exifr";
import { logger } from "../../config/logger";

// How fresh a proof photo must be (24h) when EXIF capture date is
// present. If the user's phone strips EXIF (privacy-conscious Androids,
// some iOS settings, anything saved from chat) we skip the check rather
// than punish them — the photoHash dedup still prevents reusing the
// same image twice, which is the bulk of the anti-cheat value.
const MAX_PHOTO_AGE_MS = 24 * 60 * 60 * 1000;

export type FreshnessResult =
  | { ok: true; reason: "no-exif" | "fresh"; capturedAt: Date | null }
  | { ok: false; reason: "too-old"; capturedAt: Date };

// Reads DateTimeOriginal (Exif tag 0x9003) and falls back to
// DateTimeDigitized / DateTime. We only consult standard EXIF tags —
// phone-specific maker-note timestamps add bloat and rarely diverge.
export async function checkPhotoFreshness(buffer: Buffer): Promise<FreshnessResult> {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = (await exifr.parse(buffer, {
      pick: ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]
    })) as Record<string, unknown> | null;
  } catch (err) {
    // EXIF parsing failures (corrupt file, exotic encoder) shouldn't
    // block the upload — fall through to no-exif. Log so we can spot
    // patterns if a specific client starts misbehaving.
    logger.debug("photo_exif_parse_failed", { err });
    return { ok: true, reason: "no-exif", capturedAt: null };
  }

  if (!parsed) return { ok: true, reason: "no-exif", capturedAt: null };

  const raw = parsed.DateTimeOriginal ?? parsed.DateTimeDigitized ?? parsed.DateTime;
  if (!raw) return { ok: true, reason: "no-exif", capturedAt: null };

  const capturedAt = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(capturedAt.getTime())) {
    return { ok: true, reason: "no-exif", capturedAt: null };
  }

  // Allow a small future tolerance (e.g. timezone-confused phones
  // claiming "now + 2h"). Cap at +1h so an obvious forgery still fails.
  const futureSkew = capturedAt.getTime() - Date.now();
  if (futureSkew > 60 * 60 * 1000) {
    return { ok: true, reason: "no-exif", capturedAt: null };
  }

  if (Date.now() - capturedAt.getTime() > MAX_PHOTO_AGE_MS) {
    return { ok: false, reason: "too-old", capturedAt };
  }
  return { ok: true, reason: "fresh", capturedAt };
}
