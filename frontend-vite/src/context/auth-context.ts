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
    handle: string
    email: string
    password: string
    verificationCode: string
  }) => Promise<void>
  updateHandle: (handle: string) => Promise<void>
  startGoogleSignIn: () => Promise<void>
  completeGoogleSignIn: (code: string, state: string) => Promise<void>
  completeOnboarding: (input: {
    sex: 'MALE' | 'FEMALE' | 'OTHER'
    availableDaysPerWeek: number
  }) => Promise<void>
  refreshUser: () => Promise<void>
  applyUserPatch: (patch: Partial<AuthUser>) => void
  logout: () => Promise<void>
  // Hard-deletes the current account on the server, then wipes local auth
  // state. `confirmHandle` must equal the user's current @handle — the
  // server re-validates so the UI confirmation can't be bypassed.
  deleteAccount: (confirmHandle: string) => Promise<void>
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

export const AuthContext = createContext<AuthState | undefined>(undefined)
