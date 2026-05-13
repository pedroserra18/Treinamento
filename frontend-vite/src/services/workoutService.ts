import type {
  ExerciseOption,
  LatestExercisePerformanceResponse,
  RecommendationTemplateResponse,
  WorkoutHistoryResponse,
  WorkoutPlan,
  WorkoutSession,
} from '../types/workout'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

type FallbackHistoryEntry = {
  exerciseId: string
  setNumber: number
  reps: number | null
  weightKg: number | null
  durationSec: number | null
  distanceMeters: number | null
  notes: string | null
}

type FallbackHistorySession = {
  id: string
  endedAt: string | null
  history?: FallbackHistoryEntry[]
}

function extractRirFromNotes(notes: string | null | undefined): number | null {
  if (!notes) {
    return null
  }

  const match = notes.match(/RIR\s*:\s*(\d+)/i)
  if (!match) {
    return null
  }

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

async function getLatestExercisePerformanceFallback(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  exerciseIds: string[],
): Promise<LatestExercisePerformanceResponse> {
  const response = await authorizedFetch(`${API_URL}/workouts/history?page=1&pageSize=20`)
  const payload = await parsePayload<{ items: FallbackHistorySession[] }>(response)

  if (!response.ok || !payload.data?.items) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar historico por exercicio')
  }

  const targetIds = new Set(exerciseIds)
  const latestByExercise = new Map<
    string,
    {
      workoutSessionId: string
      completedAt: string
      sets: Array<{
        setNumber: number
        reps: number | null
        weightKg: number | null
        durationSec: number | null
        distanceMeters: number | null
        perceivedExertion: number | null
        rir: number | null
      }>
    }
  >()

  for (const session of payload.data.items) {
    if (!session.history || session.history.length === 0) {
      continue
    }

    for (const entry of session.history) {
      if (!targetIds.has(entry.exerciseId) || latestByExercise.has(entry.exerciseId)) {
        continue
      }

      const sets = session.history
        .filter((item) => item.exerciseId === entry.exerciseId)
        .map((item) => ({
          setNumber: item.setNumber,
          reps: item.reps,
          weightKg: item.weightKg,
          durationSec: item.durationSec ?? null,
          distanceMeters: item.distanceMeters ?? null,
          perceivedExertion: null,
          rir: extractRirFromNotes(item.notes),
        }))
        .sort((a, b) => a.setNumber - b.setNumber)

      latestByExercise.set(entry.exerciseId, {
        workoutSessionId: session.id,
        completedAt: session.endedAt ?? new Date().toISOString(),
        sets,
      })
    }
  }

  return {
    items: Array.from(latestByExercise.entries()).map(([exerciseId, info]) => ({
      exerciseId,
      workoutSessionId: info.workoutSessionId,
      completedAt: info.completedAt,
      sets: info.sets,
    })),
  }
}

async function parsePayload<T>(response: Response): Promise<{ data?: T; errorMessage?: string }> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null

  return {
    data: payload?.data,
    errorMessage: payload?.error?.message,
  }
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function isSubsequence(query: string, text: string): boolean {
  let queryIndex = 0

  for (let i = 0; i < text.length && queryIndex < query.length; i += 1) {
    if (text[i] === query[queryIndex]) {
      queryIndex += 1
    }
  }

  return queryIndex === query.length
}

function levenshteinDistanceWithinLimit(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) {
    return limit + 1
  }

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i
    let rowMin = curr[0]

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      curr[j] = value
      if (value < rowMin) {
        rowMin = value
      }
    }

    if (rowMin > limit) {
      return limit + 1
    }

    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j]
    }
  }

  return prev[b.length]
}

function fuzzyScoreExercise(name: string, query: string): number {
  const normalizedName = normalizeSearchText(name)
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return 0
  }

  if (normalizedName === normalizedQuery) {
    return 120
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 105
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 95
  }

  const words = normalizedName.split(/\s+/).filter(Boolean)
  if (words.some((word) => word.startsWith(normalizedQuery))) {
    return 90
  }

  if (isSubsequence(normalizedQuery, normalizedName)) {
    return 75
  }

  const maxDistance = normalizedQuery.length <= 4 ? 1 : 2
  let bestDistance = Number.POSITIVE_INFINITY

  for (const word of words.length > 0 ? words : [normalizedName]) {
    const distance = levenshteinDistanceWithinLimit(normalizedQuery, word, maxDistance)
    if (distance < bestDistance) {
      bestDistance = distance
    }
  }

  if (bestDistance <= maxDistance) {
    return 70 - bestDistance * 10
  }

  return 0
}

export async function getRecommendationTemplates(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: { daysPerWeek: number; sex: 'MALE' | 'FEMALE' | 'OTHER' },
): Promise<RecommendationTemplateResponse> {
  const query = new URLSearchParams({
    daysPerWeek: String(input.daysPerWeek),
    sex: input.sex,
  })

  const response = await authorizedFetch(`${API_URL}/workouts/recommendation-templates?${query}`)
  const payload = await parsePayload<RecommendationTemplateResponse>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar recomendacoes de estrutura')
  }

  return payload.data
}

