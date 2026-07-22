import { ApiError, createWorkoutPlanWithExercises } from './workoutService'
import type { WorkoutPlan } from '../types/workout'

// Camada de serviço das recomendações de treino da Home. Encapsula a chamada
// à API (parse + normalização) para a página não lidar com fetch/JSON cru.
// `ApiError` (reexportado) preserva o `code` do backend — o caller checa
// `ONBOARDING_REQUIRED` pra mostrar o CTA de onboarding.

export { ApiError }

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type WorkoutRecommendation = {
  division: string
  daysPerWeek: number
  rationale: string
  sessions: Array<{
    dayNumber: number
    focus: string
    exercises: Array<{
      id: string
      name: string
      sets: number
      reps: string
      restSeconds: number
    }>
  }>
}

export function normalizeDivisionLabel(value: string): string {
  return value === 'Torso Legs' ? 'Torso Limbs' : value
}

// Nome determinístico da rotina criada a partir de um dia da recomendação.
// Usado na criação (payload) E na tela de detalhe pra casar se o dia já foi
// salvo em Treinar (match por nome).
export function recommendationPlanName(rec: WorkoutRecommendation, sessionIndex = 0): string {
  // O backend já garante foco ÚNICO por dia (ex.: Full Body 1/2/3, Push/Pull/
  // Legs), então o nome da rotina é só o foco — limpo e sem colisão de "salvo".
  return rec.sessions[sessionIndex]?.focus ?? 'Treino'
}

// Busca as recomendações da Home (top 2, com a divisão já normalizada). Lança
// `ApiError` com o `code` do backend em falha — o caller decide fallback/mensagem.
export async function getWorkoutRecommendations(
  authorizedFetch: AuthorizedFetch,
): Promise<WorkoutRecommendation[]> {
  const response = await authorizedFetch(`${API_URL}/recommendations/workout`)
  const payload = (await response.json().catch(() => null)) as
    | { data?: { recommendations?: WorkoutRecommendation[] }; error?: { message?: string; code?: string } }
    | null

  if (!response.ok || !payload?.data?.recommendations) {
    throw new ApiError(payload?.error?.message ?? 'Falha ao carregar recomendações', {
      code: payload?.error?.code,
      status: response.status,
    })
  }

  return payload.data.recommendations.slice(0, 2).map((item) => ({
    ...item,
    division: normalizeDivisionLabel(item.division),
  }))
}

// Converte a prescrição de reps ("8-10", "10", "12–15") em {repsMin, repsMax}
// pro payload de criação de rotina. Sem número reconhecível → objeto vazio.
export function parseReps(reps: string): { repsMin?: number; repsMax?: number } {
  const range = reps.match(/(\d+)\s*[-–]\s*(\d+)/)
  if (range) {
    return { repsMin: Number(range[1]), repsMax: Number(range[2]) }
  }
  const single = reps.match(/(\d+)/)
  if (single) {
    return { repsMin: Number(single[1]), repsMax: Number(single[1]) }
  }
  return {}
}

// Payload de criação de rotina a partir da sessão `sessionIndex` da
// recomendação. Os `id` dos exercícios são ids reais do banco (recomendação
// da API com onboarding completo).
export function recommendationToPlanInput(rec: WorkoutRecommendation, sessionIndex = 0): {
  name: string
  description: string
  source: 'RECOMMENDATION'
  exercises: Array<{ exerciseId: string; sets?: number; repsMin?: number; repsMax?: number; restSec?: number }>
} {
  const session = rec.sessions[sessionIndex]
  return {
    name: recommendationPlanName(rec, sessionIndex),
    description: `Rotina gerada a partir da recomendação ${rec.division}.`,
    source: 'RECOMMENDATION',
    exercises: (session?.exercises ?? []).map((e) => ({
      exerciseId: e.id,
      sets: e.sets,
      ...parseReps(e.reps),
      restSec: e.restSeconds,
    })),
  }
}

// Cria a rotina (1ª sessão) da recomendação na tela Treinar. Propaga o
// ApiError do backend (ex.: PLAN_LIMIT_REACHED) — o caller usa
// catchPlanLimitError pra abrir o upsell PRO.
export async function createPlanFromRecommendation(
  authorizedFetch: AuthorizedFetch,
  rec: WorkoutRecommendation,
  sessionIndex = 0,
): Promise<WorkoutPlan> {
  return createWorkoutPlanWithExercises(authorizedFetch, recommendationToPlanInput(rec, sessionIndex))
}
