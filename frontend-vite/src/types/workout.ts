export type RecommendationTemplate = {
  key: string
  title: string
  structure: string[]
}

export type RecommendationTemplateResponse = {
  daysPerWeek: number
  sex: 'MALE' | 'FEMALE' | 'OTHER'
  warning: string | null
  templates: RecommendationTemplate[]
}

export type PlanExercise = {
  id: string
  customName: string | null
  orderIndex: number
  sets: number | null
  repsMin: number | null
  repsMax: number | null
  durationSec: number | null
  restSec: number | null
  notes: string | null
  performanceNote?: {
    rpe?: number
    rir?: number
    loadKg?: number
  }
  exercise: {
    id: string
    name: string
    primaryMuscleGroup: string
    difficulty: string
    equipment: string
    isBodyweight: boolean
    allowsExtraLoad: boolean
    trackingType: 'REPS' | 'TIME' | 'DISTANCE' | 'REPS_AND_TIME'
    thumbnailUrl: string | null
    videoUrl: string | null
  }
}

export type PlanCardio = {
  id: string
  orderIndex: number
  type: CardioType
  durationSec: number
  distanceMeters: number | null
  notes: string | null
}

export type WorkoutPlan = {
  id: string
  name: string
  description: string | null
  status: string
  createdAt: string
  exercises: PlanExercise[]
  cardio?: PlanCardio[]
}

export type ExerciseOption = {
  id: string
  name: string
  primaryMuscleGroup: string
  difficulty: string
  equipment: string
  isBodyweight: boolean
  allowsExtraLoad: boolean
  trackingType: 'REPS' | 'TIME' | 'DISTANCE' | 'REPS_AND_TIME'
  thumbnailUrl: string | null
  videoUrl: string | null
  // Opcional pra retro-compat com respostas antigas. PRIVATE = criado
  // pelo próprio usuário; GLOBAL = catálogo padrão. Usado pelo picker
  // pra agrupar em "Personalizados" vs "Todos".
  scope?: 'GLOBAL' | 'PRIVATE'
}

export type CardioType =
  | 'WALK' | 'RUN' | 'BIKE' | 'STAIRS' | 'ELLIPTICAL' | 'ROW' | 'JUMP_ROPE' | 'SWIM' | 'OTHER'

export type CardioEntryInput = {
  type: CardioType
  durationSec: number
  distanceMeters?: number
  calories?: number
  notes?: string
}

export type CardioEntry = {
  id: string
  type: CardioType
  durationSec: number
  distanceMeters: number | null
  calories: number | null
  notes: string | null
}

export type WorkoutSessionHistory = {
  id: string
  status: string
  workoutPlanId: string | null
  workoutPlan: {
    id: string
    name: string
    exercises: Array<{
      exerciseId: string
      orderIndex: number
    }>
  } | null
  scheduledAt: string
  startedAt: string | null
  endedAt: string | null
  durationSec: number | null
  caloriesBurned: number | null
  notes: string | null
  historyEntriesCount: number
  history: Array<{
    id: string
    executionOrder: number
    setNumber: number
    reps: number | null
    weightKg: number | null
    durationSec: number | null
    distanceMeters: number | null
    perceivedExertion: number | null
    notes: string | null
    completedAt: string
    exercise: {
      id: string
      name: string
      primaryMuscleGroup: string
    }
  }>
  cardioEntries?: CardioEntry[]
}

export type WorkoutHistoryResponse = {
  page: number
  pageSize: number
  total: number
  items: WorkoutSessionHistory[]
}

export type WorkoutSession = {
  id: string
  status: string
  workoutPlanId: string | null
  startedAt: string | null
  endedAt: string | null
  durationSec: number | null
  notes: string | null
}

export type LatestExerciseSetPerformance = {
  setNumber: number
  reps: number | null
  weightKg: number | null
  durationSec: number | null
  distanceMeters: number | null
  perceivedExertion: number | null
  rir: number | null
}

export type LatestExercisePerformanceItem = {
  exerciseId: string
  workoutSessionId: string
  completedAt: string
  sets: LatestExerciseSetPerformance[]
}

export type LatestExercisePerformanceResponse = {
  items: LatestExercisePerformanceItem[]
}

export type ExercisePersonalRecord = {
  exerciseId: string
  maxLoadKg: number | null
  maxReps: number | null
}

export type ExercisePersonalRecordsResponse = {
  items: ExercisePersonalRecord[]
}
