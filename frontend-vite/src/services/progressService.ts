import type {
  BodyMeasurement,
  BodyMeasurementHistoryResponse,
  CreateBodyMeasurementInput,
  ExerciseProgressResponse,
  PinnedExercise,
} from '../types/progress'

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

export async function listPinnedExercises(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<PinnedExercise[]> {
  const response = await authorizedFetch(`${API_URL}/progress/pinned-exercises`)
  const payload = await parsePayload<PinnedExercise[]>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar exercicios fixados')
  }

  return payload.data
}

export async function addPinnedExercise(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  exerciseId: string,
): Promise<PinnedExercise> {
  const response = await authorizedFetch(`${API_URL}/progress/pinned-exercises`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exerciseId }),
  })

  const payload = await parsePayload<PinnedExercise>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao fixar exercicio')
  }

  return payload.data
}

export async function removePinnedExercise(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  exerciseId: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/progress/pinned-exercises/${exerciseId}`, {
    method: 'DELETE',
  })

  const payload = await parsePayload<{ success: boolean }>(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao remover exercicio fixado')
  }
}

export async function getExerciseProgress(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<ExerciseProgressResponse> {
  const response = await authorizedFetch(`${API_URL}/progress/exercises`)
  const payload = await parsePayload<ExerciseProgressResponse>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar progresso de exercicios')
  }

  return payload.data
}

export async function listBodyMeasurements(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<BodyMeasurementHistoryResponse> {
  const response = await authorizedFetch(`${API_URL}/progress/body-measurements?page=1&pageSize=30`)
  const payload = await parsePayload<BodyMeasurementHistoryResponse>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar progresso corporal')
  }

  return payload.data
}

export async function createBodyMeasurement(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: CreateBodyMeasurementInput,
): Promise<BodyMeasurement> {
  const response = await authorizedFetch(`${API_URL}/progress/body-measurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = await parsePayload<BodyMeasurement>(response)

  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao salvar medida corporal')
  }

  return payload.data
}

export async function deleteBodyMeasurement(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  measurementId: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/progress/body-measurements/${measurementId}`, {
    method: 'DELETE',
  })

  const payload = await parsePayload<{ success: boolean }>(response)

  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao excluir registro corporal')
  }
}
