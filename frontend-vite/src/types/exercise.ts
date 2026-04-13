export type Exercise = {
  id: string
  slug: string
  name: string
  primaryMuscleGroup: string
  secondaryMuscleGroup: string | null
  equipment: string
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  thumbnailUrl?: string | null
  videoUrl?: string | null
}
