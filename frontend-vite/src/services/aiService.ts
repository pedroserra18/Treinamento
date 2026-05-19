const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

export type GenerateWorkoutInput = {
  // Prompt curto e específico do dia (qual dia, índice, contexto especial:
  // calistenia, iniciante, recuperação). Perfil completo vai em campos
  // estruturados abaixo — não duplicar dentro do prompt.
  prompt: string
  dayLabel?: string
  weekDays?: string
  split?: string
  muscleFrequency?: string
  level?: string
  age?: string
  gender?: string
  heightCm?: number
  weightKg?: number
  phase?: string
  goal?: string
  equipment?: string
  equipmentPreference?: string
  durationMin?: string
  exerciseCount?: string
  repRange?: string
  restTime?: string
  rirTarget?: string
  techniques?: string[]
  musclesFocus?: string[]
  injuries?: string
  usedExercises?: string[]
  extraInfo?: string
}

export type AIExercise = {
  name: string
  sets?: number
  repsMin?: number
  repsMax?: number
  restSec?: number
  notes?: string
  // Grupo muscular autoritativo (vindo da DB no backend, não regex).
  // Disponível desde Fase 1 do refactor IA — Fase 2 fará o frontend
  // preferir este campo em vez de detectMuscleGroup() no nome.
  muscleGroup?: string
}

export type AIWorkoutData = {
  planName: string
  exercises: AIExercise[]
}

export type WorkoutSection = {
  displayText: string
  workoutData: AIWorkoutData | null
}

export type SaveAIWorkoutResult = {
  planId: string
  planName: string
  savedExercises: Array<{ name: string; found: boolean; exerciseId?: string }>
}

const WORKOUT_DATA_START = '---WORKOUT_DATA_START---'
const WORKOUT_DATA_END = '---WORKOUT_DATA_END---'
const WORKOUT_SEP = '---TREINO_SEP---'

/** Splits the raw AI text into sections (one per training day) each paired with its structured data. */
export function parseAIResponse(raw: string): { sections: WorkoutSection[] } {
  // 1. Extract the JSON block from the end
  const startIdx = raw.indexOf(WORKOUT_DATA_START)
  let displayRaw = raw.trim()
  let workoutsArray: AIWorkoutData[] = []

  if (startIdx !== -1) {
    displayRaw = raw.slice(0, startIdx).trim()
    const remainder = raw.slice(startIdx + WORKOUT_DATA_START.length)
    const endIdx = remainder.indexOf(WORKOUT_DATA_END)
    const rawJson = (endIdx !== -1 ? remainder.slice(0, endIdx) : remainder).trim()

    try {
      const parsed = JSON.parse(rawJson)
      if (Array.isArray(parsed)) {
        workoutsArray = parsed.filter(
          (d): d is AIWorkoutData => Boolean(d?.planName && Array.isArray(d?.exercises)),
        )
      } else if (parsed?.planName && Array.isArray(parsed?.exercises)) {
        workoutsArray = [parsed as AIWorkoutData]
      }
    } catch {
      // ignore parse errors — workoutsArray stays empty
    }
  }

  // 2. Split display text by the separator marker
  const textParts = displayRaw
    .split(WORKOUT_SEP)
    .map((s) => s.trim())
    .filter(Boolean)

  const parts = textParts.length > 0 ? textParts : [displayRaw]

  // 3. Pair each text section with its workout data by index
  const sections: WorkoutSection[] = parts.map((text, i) => ({
    displayText: text,
    workoutData: workoutsArray[i] ?? null,
  }))

  return { sections }
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
): Promise<{ sections: WorkoutSection[] }> {
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
