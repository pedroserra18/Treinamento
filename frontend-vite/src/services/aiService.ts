const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

export type GenerateWorkoutInput = {
  prompt: string
  muscleGroup?: string
  level?: string
  durationMin?: string
  goal?: string
  weekDays?: string
  split?: string
  equipment?: string
  advancedTechniques?: boolean
  injuries?: string
}

export type AIExercise = {
  name: string
  sets?: number
  repsMin?: number
  repsMax?: number
  restSec?: number
  notes?: string
}

export type AIWorkoutData = {
  planName: string
  exercises: AIExercise[]
}

export type SaveAIWorkoutResult = {
  planId: string
  planName: string
  savedExercises: Array<{ name: string; found: boolean; exerciseId?: string }>
}

const WORKOUT_DATA_START = '---WORKOUT_DATA_START---'
const WORKOUT_DATA_END = '---WORKOUT_DATA_END---'

/** Splits the raw AI text into the human-readable part and the structured JSON. */
export function parseAIResponse(raw: string): { displayText: string; workoutData: AIWorkoutData | null } {
  const startIdx = raw.indexOf(WORKOUT_DATA_START)
  if (startIdx === -1) {
    return { displayText: raw.trim(), workoutData: null }
  }

  const displayText = raw.slice(0, startIdx).trim()
  const remainder = raw.slice(startIdx + WORKOUT_DATA_START.length)
  const endIdx = remainder.indexOf(WORKOUT_DATA_END)
  const rawJson = (endIdx !== -1 ? remainder.slice(0, endIdx) : remainder).trim()

  try {
    const data = JSON.parse(rawJson) as AIWorkoutData
    if (data.planName && Array.isArray(data.exercises)) {
      return { displayText, workoutData: data }
    }
    return { displayText, workoutData: null }
  } catch {
    return { displayText, workoutData: null }
  }
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

// The API returns errors as { error: { message, code }, meta: {...} }
function extractApiError(payload: unknown, statusCode: number): string {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>
    if (p.error && typeof p.error === 'object') {
      const e = p.error as Record<string, unknown>
      if (typeof e.message === 'string') return e.message
    }
    if (typeof p.message === 'string') return p.message
  }
  return `Erro ${statusCode}`
}

export async function generateAIWorkout(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: GenerateWorkoutInput,
): Promise<{ displayText: string; workoutData: AIWorkoutData | null }> {
  const response = await authorizedFetch(`${API_URL}/ai/generate-workout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = await parseJsonSafe<{ text?: string; message?: string; error?: string }>(response)

  if (!response.ok) {
    throw new Error(extractApiError(payload, response.status))
  }

  if (!payload?.text) {
    throw new Error('Resposta vazia da IA')
  }

  return parseAIResponse(payload.text)
}

export async function saveAIWorkout(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: { planName: string; exercises: AIExercise[] },
): Promise<SaveAIWorkoutResult> {
  const response = await authorizedFetch(`${API_URL}/ai/save-workout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = await parseJsonSafe<SaveAIWorkoutResult & { message?: string; error?: string }>(response)

  if (!response.ok) {
    throw new Error(extractApiError(payload, response.status))
  }

  if (!payload) {
    throw new Error('Resposta inválida do servidor')
  }

  return payload
}
