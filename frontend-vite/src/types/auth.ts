export type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
export type PrimaryGoal =
  | 'STRENGTH'
  | 'HYPERTROPHY'
  | 'WEIGHT_LOSS'
  | 'ENDURANCE'
  | 'GENERAL_FITNESS'

export type AuthUser = {
  id: string
  name: string | null
  handle: string
  email: string
  role: 'USER' | 'COACH' | 'ADMIN'
  sex: 'MALE' | 'FEMALE' | 'OTHER'
  availableDaysPerWeek: number | null
  // Onboarding v2 — todos null pra usuários antigos enquanto não preencheram
  // o novo onboarding ou editaram o perfil. Funcionalmente compatível com o
  // schema antigo: ausência = null.
  birthDate: string | null // YYYY-MM-DD
  heightCm: number | null
  weightKg: number | null
  experienceLevel: ExperienceLevel | null
  primaryGoal: PrimaryGoal | null
  onboardingCompleted: boolean
  avatarUrl?: string | null
  isPrivate?: boolean
  showFollowLists?: boolean
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
}

export type AuthSession = {
  user: AuthUser
  tokens: AuthTokens
}
