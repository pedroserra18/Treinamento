import { ApiError } from './workoutService'

// Camada de serviço das recomendações de treino da Home. Encapsula a chamada
// à API (parse + normalização) para a página não lidar com fetch/JSON cru.
// `ApiError` (reexportado) preserva o `code` do backend — o caller checa
// `ONBOARDING_REQUIRED` pra mostrar a mensagem certa e cair no fallback.

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

export const fallbackRecommendations: WorkoutRecommendation[] = [
  {
    division: 'Push Pull Legs',
    daysPerWeek: 5,
    rationale: 'Equilíbrio entre hipertrofia e recuperação para rotina consistente.',
    sessions: [
      {
        dayNumber: 1,
        focus: 'Push',
        exercises: [
          { id: 'p1', name: 'Supino reto', sets: 4, reps: '8-10', restSeconds: 90 },
          { id: 'p2', name: 'Desenvolvimento halteres', sets: 3, reps: '10-12', restSeconds: 75 },
          { id: 'p3', name: 'Tríceps corda', sets: 3, reps: '12-15', restSeconds: 60 },
        ],
      },
    ],
  },
  {
    division: 'Bro Split',
    daysPerWeek: 5,
    rationale: 'Maior foco por grupamento para ganho de volume por sessão.',
    sessions: [
      {
        dayNumber: 1,
        focus: 'Chest',
        exercises: [
          { id: 'b1', name: 'Supino inclinado', sets: 4, reps: '6-8', restSeconds: 120 },
          { id: 'b2', name: 'Crucifixo no cabo', sets: 3, reps: '10-12', restSeconds: 75 },
          { id: 'b3', name: 'Crossover polia alta', sets: 3, reps: '12-15', restSeconds: 60 },
        ],
      },
    ],
  },
]

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