export async function listWorkoutPlans(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<WorkoutPlan[]> {
  const response = await authorizedFetch(`${API_URL}/workouts/plans`)
  const payload = await parsePayload<WorkoutPlan[]>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar treinos')
  }

  return payload.data
}

export async function createWorkoutPlan(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: {
    name: string
    description?: string
    source?: 'CUSTOM' | 'RECOMMENDATION'
    templateKey?: string
    daysPerWeek?: number
  },
): Promise<WorkoutPlan> {
  const response = await authorizedFetch(`${API_URL}/workouts/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = await parsePayload<WorkoutPlan>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao criar treino')
  }

  return payload.data
}

export async function deleteWorkoutPlan(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  planId: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/workouts/plans/${planId}`, {
    method: 'DELETE',
  })

  const payload = await parsePayload<{ success: boolean }>(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao excluir treino')
  }
}

export async function updateWorkoutPlan(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  planId: string,
  input: {
    name?: string
    description?: string | null
  },
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/workouts/plans/${planId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = await parsePayload(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao atualizar treino')
  }
}

export async function searchExercisesForPlan(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: { q?: string; primaryMuscleGroup?: string; limit?: number },
): Promise<ExerciseOption[]> {
  const normalizeMediaUrl = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  const mapRawExerciseToOption = (value: Record<string, unknown>): ExerciseOption => {
    const rawTracking = String(value.trackingType ?? 'REPS')
    const trackingType: ExerciseOption['trackingType'] =
      rawTracking === 'TIME' || rawTracking === 'DISTANCE' || rawTracking === 'REPS_AND_TIME'
        ? rawTracking
        : 'REPS'
    return {
      id: String(value.id ?? ''),
      name: String(value.name ?? ''),
      primaryMuscleGroup: String(value.primaryMuscleGroup ?? ''),
      difficulty: String(value.difficulty ?? ''),
      equipment: String(value.equipment ?? ''),
      isBodyweight: Boolean(value.isBodyweight),
      allowsExtraLoad: Boolean(value.allowsExtraLoad),
      trackingType,
      thumbnailUrl: normalizeMediaUrl(value.thumbnailUrl),
      videoUrl: normalizeMediaUrl(value.videoUrl),
    }
  }

  const normalizedQ = input.q?.trim() ?? ''
  const normalizedMuscleFilter = input.primaryMuscleGroup?.trim() ?? ''
  const hasFilter = Boolean(normalizedQ || input.primaryMuscleGroup)
  const compatibleLimit = Math.max(1, Math.min(input.limit ?? 10, 30))

  // Compatibility fallback: some backend versions reject empty search on /workouts/exercises/search.
  if (!hasFilter) {
    const response = await authorizedFetch(`${API_URL}/exercises`)
    const payload = await parsePayload<Array<Record<string, unknown>>>(response)

    if (!response.ok || !payload.data) {
      throw new Error(payload.errorMessage ?? 'Falha ao buscar exercicios')
    }

    const limit = Math.max(1, input.limit ?? 200)
    return payload.data.map(mapRawExerciseToOption).slice(0, limit)
  }

  const query = new URLSearchParams({
    limit: String(compatibleLimit),
  })

  if (normalizedQ) {
    query.set('q', normalizedQ)
  }

  if (input.primaryMuscleGroup) {
    query.set('primaryMuscleGroup', input.primaryMuscleGroup)
  }

  const response = await authorizedFetch(`${API_URL}/workouts/exercises/search?${query.toString()}`)
  const payload = await parsePayload<ExerciseOption[]>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao buscar exercicios')
  }

  const normalized = payload.data.map((item) => mapRawExerciseToOption(item as unknown as Record<string, unknown>))
  let resolved = normalized

  // Compatibility fallback: old backend versions of /workouts/exercises/search may omit thumbnail/video.
  const hasMissingMedia = resolved.some((item) => item.thumbnailUrl == null && item.videoUrl == null)
  if (hasMissingMedia) {
    try {
      const catalogResponse = await authorizedFetch(`${API_URL}/exercises`)
      const catalogPayload = await parsePayload<Array<Record<string, unknown>>>(catalogResponse)

      if (catalogResponse.ok && catalogPayload.data) {
        const mediaById = new Map<string, { thumbnailUrl: string | null; videoUrl: string | null }>()
        catalogPayload.data.forEach((entry) => {
          const id = String(entry.id ?? '')
          if (!id) {
            return
          }

          mediaById.set(id, {
            thumbnailUrl: normalizeMediaUrl(entry.thumbnailUrl),
            videoUrl: normalizeMediaUrl(entry.videoUrl),
          })
        })

        resolved = resolved.map((item) => {
          if (item.thumbnailUrl || item.videoUrl) {
            return item
          }

          const media = mediaById.get(item.id)
          if (!media) {
            return item
          }

          return {
            ...item,
            thumbnailUrl: media.thumbnailUrl,
            videoUrl: media.videoUrl,
          }
        })
      }
    } catch {
      // Keep search results even if media enrichment fails.
    }
  }

  // Fuzzy fallback for partial/typo queries if backend returned no matches.
  // This keeps UX resilient while preserving backend as the primary filter source.
  if (normalizedQ && resolved.length === 0) {
    try {
      const fallbackCatalogResponse = await authorizedFetch(`${API_URL}/exercises`)
      const fallbackCatalogPayload = await parsePayload<Array<Record<string, unknown>>>(fallbackCatalogResponse)

      if (!fallbackCatalogResponse.ok || !fallbackCatalogPayload.data) {
        return resolved
      }

      const fuzzyMatches = fallbackCatalogPayload.data
        .map(mapRawExerciseToOption)
        .filter((option) =>
          normalizedMuscleFilter ? option.primaryMuscleGroup === normalizedMuscleFilter : true,
        )
        .map((option) => ({
          option,
          score: fuzzyScoreExercise(option.name, normalizedQ),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name))
        .slice(0, Math.max(1, input.limit ?? 200))
        .map((item) => item.option)

      if (fuzzyMatches.length > 0) {
        return fuzzyMatches
      }
    } catch {
      return resolved
    }
  }

  return resolved
}

export async function addExerciseToPlan(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  planId: string,
  input: {
    exerciseId: string
    insertAt?: number
    sets?: number
    repsMin?: number
    repsMax?: number
    durationSec?: number
    restSec?: number
    notes?: string
  },
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/workouts/plans/${planId}/exercises`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = await parsePayload(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao adicionar exercicio')
  }
}

export async function updatePlanExercise(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  planId: string,
  planExerciseId: string,
  input: {
    exerciseId?: string
    orderIndex?: number
    customName?: string | null
    sets?: number | null
    repsMin?: number | null
    repsMax?: number | null
    restSec?: number | null
    notes?: string | null
  },
): Promise<void> {
  const response = await authorizedFetch(
    `${API_URL}/workouts/plans/${planId}/exercises/${planExerciseId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  )

  const payload = await parsePayload(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao atualizar exercicio do treino')
  }
}

export async function deletePlanExercise(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  planId: string,
  planExerciseId: string,
): Promise<void> {
  const response = await authorizedFetch(
    `${API_URL}/workouts/plans/${planId}/exercises/${planExerciseId}`,
    {
      method: 'DELETE',
    },
  )

  const payload = await parsePayload(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao remover exercicio do treino')
  }
}

export async function reorderPlanExercises(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  planId: string,
  orderedExerciseIds: string[],
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/workouts/plans/${planId}/exercises/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedExerciseIds }),
  })

  const payload = await parsePayload(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao reordenar exercicios')
  }
}

