import { useEffect, useState } from 'react'

import {
  getGoogleAuthorizationUrl,
  getProfile,
  loginWithEmail,
  loginWithGoogleCode,
  refreshAuthToken,
  registerWithEmail,
  secureLogout,
} from '../services/authService'
import type { AuthTokens, AuthUser } from '../types/auth'
import { AuthContext, type AuthState } from './auth-context'

const storageKey = 'frontend-vite-auth'

type StoredAuth = {
  user: AuthUser
  tokens: AuthTokens
}

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      return null
    }

    return JSON.parse(raw) as StoredAuth
  } catch {
    return null
  }
}

function persistAuth(user: AuthUser, tokens: AuthTokens) {
  localStorage.setItem(storageKey, JSON.stringify({ user, tokens }))
}

function clearStoredAuth() {
  localStorage.removeItem(storageKey)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [storedAuth] = useState<StoredAuth | null>(() => readStoredAuth())
  const [user, setUser] = useState(storedAuth?.user ?? null)
  const [tokens, setTokens] = useState(storedAuth?.tokens ?? null)
  const [ready, setReady] = useState(storedAuth === null)

  useEffect(() => {
    if (!storedAuth) {
      return
    }

    void getProfile(storedAuth.tokens.accessToken)
      .then((profile) => {
        setUser(profile)
        persistAuth(profile, storedAuth.tokens)
      })
      .catch(async () => {
        try {
          const renewed = await refreshAuthToken(storedAuth.tokens.refreshToken)
          const profile = await getProfile(renewed.accessToken)
          setTokens(renewed)
          setUser(profile)
          persistAuth(profile, renewed)
        } catch {
          setUser(null)
          setTokens(null)
          clearStoredAuth()
        }
      })
      .finally(() => {
        setReady(true)
      })
  }, [storedAuth])

  const signIn: AuthState['signIn'] = async (input) => {
    const session = await loginWithEmail(input)
    setUser(session.user)
    setTokens(session.tokens)
    persistAuth(session.user, session.tokens)
  }

  const signUp: AuthState['signUp'] = async (input) => {
    const session = await registerWithEmail(input)
    setUser(session.user)
    setTokens(session.tokens)
    persistAuth(session.user, session.tokens)
  }

  const startGoogleSignIn: AuthState['startGoogleSignIn'] = async () => {
    const authorizationUrl = await getGoogleAuthorizationUrl()
    window.location.href = authorizationUrl
  }

  const completeGoogleSignIn: AuthState['completeGoogleSignIn'] = async (code, state) => {
    const session = await loginWithGoogleCode(code, state)
    setUser(session.user)
    setTokens(session.tokens)
    persistAuth(session.user, session.tokens)
  }

  const logout: AuthState['logout'] = async () => {
    const currentToken = tokens?.accessToken

    setUser(null)
    setTokens(null)
    clearStoredAuth()

    if (currentToken) {
      try {
        await secureLogout(currentToken)
      } catch {
        // Ignore network errors on logout. Local token invalidation already happened.
      }
    }
  }

  const authorizedFetch: AuthState['authorizedFetch'] = async (input, init) => {
    if (!tokens) {
      throw new Error('Sessao nao autenticada')
    }

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${tokens.accessToken}`)

    let response = await fetch(input, {
      ...init,
      headers,
    })

    if (response.status !== 401) {
      return response
    }

    try {
      const renewed = await refreshAuthToken(tokens.refreshToken)
      const profile = await getProfile(renewed.accessToken)
      setTokens(renewed)
      setUser(profile)
      persistAuth(profile, renewed)

      const retryHeaders = new Headers(init?.headers)
      retryHeaders.set('Authorization', `Bearer ${renewed.accessToken}`)

      response = await fetch(input, {
        ...init,
        headers: retryHeaders,
      })

      return response
    } catch {
      await logout()
      throw new Error('Sessao expirada, faca login novamente')
    }
  }

  const value: AuthState = {
    user,
    tokens,
    ready,
    isAuthenticated: Boolean(user && tokens),
    signIn,
    signUp,
    startGoogleSignIn,
    completeGoogleSignIn,
    logout,
    authorizedFetch,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
