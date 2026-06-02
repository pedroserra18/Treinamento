import { Request, Response } from "express";
import { AppError } from "../../shared/errors/app-error";
import { uploadDataUrl } from "./upload.service";

// Accepts a base64 data URL from the client (already optimised on the
// client side via the existing image-processing lib) and returns a stable
// public URL pointing at Supabase Storage.

export async function uploadCompetitionPhotoController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const dataUrl = (req.body as { dataUrl?: unknown }).dataUrl;

  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    throw new AppError("dataUrl is required", { statusCode: 400, code: "MISSING_DATA_URL" });
  }

  // verifyFreshness is on only for competition proofs — body / workout
  // photos can legitimately predate the upload.
  const result = await uploadDataUrl("competition", userId, dataUrl, { verifyFreshness: true });

  res.status(201).json({
    data: { photoUrl: result.publicUrl, photoPath: result.path },
    meta: { requestId: req.context.requestId }
  });
}

// Foto de capa pra um exercício customizado criado pelo usuário. Sem
// verifyFreshness — o usuário pode fazer upload de uma foto velha
// ou ilustração; não é prova de treino.
export async function uploadExercisePhotoController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const dataUrl = (req.body as { dataUrl?: unknown }).dataUrl;

  if (typeof dataUrl !== "string" || dataUrl.length === 0) {
    throw new AppError("dataUrl is required", { statusCode: 400, code: "MISSING_DATA_URL" });
  }

  const result = await uploadDataUrl("exercise", userId, dataUrl);

  res.status(201).json({
    data: { photoUrl: result.publicUrl, photoPath: result.path },
    meta: { requestId: req.context.requestId }
  });
}
