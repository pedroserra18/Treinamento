import type { Exercise } from '../types/exercise'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

async function safeJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null
}

function toExercise(value: Record<string, unknown>): Exercise {
  const rawSecondaryMuscleGroup = value.secondaryMuscleGroup

  return {
    id: String(value.id ?? ''),
    slug: String(value.slug ?? ''),
    name: String(value.name ?? ''),
    primaryMuscleGroup: String(value.primaryMuscleGroup ?? ''),
    secondaryMuscleGroup:
      typeof rawSecondaryMuscleGroup === 'string' && rawSecondaryMuscleGroup.trim().length > 0
        ? rawSecondaryMuscleGroup
        : null,
    equipment: String(value.equipment ?? ''),
    difficulty: (value.difficulty ?? 'BEGINNER') as Exercise['difficulty'],
    thumbnailUrl: typeof value.thumbnailUrl === 'string' ? value.thumbnailUrl : null,
    videoUrl: typeof value.videoUrl === 'string' ? value.videoUrl : null,
  }
}

export async function getExerciseById(id: string): Promise<Exercise> {
  if (!id || id.trim().length < 6) {
    throw new Error('Exercicio invalido')
  }

  const response = await fetch(`${API_URL}/exercises/${id}`)
  const payload = await safeJson<{ data?: Record<string, unknown> }>(response)

  if (!response.ok) {
    throw new Error('Falha ao carregar detalhe do exercicio')
  }

  if (!payload?.data) {
    throw new Error('Exercicio nao encontrado')
  }

  return toExercise(payload.data)
}

export async function updateExerciseSecondaryMuscleGroup(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: { exerciseId: string; secondaryMuscleGroup: string | null },
): Promise<Exercise> {
  if (!input.exerciseId || input.exerciseId.trim().length < 6) {
    throw new Error('Exercicio invalido')
  }

  const response = await authorizedFetch(`${API_URL}/exercises/${input.exerciseId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      secondaryMuscleGroup: input.secondaryMuscleGroup,
    }),
  })

  const payload = await safeJson<{ data?: Record<string, unknown>; error?: { message?: string } }>(response)
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error?.message ?? 'Falha ao atualizar musculo secundario')
  }

  return toExercise(payload.data)
}
