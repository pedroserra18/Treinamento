export type ExerciseItem = {
  id: string;
  slug: string;
  name: string;
  primaryMuscleGroup: string;
  equipment: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  thumbnailUrl: string | null;
  videoUrl: string | null;
};

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
}

function normalizeMediaUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function fetchExercises(): Promise<ExerciseItem[]> {
  const response = await fetch(`${getApiBaseUrl()}/exercises`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return data.map((item: Record<string, unknown>) => ({
    id: String(item.id),
    slug: String(item.slug ?? ""),
    name: String(item.name ?? ""),
    primaryMuscleGroup: String(item.primaryMuscleGroup ?? ""),
    equipment: String(item.equipment ?? ""),
    difficulty: (item.difficulty ?? "BEGINNER") as ExerciseItem["difficulty"],
    thumbnailUrl: normalizeMediaUrl(asOptionalString(item.thumbnailUrl)),
    videoUrl: normalizeMediaUrl(asOptionalString(item.videoUrl))
  }));
}

export async function fetchExerciseById(exerciseId: string): Promise<ExerciseItem | null> {
  const response = await fetch(`${getApiBaseUrl()}/exercises/${exerciseId}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const item = payload?.data;
  if (!item) {
    return null;
  }

  return {
    id: String(item.id),
    slug: String(item.slug ?? ""),
    name: String(item.name ?? ""),
    primaryMuscleGroup: String(item.primaryMuscleGroup ?? ""),
    equipment: String(item.equipment ?? ""),
    difficulty: (item.difficulty ?? "BEGINNER") as ExerciseItem["difficulty"],
    thumbnailUrl: normalizeMediaUrl(asOptionalString(item.thumbnailUrl)),
    videoUrl: normalizeMediaUrl(asOptionalString(item.videoUrl))
  };
}
