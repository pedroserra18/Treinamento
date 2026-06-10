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
    // Versão dos termos vigente no momento do signup (passa CURRENT_TERMS_VERSION).
    // Opcional pra compat com chamadas legadas que ainda não passam — backend
    // grava acceptedTermsAt=null nesse caso e o gate força aceite depois.
    termsVersion?: string
  }) => Promise<void>
  // Registra aceite da versão atual dos termos pro user logado. Disparado
  // pelo TermsAcceptanceGate quando user.acceptedTermsVersion está defasado.
  acceptTerms: (version: string) => Promise<void>
  updateHandle: (handle: string) => Promise<void>
  // Profile updates that also refresh the cached AuthUser. These exist on
  // the context (instead of being called from the page directly) so name
  // and email stay in sync everywhere — feed posts, comments, etc.
  updateName: (name: string) => Promise<void>
  updateEmail: (newEmail: string, verificationCode: string) => Promise<void>
  startGoogleSignIn: () => Promise<void>
  completeGoogleSignIn: (code: string, state: string) => Promise<void>
  // Linkagem do Google numa conta JÁ autenticada (settings → conta).
  // Diferente do signIn: não cria conta, anexa o provider na atual.
  startGoogleLink: () => Promise<void>
  completeGoogleLink: (code: string, state: string) => Promise<void>
  completeOnboarding: (input: {
    sex: 'MALE' | 'FEMALE' | 'OTHER'
    availableDaysPerWeek: number
    birthDate: string
    experienceLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
    primaryGoal:
      | 'STRENGTH'
      | 'HYPERTROPHY'
      | 'WEIGHT_LOSS'
      | 'ENDURANCE'
      | 'GENERAL_FITNESS'
    heightCm?: number
    weightKg?: number
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
