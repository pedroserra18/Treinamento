export type AuthUser = {
  id: string
  name: string | null
  email: string
  role: 'USER' | 'COACH' | 'ADMIN'
  sex: 'MALE' | 'FEMALE' | 'OTHER'
  availableDaysPerWeek: number | null
  onboardingCompleted: boolean
}

export type AuthTokens = {
  accessToken: string
  refreshToken: string
}

export type AuthSession = {
  user: AuthUser
  tokens: AuthTokens
}
