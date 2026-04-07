import type {
  ExerciseOption,
  RecommendationTemplateResponse,
  WorkoutHistoryResponse,
  WorkoutPlan,
  WorkoutSession,
} from '../types/workout'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

async function parsePayload<T>(response: Response): Promise<{ data?: T; errorMessage?: string }> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null

  return {
    data: payload?.data,
    errorMessage: payload?.error?.message,
  }
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

export async function searchExercisesForPlan(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: { q?: string; primaryMuscleGroup?: string; limit?: number },
): Promise<ExerciseOption[]> {
  const query = new URLSearchParams({
    limit: String(input.limit ?? 10),
  })

  if (input.q?.trim()) {
    query.set('q', input.q.trim())
  }

  if (input.primaryMuscleGroup) {
    query.set('primaryMuscleGroup', input.primaryMuscleGroup)
  }

  const response = await authorizedFetch(`${API_URL}/workouts/exercises/search?${query.toString()}`)
  const payload = await parsePayload<ExerciseOption[]>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao buscar exercicios')
  }

  return payload.data
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
    sets?: number | null
    repsMin?: number | null
    repsMax?: number | null
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
