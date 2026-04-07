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

export type ServiceError = {
  status: number;
  code: string;
  message: string;
  userMessage: string;
};

export type ServiceResult<T> = {
  data: T;
  error: ServiceError | null;
};

type RequestJsonOptions = {
  retries?: number;
  retryDelayMs?: number;
  retryOnStatuses?: number[];
};

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildFriendlyErrorMessage(status: number): string {
  if (status === 404) {
    return "Nao encontramos este recurso agora.";
  }

  if (status === 429) {
    return "Muitas requisicoes em pouco tempo. Tente novamente em instantes.";
  }

  if (status >= 500) {
    return "O servidor esta instavel no momento. Tente novamente em alguns segundos.";
  }

  if (status >= 400) {
    return "Nao foi possivel processar sua solicitacao agora.";
  }

  return "Nao foi possivel carregar os dados no momento.";
}

function buildNetworkError(): ServiceError {
  return {
    status: 0,
    code: "NETWORK_ERROR",
    message: "Network request failed",
    userMessage: "Sem conexao com a API. Verifique sua rede e tente novamente."
  };
}

function asServiceError(error: unknown): ServiceError {
  if (error && typeof error === "object" && "status" in error && "message" in error) {
    const maybeError = error as { status?: unknown; message?: unknown; code?: unknown };
    const status = Number(maybeError.status ?? 0);
    const message = String(maybeError.message ?? "Unexpected API error");
    const code = typeof maybeError.code === "string" ? maybeError.code : "API_ERROR";

    return {
      status,
      message,
      code,
      userMessage: buildFriendlyErrorMessage(status)
    };
  }

  return buildNetworkError();
}

async function requestJson(path: string, options?: RequestJsonOptions): Promise<unknown> {
  const retries = options?.retries ?? 2;
  const retryDelayMs = options?.retryDelayMs ?? 350;
  const retryOnStatuses = options?.retryOnStatuses ?? [429, 500, 502, 503, 504];
  const url = `${getApiBaseUrl()}${path}`;

  let attempt = 0;

  while (attempt <= retries) {
    try {
      const response = await fetch(url, {
        cache: "no-store"
      });

      if (response.ok) {
        return response.json();
      }

      const payload = await response
        .json()
        .catch(() => ({ errorMessage: "Unexpected API error", errorCode: "API_ERROR" }));

      const apiError = {
        status: response.status,
        message: String(payload?.errorMessage ?? `Request failed with status ${response.status}`),
        code: String(payload?.errorCode ?? "API_ERROR")
      };

      const canRetry = retryOnStatuses.includes(response.status) && attempt < retries;
      if (canRetry) {
        await sleep(retryDelayMs * (attempt + 1));
        attempt += 1;
        continue;
      }

      throw apiError;
    } catch (error) {
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        attempt += 1;
        continue;
      }

      throw error;
    }
  }

  throw buildNetworkError();
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

function parseExercise(item: Record<string, unknown>): ExerciseItem {
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

export async function fetchExercises(): Promise<ExerciseItem[]> {
  const result = await getExercisesService();
  return result.data;
}

export async function fetchExerciseById(exerciseId: string): Promise<ExerciseItem | null> {
  const result = await getExerciseByIdService(exerciseId);
  return result.data;
}

export async function getExercisesService(): Promise<ServiceResult<ExerciseItem[]>> {
  try {
    const payload = await requestJson("/exercises", {
      retries: 2,
      retryDelayMs: 300
    });

    const data = Array.isArray((payload as { data?: unknown[] })?.data)
      ? ((payload as { data: unknown[] }).data as Record<string, unknown>[])
      : [];

    return {
      data: data.map(parseExercise),
      error: null
    };
  } catch (error) {
    return {
      data: [],
      error: asServiceError(error)
    };
  }
}

export async function getExerciseByIdService(
  exerciseId: string
): Promise<ServiceResult<ExerciseItem | null>> {
  try {
    const payload = await requestJson(`/exercises/${exerciseId}`, {
      retries: 2,
      retryDelayMs: 300
    });

    const item = (payload as { data?: unknown })?.data as Record<string, unknown> | undefined;
    if (!item) {
      return {
        data: null,
        error: {
          status: 404,
          code: "NOT_FOUND",
          message: "Exercise not found",
          userMessage: "Exercicio nao encontrado."
        }
      };
    }

    return {
      data: parseExercise(item),
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: asServiceError(error)
    };
  }
}
