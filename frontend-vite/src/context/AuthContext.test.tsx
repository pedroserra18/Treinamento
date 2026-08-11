import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useContext, useEffect } from 'react'
import { AuthProvider } from './AuthContext'
import { AuthContext, type AuthState } from './auth-context'
import { ApiError } from '../lib/api-error'
import type { AuthUser } from '../types/auth'

// ─── Doubles dos services ────────────────────────────────────────────
// Mockamos na fronteira do service (e não do fetch) porque o que importa
// aqui é a MÁQUINA DE ESTADOS da sessão: quando o app confia no cache,
// quando renova o token e quando desiste e desloga.
const getProfile = vi.fn()
const refreshAuthToken = vi.fn()
const secureLogout = vi.fn().mockResolvedValue(undefined)

vi.mock('../services/authService', () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
  refreshAuthToken: (...args: unknown[]) => refreshAuthToken(...args),
  secureLogout: (...args: unknown[]) => secureLogout(...args),
  acceptTerms: vi.fn(),
  completeOnboardingProfile: vi.fn(),
  confirmEmailChange: vi.fn(),
  deleteAccount: vi.fn(),
  getGoogleAuthorizationUrl: vi.fn(),
  getGoogleLinkAuthorizationUrl: vi.fn(),
  linkGoogleAccount: vi.fn(),
  loginWithEmail: vi.fn(),
  loginWithGoogleCode: vi.fn(),
  registerWithVerificationCode: vi.fn(),
  requestRegisterVerificationCode: vi.fn(),
  updateUserName: vi.fn(),
}))

vi.mock('../services/socialService', () => ({ updateHandle: vi.fn() }))
vi.mock('../lib/infra/sentry', () => ({ setSentryUser: vi.fn() }))
vi.mock('../lib/infra/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/infra/http')>()),
  warmApi: vi.fn(),
}))

const STORAGE_KEY = 'frontend-vite-auth'

const storedUser: AuthUser = {
  id: 'user-1',
  name: 'Pedro',
  handle: 'pedro_serra',
  email: 'pedro@example.com',
  role: 'USER',
  sex: 'MALE',
  availableDaysPerWeek: 4,
  birthDate: null,
  heightCm: null,
  weightKg: null,
  experienceLevel: 'INTERMEDIATE',
  primaryGoal: 'HYPERTROPHY',
  plan: 'FREE',
  planExpiresAt: null,
  acceptedTermsAt: null,
  acceptedTermsVersion: null,
  onboardingCompleted: true,
  avatarUrl: null,
  isPrivate: false,
  showFollowLists: true,
}

const storedTokens = { accessToken: 'access-antigo', refreshToken: 'refresh-antigo' }

function seedStoredSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: storedUser, tokens: storedTokens }))
}

// Expõe o estado da sessão no DOM pros asserts, e guarda o próprio
// contexto pra os testes que precisam chamar authorizedFetch.
let captured: AuthState | null = null

function Probe() {
  const auth = useContext(AuthContext)
  useEffect(() => {
    captured = auth ?? null
  }, [auth])
  return (
    <div>
      <span data-testid="ready">{String(auth?.ready)}</span>
      <span data-testid="authenticated">{String(auth?.isAuthenticated)}</span>
      <span data-testid="handle">{auth?.user?.handle ?? '—'}</span>
    </div>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  captured = null
  getProfile.mockReset()
  refreshAuthToken.mockReset()
  secureLogout.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AuthProvider — boot', () => {
  it('renderiza autenticado no primeiro paint, sem esperar a rede', () => {
    // Regressão do bug: o app ficava preso em "Validando sessao..." porque
    // `ready` só virava true depois do GET /auth/profile. Com a API fria
    // (Render free) isso durava minutos.
    seedStoredSession()
    getProfile.mockReturnValue(new Promise(() => {})) // nunca resolve

    renderProvider()

    expect(screen.getByTestId('ready')).toHaveTextContent('true')
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    expect(screen.getByTestId('handle')).toHaveTextContent('pedro_serra')
  })

  it('atualiza o usuário quando a revalidação em background responde', async () => {
    seedStoredSession()
    getProfile.mockResolvedValue({ ...storedUser, handle: 'handle_novo' })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('handle')).toHaveTextContent('handle_novo'))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').user.handle).toBe('handle_novo')
  })

  it('mantém a sessão quando a revalidação falha por rede', async () => {
    // Timeout/offline NÃO é prova de que a sessão morreu. Deslogar aqui
    // faria o usuário perder o login sempre que o celular acordasse com
    // sinal ruim.
    seedStoredSession()
    getProfile.mockRejectedValue(new Error('Falha de conexão'))

    renderProvider()

    await waitFor(() => expect(getProfile).toHaveBeenCalled())
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('renova o token quando o access token expirou', async () => {
    seedStoredSession()
    getProfile
      .mockRejectedValueOnce(new ApiError('expirado', { status: 401 }))
      .mockResolvedValueOnce(storedUser)
    refreshAuthToken.mockResolvedValue({ accessToken: 'access-novo', refreshToken: 'refresh-novo' })

    renderProvider()

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').tokens.accessToken).toBe('access-novo')
    })
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
  })

  it('desloga quando o servidor recusa também o refresh token', async () => {
    seedStoredSession()
    getProfile.mockRejectedValue(new ApiError('expirado', { status: 401 }))
    refreshAuthToken.mockRejectedValue(new ApiError('revogado', { status: 401 }))

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('AuthProvider — authorizedFetch', () => {
  it('renova UMA vez só quando várias requests tomam 401 juntas', async () => {
    // O backend rotaciona o refresh token: dois refreshes concorrentes com
    // o mesmo token fariam o segundo levar 401 e derrubar a sessão.
    seedStoredSession()
    getProfile.mockResolvedValue(storedUser)

    let resolveRefresh: ((value: { accessToken: string; refreshToken: string }) => void) | null = null
    refreshAuthToken.mockImplementation(
      () => new Promise((resolve) => { resolveRefresh = resolve }),
    )

    renderProvider()
    await waitFor(() => expect(captured).not.toBeNull())

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const both = Promise.all([
      captured!.authorizedFetch('/api/v1/a'),
      captured!.authorizedFetch('/api/v1/b'),
    ])

    await waitFor(() => expect(refreshAuthToken).toHaveBeenCalledTimes(1))
    resolveRefresh!({ accessToken: 'access-novo', refreshToken: 'refresh-novo' })

    const responses = await both
    expect(responses.every((r) => r.status === 200)).toBe(true)
    expect(refreshAuthToken).toHaveBeenCalledTimes(1)
  })

  it('não desloga quando o refresh falha por rede', async () => {
    seedStoredSession()
    getProfile.mockResolvedValue(storedUser)
    refreshAuthToken.mockRejectedValue(new Error('Tempo esgotado após 60s'))

    renderProvider()
    await waitFor(() => expect(captured).not.toBeNull())

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))

    await expect(captured!.authorizedFetch('/api/v1/a')).rejects.toThrow()
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })
})
