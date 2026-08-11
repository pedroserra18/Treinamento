import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { setSentryUser } from '../lib/infra/sentry'
import { ApiError } from '../lib/api-error'
import { clearUserScopedCaches } from '../lib/cache/session-caches'
import { BACKGROUND_TIMEOUT_MS, fetchWithTimeout, warmApi } from '../lib/infra/http'
import { queryClient } from '../lib/infra/queryClient'
import type { AuthTokens, AuthUser } from '../types/auth'
import { AuthContext, type AuthState } from './auth-context'
import {
  acceptTerms as acceptTermsRequest,
  completeOnboardingProfile,
  confirmEmailChange,
  deleteAccount as deleteAccountRequest,
  getGoogleAuthorizationUrl,
  getGoogleLinkAuthorizationUrl,
  getProfile,
  linkGoogleAccount,
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

// Grava só os tokens, preservando o usuário que já está em disco. Usado no
// refresh: o backend ROTACIONA o refresh token (o antigo morre na hora),
// então o par novo precisa ir pro localStorage imediatamente — se o SO
// matar o PWA no meio do fluxo (rotineiro em iOS), perder esse write
// significa perder a sessão de vez.
function persistTokens(tokens: AuthTokens) {
  const stored = readStoredAuth()
  if (!stored) return
  localStorage.setItem(storageKey, JSON.stringify({ user: stored.user, tokens }))
}

function clearStoredAuth() {
  localStorage.removeItem(storageKey)
}

// O servidor disse explicitamente que a credencial não vale. Só nesse caso
// derrubamos a sessão local — qualquer outra falha (timeout, offline, 500,
// cold start) mantém o usuário logado e tenta de novo depois.
function isAuthRejection(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403)
}

