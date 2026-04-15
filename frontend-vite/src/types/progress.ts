export type PinnedExercise = {
  id: string
  createdAt: string
  exercise: {
    id: string
    name: string
    primaryMuscleGroup: string
    difficulty: string
    equipment: string
    thumbnailUrl: string | null
    videoUrl: string | null
    isBodyweight: boolean
    allowsExtraLoad: boolean
  }
}

export type ExerciseProgressSession = {
  workoutSessionId: string
  completedAt: string
  maxLoadKg: number | null
  maxReps: number | null
  totalVolumeKg: number
}

export type ExerciseProgressItem = {
  pinnedAt: string
  exercise: PinnedExercise['exercise']
  sessions: ExerciseProgressSession[]
}

export type ExerciseProgressResponse = {
  maxPinned: number
  items: ExerciseProgressItem[]
}

export type BodyMeasurement = {
  id: string
  userId: string
  date: string
  photoUrl: string
  weight: number
  chest: number | null
  shoulders: number | null
  arms: number | null
  forearms: number | null
  waist: number | null
  hips: number | null
  thighs: number | null
  calves: number | null
  neck: number | null
  bmi: number | null
  bodyFatPercentage: number | null
  createdAt: string
  updatedAt: string
}

export type BodyMeasurementHistoryResponse = {
  page: number
  pageSize: number
  total: number
  items: BodyMeasurement[]
}

export type CreateBodyMeasurementInput = {
  date: string
  photoUrl: string
  weight: number
  chest?: number
  shoulders?: number
  arms?: number
  forearms?: number
  waist?: number
  hips?: number
  thighs?: number
  calves?: number
  neck?: number
  bmi?: number
  bodyFatPercentage?: number
}