export async function startWorkoutSession(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: { workoutPlanId?: string },
): Promise<WorkoutSession> {
  const response = await authorizedFetch(`${API_URL}/workouts/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = await parsePayload<WorkoutSession>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao iniciar treino')
  }

  return payload.data
}

export async function completeWorkoutSession(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  sessionId: string,
  input: {
    durationSec: number
    notes?: string
    exercises?: Array<{
      exerciseId: string
      setNumber: number
      reps?: number
      durationSec?: number
      distanceMeters?: number
      weightKg?: number
      perceivedExertion?: number
      notes?: string
    }>
  },
): Promise<WorkoutSession> {
  const response = await authorizedFetch(`${API_URL}/workouts/${sessionId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = await parsePayload<WorkoutSession>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao concluir treino')
  }

  return payload.data
}

export async function listWorkoutHistory(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<WorkoutHistoryResponse> {
  const response = await authorizedFetch(`${API_URL}/workouts/history?page=1&pageSize=20`)
  const payload = await parsePayload<WorkoutHistoryResponse>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar historico de treinos')
  }

  return payload.data
}

export async function updateHistoryDuration(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  sessionId: string,
  durationSec: number,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/workouts/history/${sessionId}/duration`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ durationSec }),
  })

  const payload = await parsePayload(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao atualizar duracao')
  }
}

export async function createManualHistory(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: {
    workoutPlanId?: string
    title?: string
    durationSec: number
    performedAt?: string
    notes?: string
  },
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/workouts/history/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = await parsePayload(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao registrar historico manual')
  }
}

export async function getLatestExercisePerformance(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  exerciseIds: string[],
): Promise<LatestExercisePerformanceResponse> {
  const normalizedIds = Array.from(new Set(exerciseIds)).filter(Boolean)
  if (normalizedIds.length === 0) {
    return { items: [] }
  }

  const response = await authorizedFetch(`${API_URL}/workouts/history/latest-exercises`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exerciseIds: normalizedIds }),
  })

  const payload = await parsePayload<LatestExercisePerformanceResponse>(response)

  if (response.ok && payload.data) {
    return payload.data
  }

  if (response.status === 404) {
    return getLatestExercisePerformanceFallback(authorizedFetch, normalizedIds)
  }

  throw new Error(payload.errorMessage ?? 'Falha ao carregar historico por exercicio')
}
