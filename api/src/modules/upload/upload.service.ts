import { randomBytes } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";
import { getStorageBucket, getStorageClient, isStorageConfigured } from "../../config/storage";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2_500_000; // 2.5 MB after client-side compression

export type UploadedImage = {
  path: string;
  publicUrl: string;
};

// Uploads a base64 data URL to a folder inside the configured bucket and
// returns a public URL. The bucket is expected to be set as PUBLIC in the
// Supabase dashboard so we don't need to manage signed URLs (acceptable
// for fitness photos that members of a competition can already see).
export async function uploadDataUrl(
  folder: "competition" | "body" | "workout",
  ownerId: string,
  dataUrl: string
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
