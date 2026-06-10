export type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
export type PrimaryGoal =
  | 'STRENGTH'
  | 'HYPERTROPHY'
  | 'WEIGHT_LOSS'
  | 'ENDURANCE'
  | 'GENERAL_FITNESS'

// Tier comercial. ADMIN é tratado como PRO no payload do backend
// (resolveEffectivePlan), então o client vê só 2 valores.
export type PlanTier = 'FREE' | 'PRO'

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
  // Tier comercial — usado pra renderizar badge, esconder upsell, etc.
  // ADMIN aparece como 'PRO' (resolução é no backend).
  plan: PlanTier
  planExpiresAt: string | null
  // Aceite dos termos/privacidade. null pra users criados antes do feature
  // existir; nesse caso o TermsAcceptanceGate força aceite na primeira
  // entrada autenticada.
  acceptedTermsAt: string | null
  acceptedTermsVersion: string | null
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
