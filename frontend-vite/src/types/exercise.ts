export type Exercise = {
  id: string
  slug: string
  name: string
  primaryMuscleGroup: string
  equipment: string
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
  thumbnailUrl?: string | null
  videoUrl?: string | null
}
