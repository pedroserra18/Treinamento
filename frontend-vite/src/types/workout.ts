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
    thumbnailUrl: string | null
    videoUrl: string | null
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
  isBodyweight: boolean
  allowsExtraLoad: boolean
  thumbnailUrl: string | null
  videoUrl: string | null
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
