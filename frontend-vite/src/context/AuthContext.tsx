import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { setSentryUser } from '../lib/sentry'
import type { AuthTokens, AuthUser } from '../types/auth'
import { AuthContext, type AuthState } from './auth-context'
import {
  completeOnboardingProfile,
  confirmEmailChange,
  deleteAccount as deleteAccountRequest,
  getGoogleAuthorizationUrl,
  getProfile,
  loginWithEmail,
  loginWithGoogleCode,
  refreshAuthToken,
  registerWithVerificationCode,
  requestRegisterVerificationCode,
  secureLogout,
  updateUserName,
} from '../services/authService'
import { updateHandle as updateHandleRequest } from '../services/socialService'

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
  const tokensRef = useRef<AuthTokens | null>(storedAuth?.tokens ?? null)

  useEffect(() => {
    tokensRef.current = tokens
  }, [tokens])

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

  useEffect(() => {
    if (!user) {
      setSentryUser(null)
      return
    }

    setSentryUser({
      id: user.id,
      email: user.email,
      role: user.role,
    })
  }, [user])

  const signIn: AuthState['signIn'] = useCallback(async (input) => {
    const session = await loginWithEmail(input)
    setUser(session.user)
    setTokens(session.tokens)
    persistAuth(session.user, session.tokens)
  }, [])

  const requestSignUpVerificationCode: AuthState['requestSignUpVerificationCode'] = useCallback(async (
    input,
  ) => {
    return requestRegisterVerificationCode(input)
  }, [])

  const signUp: AuthState['signUp'] = useCallback(async (input) => {
    const session = await registerWithVerificationCode(input)
    setUser(session.user)
    setTokens(session.tokens)
    persistAuth(session.user, session.tokens)
  }, [])

  const startGoogleSignIn: AuthState['startGoogleSignIn'] = useCallback(async () => {
    const authorizationUrl = await getGoogleAuthorizationUrl()
    window.location.href = authorizationUrl
  }, [])

  const completeGoogleSignIn: AuthState['completeGoogleSignIn'] = useCallback(async (code, state) => {
    const session = await loginWithGoogleCode(code, state)
    setUser(session.user)
    setTokens(session.tokens)
    persistAuth(session.user, session.tokens)
  }, [])

  const logout: AuthState['logout'] = useCallback(async () => {
    const currentToken = tokensRef.current?.accessToken

    setUser(null)
    setTokens(null)
    clearStoredAuth()
    setSentryUser(null)

    if (currentToken) {
      try {
        await secureLogout(currentToken)
      } catch {
        // Ignore network errors on logout. Local token invalidation already happened.
      }
    }
  }, [])

  const authorizedFetch: AuthState['authorizedFetch'] = useCallback(async (input, init) => {
    const currentTokens = tokensRef.current

    if (!currentTokens) {
      throw new Error('Sessao nao autenticada')
    }

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${currentTokens.accessToken}`)

    let response = await fetch(input, {
      ...init,
      headers,
    })

    if (response.status !== 401) {
      return response
    }

    try {
      const renewed = await refreshAuthToken(currentTokens.refreshToken)
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
  }, [logout])

  const refreshUser: AuthState['refreshUser'] = useCallback(async () => {
    const currentTokens = tokensRef.current
    if (!currentTokens) return
    const profile = await getProfile(currentTokens.accessToken)
    setUser(profile)
    persistAuth(profile, currentTokens)
  }, [])

  const applyUserPatch: AuthState['applyUserPatch'] = useCallback((patch) => {
    const currentTokens = tokensRef.current
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      if (currentTokens) persistAuth(next, currentTokens)
      return next
    })
  }, [])

  const completeOnboarding: AuthState['completeOnboarding'] = useCallback(async (input) => {
    const profile = await completeOnboardingProfile(authorizedFetch, input)
    const currentTokens = tokensRef.current

    setUser(profile)
    if (currentTokens) {
      persistAuth(profile, currentTokens)
    }
  }, [authorizedFetch])

  const updateHandle: AuthState['updateHandle'] = useCallback(async (newHandle) => {
    const { handle } = await updateHandleRequest(authorizedFetch, newHandle)
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, handle }
      const currentTokens = tokensRef.current
      if (currentTokens) persistAuth(next, currentTokens)
      return next
    })
  }, [authorizedFetch])

  const updateName: AuthState['updateName'] = useCallback(async (newName) => {
    const updated = await updateUserName(authorizedFetch as never, newName)
    setUser((prev) => {
      if (!prev) return prev
      // The server already returned the full AuthUser — merge the new name
      // (and anything else it might have refreshed) into the cached row.
      const next = { ...prev, ...updated }
      const currentTokens = tokensRef.current
      if (currentTokens) persistAuth(next, currentTokens)
      return next
    })
  }, [authorizedFetch])

  const updateEmail: AuthState['updateEmail'] = useCallback(async (newEmail, verificationCode) => {
    // 2-step flow: this is the confirmation. requestEmailChangeCode is called
    // from the Settings page directly because it doesn't mutate user state.
    const updated = await confirmEmailChange(authorizedFetch as never, newEmail, verificationCode)
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...updated }
      const currentTokens = tokensRef.current
      if (currentTokens) persistAuth(next, currentTokens)
      return next
    })
  }, [authorizedFetch])

  const deleteAccount: AuthState['deleteAccount'] = useCallback(async (confirmHandle) => {
    // We let server errors propagate so the Settings page can surface the
    // specific failure ("handle confirmation does not match", network, …)
    // and keep the local session intact. Only wipe local state after the
    // server confirms the deletion succeeded.
    await deleteAccountRequest(authorizedFetch as never, confirmHandle)
    setUser(null)
    setTokens(null)
    clearStoredAuth()
    setSentryUser(null)
  }, [authorizedFetch])

  const value: AuthState = useMemo(
    () => ({
      user,
      tokens,
      ready,
      isAuthenticated: Boolean(user && tokens),
      signIn,
      requestSignUpVerificationCode,
      signUp,
      updateHandle,
      updateName,
      updateEmail,
      startGoogleSignIn,
      completeGoogleSignIn,
      completeOnboarding,
      refreshUser,
      applyUserPatch,
      logout,
      deleteAccount,
      authorizedFetch,
    }),
    [
      user,
      tokens,
      ready,
      signIn,
      requestSignUpVerificationCode,
      signUp,
      updateHandle,
      updateName,
      updateEmail,
      startGoogleSignIn,
      completeGoogleSignIn,
      completeOnboarding,
      refreshUser,
      applyUserPatch,
      deleteAccount,
      logout,
      authorizedFetch,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
