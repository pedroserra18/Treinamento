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
  orderIndex: number
  sets: number | null
  repsMin: number | null
  repsMax: number | null
  durationSec: number | null
  restSec: number | null
  notes: string | null
  exercise: {
    id: string
    name: string
    primaryMuscleGroup: string
    difficulty: string
  }
}

export type WorkoutPlan = {
  id: string
  name: string
  description: string | null
  status: string
  createdAt: string
  exercises: PlanExercise[]
}

export type ExerciseOption = {
  id: string
  name: string
  primaryMuscleGroup: string
  difficulty: string
  equipment: string
}

export type WorkoutSessionHistory = {
  id: string
  status: string
  workoutPlanId: string | null
  workoutPlan: {
    id: string
    name: string
  } | null
  scheduledAt: string
  startedAt: string | null
  endedAt: string | null
  durationSec: number | null
  notes: string | null
  historyEntriesCount: number
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