// Intervalo mínimo entre revalidações disparadas por retorno de background.
// Alternar de app no celular gera vários visibilitychange seguidos; sem
// isso, o app metralharia /auth/profile.
const REVALIDATE_THROTTLE_MS = 60_000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [storedAuth] = useState<StoredAuth | null>(() => readStoredAuth())
  const [user, setUser] = useState(storedAuth?.user ?? null)
  const [tokens, setTokens] = useState(storedAuth?.tokens ?? null)
  const tokensRef = useRef<AuthTokens | null>(storedAuth?.tokens ?? null)
  const lastRevalidatedAt = useRef(0)
  // Refresh single-flight. Sem isso, N requests que tomam 401 ao mesmo
  // tempo disparam N refreshes com o MESMO token; o primeiro rotaciona e
  // os outros levam 401 → logout aleatório. Todo mundo compartilha a
  // mesma Promise.
  const refreshInFlight = useRef<Promise<AuthTokens> | null>(null)

  // A sessão vem do localStorage de forma síncrona, então já sabemos no
  // primeiro render se há usuário — `ready` nunca depende da rede. Era
  // exatamente esse acoplamento que prendia o app inteiro na tela
  // "Validando sessao..." por minutos quando a API estava fria ou a
  // conexão tinha morrido no background.
  const ready = true

  useEffect(() => {
    tokensRef.current = tokens
  }, [tokens])

  // tokensRef é atualizado na hora (e não só no effect) porque
  // authorizedFetch/runRefresh leem dele fora do ciclo de render — logo
  // após um signIn, esperar o próximo render deixaria o ref com o valor
  // antigo.
  const applySession = useCallback((nextUser: AuthUser, nextTokens: AuthTokens) => {
    tokensRef.current = nextTokens
    setUser(nextUser)
    setTokens(nextTokens)
    persistAuth(nextUser, nextTokens)
    lastRevalidatedAt.current = Date.now()
  }, [])

  const clearSession = useCallback(() => {
    tokensRef.current = null
    refreshInFlight.current = null
    setUser(null)
    setTokens(null)
    clearStoredAuth()
    clearUserScopedCaches()
    queryClient.clear()
    setSentryUser(null)
  }, [])

  const runRefresh = useCallback(async (): Promise<AuthTokens> => {
    const inFlight = refreshInFlight.current
    if (inFlight) return inFlight

    const current = tokensRef.current
    if (!current) {
      throw new ApiError('Sessao nao autenticada', { status: 401 })
    }

    const promise = refreshAuthToken(current.refreshToken)
      .then((renewed) => {
        tokensRef.current = renewed
        persistTokens(renewed)
        setTokens(renewed)
        return renewed
      })
      .finally(() => {
        refreshInFlight.current = null
      })

    refreshInFlight.current = promise
    return promise
  }, [])

  // Confere a sessão contra o servidor SEM bloquear a UI. Roda no boot e
  // toda vez que o app volta do background. Falha de rede é ignorada de
  // propósito: o app segue com a sessão em cache e tenta de novo no
  // próximo retorno.
  const revalidateSession = useCallback(async () => {
    const current = tokensRef.current
    if (!current) return

    lastRevalidatedAt.current = Date.now()

    try {
      const profile = await getProfile(current.accessToken, { timeoutMs: BACKGROUND_TIMEOUT_MS })
      setUser(profile)
      persistAuth(profile, tokensRef.current ?? current)
      return
    } catch (error) {
      if (!isAuthRejection(error)) return
    }

    // Access token expirado (esperado: o app fica dias sem abrir). Renova
    // e refaz o perfil; só desiste se o servidor recusar o refresh também.
    try {
      const renewed = await runRefresh()
      const profile = await getProfile(renewed.accessToken, { timeoutMs: BACKGROUND_TIMEOUT_MS })
      setUser(profile)
      persistAuth(profile, renewed)
    } catch (error) {
      if (isAuthRejection(error)) {
        clearSession()
      }
    }
  }, [clearSession, runRefresh])

  useEffect(() => {
    if (!storedAuth) {
      // Sem sessão: o próximo passo do usuário é logar. Acorda a API em
      // paralelo pra o POST /auth/login não pagar o cold start sozinho.
      warmApi()
      return
    }

    void revalidateSession()
  }, [storedAuth, revalidateSession])

  // Retorno do background. Num PWA mobile isso é o caso comum — o usuário
  // trava a tela no meio do treino e volta 20 minutos depois.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!tokensRef.current) return
      if (Date.now() - lastRevalidatedAt.current < REVALIDATE_THROTTLE_MS) return
      void revalidateSession()
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [revalidateSession])

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
    applySession(session.user, session.tokens)
  }, [applySession])

  const requestSignUpVerificationCode: AuthState['requestSignUpVerificationCode'] = useCallback(async (
    input,
  ) => {
    return requestRegisterVerificationCode(input)
  }, [])

  const signUp: AuthState['signUp'] = useCallback(async (input) => {
    const session = await registerWithVerificationCode(input)
    applySession(session.user, session.tokens)
  }, [applySession])

  const startGoogleSignIn: AuthState['startGoogleSignIn'] = useCallback(async () => {
    const authorizationUrl = await getGoogleAuthorizationUrl()
    window.location.href = authorizationUrl
  }, [])

  const completeGoogleSignIn: AuthState['completeGoogleSignIn'] = useCallback(async (code, state) => {
    const session = await loginWithGoogleCode(code, state)
    applySession(session.user, session.tokens)
  }, [applySession])

  const logout: AuthState['logout'] = useCallback(async () => {
    const currentToken = tokensRef.current?.accessToken

    clearSession()

    if (currentToken) {
      try {
        await secureLogout(currentToken)
      } catch {
        // Ignore network errors on logout. Local token invalidation already happened.
      }
    }
  }, [clearSession])

  const authorizedFetch: AuthState['authorizedFetch'] = useCallback(async (input, init) => {
    const currentTokens = tokensRef.current

    if (!currentTokens) {
      throw new ApiError('Sessao nao autenticada', { status: 401 })
    }

    const { timeoutMs, ...requestInit } = init ?? {}

    const headers = new Headers(requestInit.headers)
    headers.set('Authorization', `Bearer ${currentTokens.accessToken}`)

    const response = await fetchWithTimeout(input, { ...requestInit, headers }, timeoutMs)

    if (response.status !== 401) {
      return response
    }

    let renewed: AuthTokens
    try {
      renewed = await runRefresh()
    } catch (error) {
      // Só desloga quando o servidor REJEITOU o refresh token. Timeout ou
      // rede caída não podem derrubar a sessão — senão o usuário perde o
      // login toda vez que o celular acorda com sinal ruim.
      if (isAuthRejection(error)) {
        await logout()
        throw new ApiError('Sessao expirada, faca login novamente', { status: 401 })
      }
      throw error
    }

    const retryHeaders = new Headers(requestInit.headers)
    retryHeaders.set('Authorization', `Bearer ${renewed.accessToken}`)

    return fetchWithTimeout(input, { ...requestInit, headers: retryHeaders }, timeoutMs)
  }, [logout, runRefresh])

  const acceptTerms: AuthState['acceptTerms'] = useCallback(async (version) => {
    const updated = await acceptTermsRequest(authorizedFetch, version)
    setUser(updated)
    const currentTokens = tokensRef.current
    if (currentTokens) persistAuth(updated, currentTokens)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

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

  const startGoogleLink: AuthState['startGoogleLink'] = useCallback(async () => {
    // /auth/google/link/start requires auth, so we use authorizedFetch (with
    // the current access token). We tag sessionStorage so the callback page
    // can tell this is a link flow, not a fresh login.
    const authorizationUrl = await getGoogleLinkAuthorizationUrl(authorizedFetch as never)
    sessionStorage.setItem('googleOAuthFlow', 'link')
    window.location.href = authorizationUrl
  }, [authorizedFetch])

  const completeGoogleLink: AuthState['completeGoogleLink'] = useCallback(async (code, state) => {
    // Backend issues a brand-new token pair on link (rotating the refresh
    // token), so swap both tokens + user atomically and persist immediately.
    const session = await linkGoogleAccount(authorizedFetch as never, code, state)
    applySession(session.user, session.tokens)
  }, [applySession, authorizedFetch])

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
    clearSession()
  }, [authorizedFetch, clearSession])

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
      startGoogleLink,
      completeGoogleLink,
      completeOnboarding,
      refreshUser,
      applyUserPatch,
      logout,
      deleteAccount,
      authorizedFetch,
      acceptTerms,
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
      startGoogleLink,
      completeGoogleLink,
      completeOnboarding,
      refreshUser,
      applyUserPatch,
      deleteAccount,
      logout,
      authorizedFetch,
      acceptTerms,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
