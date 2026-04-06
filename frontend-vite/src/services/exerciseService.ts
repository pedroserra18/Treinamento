import type { Exercise } from '../types/exercise'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

function toExercise(value: Record<string, unknown>): Exercise {
  return {
    id: String(value.id ?? ''),
    slug: String(value.slug ?? ''),
    name: String(value.name ?? ''),
    primaryMuscleGroup: String(value.primaryMuscleGroup ?? ''),
    equipment: String(value.equipment ?? ''),
    difficulty: (value.difficulty ?? 'BEGINNER') as Exercise['difficulty'],
    thumbnailUrl: typeof value.thumbnailUrl === 'string' ? value.thumbnailUrl : null,
    videoUrl: typeof value.videoUrl === 'string' ? value.videoUrl : null,
  }
}

export async function getExercises(): Promise<Exercise[]> {
  const response = await fetch(`${API_URL}/exercises`)
  if (!response.ok) {
    throw new Error('Falha ao carregar exercicios')
  }

  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> }
  return (payload.data ?? []).map(toExercise)
}

export async function getExerciseById(id: string): Promise<Exercise> {
  const response = await fetch(`${API_URL}/exercises/${id}`)
  if (!response.ok) {
    throw new Error('Falha ao carregar detalhe do exercicio')
  }

  const payload = (await response.json()) as { data?: Record<string, unknown> }
  if (!payload.data) {
    throw new Error('Exercicio nao encontrado')
  }

  return toExercise(payload.data)
}
