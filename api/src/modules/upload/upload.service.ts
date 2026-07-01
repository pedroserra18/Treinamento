import { randomBytes } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";
import { getStorageBucket, getStorageClient, isStorageConfigured } from "../../config/storage";
import { checkPhotoFreshness } from "../competition/photo-freshness";
import { checkImageModeration } from "../competition/image-moderation";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2_500_000; // 2.5 MB after client-side compression

export type UploadedImage = {
  path: string;
  publicUrl: string;
};

type UploadOptions = {
  // When true, parses EXIF and rejects photos older than 24h. Only
  // applied to competition proofs — body/workout photos can come from
  // any time, that's not the cheat surface.
  verifyFreshness?: boolean;
};

// Uploads a base64 data URL to a folder inside the configured bucket and
// returns a public URL. The bucket is expected to be set as PUBLIC in the
// Supabase dashboard so we don't need to manage signed URLs (acceptable
// for fitness photos that members of a competition can already see).
export async function uploadDataUrl(
  folder: "competition" | "body" | "workout" | "exercise" | "avatar",
  ownerId: string,
  dataUrl: string,
  options: UploadOptions = {}
): Promise<UploadedImage> {
  if (!isStorageConfigured()) {
    throw new AppError("Object storage is not configured on this environment", {
      statusCode: 503,
      code: "STORAGE_UNAVAILABLE"
    });
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new AppError("Image must be a base64 data URL of type image/jpeg, image/png or image/webp", {
      statusCode: 400,
      code: "INVALID_IMAGE_PAYLOAD"
    });
  }

  const mime = match[1];
  if (!ALLOWED_MIME.has(mime)) {
    throw new AppError("Unsupported image type", {
      statusCode: 400,
      code: "UNSUPPORTED_IMAGE_TYPE"
    });
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > MAX_BYTES) {
    throw new AppError(`Image too large (max ${MAX_BYTES} bytes)`, {
      statusCode: 413,
      code: "IMAGE_TOO_LARGE"
    });
  }

  // Anti-cheat: when caller asks (competition proofs), reject photos
  // whose EXIF says they were shot more than 24h ago. Photos without
  // EXIF pass through — most chat/social apps strip it on send and we
  // don't want to lock out users whose privacy stack strips metadata.
  if (options.verifyFreshness) {
    const freshness = await checkPhotoFreshness(buffer);
    if (!freshness.ok) {
      throw new AppError(
        "Essa foto foi tirada há mais de 24h. Use uma foto recente do treino.",
        {
          statusCode: 400,
          code: "PHOTO_TOO_OLD",
          details: { capturedAt: freshness.capturedAt.toISOString() }
        }
      );
    }

    // Image moderation: same opt-in flag as freshness — competition
    // proofs go through nudity / gore / offensive content checks.
    // Body / workout uploads stay unchecked (user's own private
    // history; not a moderation surface).
    const moderation = await checkImageModeration(buffer, mime);
    if (!moderation.ok) {
      throw new AppError(
        moderation.reason === "nudity"
          ? "Essa imagem foi bloqueada por conter conteúdo explícito."
          : moderation.reason === "gore"
            ? "Essa imagem foi bloqueada por conter violência."
            : "Essa imagem foi bloqueada por conter conteúdo impróprio.",
        {
          statusCode: 400,
          code: "PHOTO_MODERATION_BLOCKED",
          details: { category: moderation.reason }
        }
      );
    }
  }

  // Path shape: <folder>/<ownerId>/<timestamp>-<rand>.<ext> — caps directory
  // listing per user and avoids collisions even on quick double-uploads.
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  const rand = randomBytes(6).toString("hex");
  const path = `${folder}/${ownerId}/${Date.now()}-${rand}.${ext}`;

  const bucket = getStorageBucket();
  const supabase = getStorageClient();
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: mime,
    upsert: false
  });

  if (uploadError) {
    throw new AppError(`Failed to upload image: ${uploadError.message}`, {
      statusCode: 502,
      code: "STORAGE_UPLOAD_FAILED"
    });
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

// Best-effort delete used when a parent record is removed. Failures are
// logged by the caller and ignored — orphaned files are tolerable and the
// bucket can be GC'd later if needed.
export async function deleteByPath(path: string): Promise<void> {
  if (!isStorageConfigured()) return;
  const supabase = getStorageClient();
  await supabase.storage.from(getStorageBucket()).remove([path]);
}
