import { createContext } from 'react'
import type { AuthTokens, AuthUser } from '../types/auth'

export type AuthState = {
  user: AuthUser | null
  tokens: AuthTokens | null
  ready: boolean
  isAuthenticated: boolean
  signIn: (input: { email: string; password: string }) => Promise<void>
  requestSignUpVerificationCode: (input: {
    email: string
  }) => Promise<{ delivery: 'EMAIL' }>
  signUp: (input: {
    name: string
    email: string
    password: string
    verificationCode: string
  }) => Promise<void>
  startGoogleSignIn: () => Promise<void>
  completeGoogleSignIn: (code: string, state: string) => Promise<void>
  completeOnboarding: (input: {
    sex: 'MALE' | 'FEMALE' | 'OTHER'
    availableDaysPerWeek: number
  }) => Promise<void>
  logout: () => Promise<void>
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export const AuthContext = createContext<AuthState | undefined>(undefined)
