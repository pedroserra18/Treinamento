import type { SetType, DropEntry } from '../../components/common/setTypeOptions'

// Tipos de domínio da tela de treino — extraídos do TrainPage pra serem
// compartilhados entre os componentes da pasta train/ (são apagados em
// runtime, então mover é risco zero). Sem lógica, só tipos.

export type TrainScreen =
  | 'DASHBOARD'
  | 'ACTIVE'
  | 'SUMMARY'
  | 'EDIT'
  | 'RECOMMENDATIONS'
  | 'NEW_ROUTINE'
  | 'SEND_ROUTINE'

export type TrainOriginMode = 'EMPTY' | 'ROUTINE'

export type TrackingType = 'REPS' | 'TIME' | 'DISTANCE' | 'REPS_AND_TIME'

export type ExerciseSetInput = {
  reps: string
  weightKg: string
  rir: string
  rpe: string
  setType: SetType
  dropSets: DropEntry[]
  clusterReps: string
  clusterCount: string
  checked: boolean
}

// Última vez que uma rotina foi usada — alimenta o CTA "Iniciar <rotina>" e o
// rótulo "último treino" nos cards da DASHBOARD. Indexado por planId.
export type LastUseInfo = {
  endedAt: string
  durationSec: number | null
  planId: string
  planName: string
}

// Filtro da lista "Minhas Rotinas" na DASHBOARD.
export type RoutineFilter = 'ALL' | 'AI' | 'CUSTOM'

export type ActiveExercise = {
  planExerciseId?: string
  exerciseId: string
  exerciseName: string
  equipment: string
  thumbnailUrl: string | null
  videoUrl: string | null
  isBodyweight: boolean
  allowsExtraLoad: boolean
  trackingType: TrackingType
  suggestedReps: string
  restDurationSec: number
  restRemainingSec: number
  restRunning: boolean
  // Wall-clock (Date.now() ms) em que o descanso DEVE terminar. Null quando
  // o timer não está rodando. Quando running, `restRemainingSec` é DERIVADO
  // disso a cada tick (max(0, (restEndsAtMs - now) / 1000)). Isso garante
  // que o descanso continua progredindo mesmo se o setInterval for pausado
  // (iOS background, navegação pra outra tela, reload da página, ...) — o
  // relógio do device não para enquanto o JS estava parado.
  restEndsAtMs: number | null
  sets: ExerciseSetInput[]
  userNote: string
  // Letra do grupo de supersérie (A, B, C, ...). Exercícios com o
  // mesmo valor são feitos em ciclo sem descanso entre eles. Null
  // significa exercício solto. Por enquanto, persiste só na sessão
  // — a rotina e o histórico de treino não armazenam supersets.
  supersetGroup?: string | null
}
