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
  // Marca o primeiro dia de uma geração de plano nova (para contagem de uso).
  isFirstDay?: boolean
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
  // Músculo secundário do exercício. Usado pelo getMissingGroups em
  // bodyweight para aceitar cobertura via secundário (ex: bíceps via
  // remada supinada quando não há rosca direta possível).
  secondaryMuscleGroup?: string
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

export type ParsedSplitDay = { label: string; weekday: string }

// Interpreta uma divisão escrita em linguagem natural (opção "Outro") numa
// lista de dias (com o dia da semana citado, se houver). Usado quando o
// parser local do frontend não dá conta de frase natural.
export async function parseCustomSplitAI(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  description: string,
  daysPerWeek?: number,
): Promise<ParsedSplitDay[]> {
  const response = await authorizedFetch(`${API_URL}/ai/parse-split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, daysPerWeek }),
  })

  const payload = await parseJsonSafe<{ days?: ParsedSplitDay[]; message?: string; error?: string }>(response)
  if (!response.ok) {
    throw new Error(extractApiError(payload, response.status))
  }
  const days = Array.isArray(payload?.days)
    ? payload!.days
        .filter((d): d is ParsedSplitDay => Boolean(d && typeof d.label === 'string' && d.label.trim()))
        .map((d) => ({ label: d.label.trim(), weekday: typeof d.weekday === 'string' ? d.weekday : '' }))
    : []
  if (days.length === 0) {
    throw new Error('Não consegui identificar os dias na descrição')
  }
  return days
}

// Troca um exercício por outro do mesmo grupo (sem IA, instantâneo).
export async function swapExerciseAI(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: { muscleGroup: string; equipment?: string; exclude?: string[] },
): Promise<{ name: string; muscleGroup: string; secondaryMuscleGroup: string | null }> {
  const response = await authorizedFetch(`${API_URL}/ai/swap-exercise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseJsonSafe<{ exercise?: { name: string; muscleGroup: string; secondaryMuscleGroup: string | null }; message?: string; error?: string }>(response)
  if (!response.ok || !payload?.exercise) {
    throw new Error(extractApiError(payload, response.status))
  }
  return payload.exercise
}

export async function saveAIWorkout(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: {
    planName: string
    exercises: AIExercise[]
    // Opcionais — quando passados, agrupam saves da mesma geração no backend.
    // O cliente gera o aiGenerationId 1x por geração (todos os N dias do
    // plano completo usam o mesmo) e calcula um aiGenerationLabel humano.
    aiGenerationId?: string
    aiGenerationLabel?: string
  },
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

// ─── AI History (independente de WorkoutPlan) ───────────────────────────
//
// Histórico de gerações da IA — auto-salvo após cada geração (não depende
// de "Salvar" do user). Usado pelo botão "Ver treinos gerados" e pelo
// fluxo "Usar este treino" que clona um plano antigo pra /workouts.

// Preview de exercício do histórico — bate com AIHistoryExercisePreview
// do backend. Campos opcionais porque o quiz "IA decide" pode omitir
// sets/reps específicos.
export type AIHistoryExercisePreview = {
  name: string
  sets?: number
  repsMin?: number
  repsMax?: number
  restSec?: number
  notes?: string
  muscleGroup?: string
}

export type AIHistoryGeneration = {
  generationId: string
  generationLabel: string
  generatedAt: string // ISO
  plans: Array<{
    id: string // AIGeneratedPlan.id (não WorkoutPlan.id)
    dayLabel: string
    dayIndex: number
    planName: string
    exerciseCount: number
    // Snapshot dos exercícios pra preview no front (expand inline na sheet).
    // Vem no mesmo response do list — sem round-trip extra.
    exercises: AIHistoryExercisePreview[]
  }>
}

// POST /ai/history — chamado AUTOMATICAMENTE pelo AIWorkoutPage logo
// após gerar com sucesso. Persiste o snapshot completo.
export async function saveAIGenerationHistory(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: {
    generationId: string
    generationLabel: string
    days: Array<{
      dayIndex: number
      dayLabel: string
      planName: string
      exercises: AIExercise[]
    }>
  },
): Promise<{ saved: number }> {
  const response = await authorizedFetch(`${API_URL}/ai/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parseJsonSafe<{ data?: { saved: number } }>(response)
  if (!response.ok) {
    throw new Error(extractApiError(payload, response.status))
  }
  return payload?.data ?? { saved: 0 }
}

// GET /ai/history?limit=3 — últimas N gerações agrupadas.
export async function listAIHistory(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  limit = 3,
): Promise<AIHistoryGeneration[]> {
  const response = await authorizedFetch(`${API_URL}/ai/history?limit=${limit}`)
  const payload = await parseJsonSafe<{ data?: AIHistoryGeneration[] }>(response)
  if (!response.ok) {
    throw new Error(extractApiError(payload, response.status))
  }
  return payload?.data ?? []
}

// POST /ai/history/:historyPlanId/use — clona o snapshot pra um WorkoutPlan
// novo. Retorna o planId pra navegar no /train. Nome do helper começa com
// "clone" (não "use") pra evitar a regra do react-hooks/rules-of-hooks
// que trata identificadores que começam com "use" como hooks.
export async function cloneAIHistoryPlan(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  historyPlanId: string,
): Promise<{ planId: string; planName: string; notFoundExercises: string[] }> {
  const response = await authorizedFetch(`${API_URL}/ai/history/${historyPlanId}/use`, {
    method: 'POST',
  })
  const payload = await parseJsonSafe<{ data?: { planId: string; planName: string; notFoundExercises: string[] } }>(response)
  if (!response.ok) {
    throw new Error(extractApiError(payload, response.status))
  }
  if (!payload?.data) {
    throw new Error('Resposta inválida do servidor')
  }
  return payload.data
}
