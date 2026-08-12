import type { AuthSession, AuthTokens, AuthUser } from '../types/auth'
import { API_BASE_URL, BACKGROUND_TIMEOUT_MS, fetchWithTimeout } from '../lib/infra/http'
import { ApiError } from '../lib/api-error'

const API_URL = API_BASE_URL

type ApiErrorPayload = {
  message?: string
  code?: string
  details?: {
    formErrors?: string[]
    fieldErrors?: Record<string, string[]>
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function extractApiErrorMessage(payload: { error?: ApiErrorPayload } | null | undefined): string | null {
  const directMessage = payload?.error?.message
  if (directMessage) {
    return directMessage
  }

  const formError = payload?.error?.details?.formErrors?.[0]
  if (formError) {
    return formError
  }

  const fieldErrors = payload?.error?.details?.fieldErrors
  if (fieldErrors) {
    const firstField = Object.keys(fieldErrors)[0]
    const firstFieldMessage = firstField ? fieldErrors[firstField]?.[0] : null
    if (firstFieldMessage) {
      return firstFieldMessage
    }
  }

  return null
}

function asAuthUser(value: Record<string, unknown>): AuthUser {
  // Helper pra coerção segura de enums conhecidos. Se o backend mandar
  // um valor estranho (versão desincronizada), cai pra null — a UI lida
  // com isso renderizando "não definido" em vez de quebrar.
  const asExperience = (v: unknown): AuthUser['experienceLevel'] =>
    v === 'BEGINNER' || v === 'INTERMEDIATE' || v === 'ADVANCED' ? v : null
  const asGoal = (v: unknown): AuthUser['primaryGoal'] =>
    v === 'STRENGTH' || v === 'HYPERTROPHY' || v === 'WEIGHT_LOSS' || v === 'ENDURANCE' || v === 'GENERAL_FITNESS'
      ? v
      : null

  return {
    id: String(value.id ?? ''),
    name: typeof value.name === 'string' ? value.name : null,
    handle: typeof value.handle === 'string' ? value.handle : '',
    email: String(value.email ?? ''),
    role: (value.role ?? 'USER') as AuthUser['role'],
    sex: (value.sex ?? 'OTHER') as AuthUser['sex'],
    availableDaysPerWeek:
      typeof value.availableDaysPerWeek === 'number' ? value.availableDaysPerWeek : null,
    birthDate: typeof value.birthDate === 'string' ? value.birthDate : null,
    heightCm: typeof value.heightCm === 'number' ? value.heightCm : null,
    weightKg: typeof value.weightKg === 'number' ? value.weightKg : null,
    experienceLevel: asExperience(value.experienceLevel),
    primaryGoal: asGoal(value.primaryGoal),
    plan: value.plan === 'PRO' ? 'PRO' : 'FREE',
    planExpiresAt: typeof value.planExpiresAt === 'string' ? value.planExpiresAt : null,
    acceptedTermsAt: typeof value.acceptedTermsAt === 'string' ? value.acceptedTermsAt : null,
    acceptedTermsVersion: typeof value.acceptedTermsVersion === 'string' ? value.acceptedTermsVersion : null,
    onboardingCompleted: Boolean(value.onboardingCompleted),
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
    isPrivate: Boolean(value.isPrivate),
    showFollowLists: value.showFollowLists !== false,
  }
}

export async function registerWithEmail(input: {
  name: string
  handle: string
  email: string
  password: string
}): Promise<AuthSession> {
  const response = await fetchWithTimeout(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = (await response.json()) as {
    data?: {
      accessToken?: string
      refreshToken?: string
      user?: Record<string, unknown>
    }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.accessToken || !payload.data?.refreshToken || !payload.data.user) {
    throw new Error(payload.error?.message ?? 'Falha ao cadastrar')
  }

  return {
    user: asAuthUser(payload.data.user),
    tokens: {
      accessToken: payload.data.accessToken,
      refreshToken: payload.data.refreshToken,
    },
  }
}

export async function requestRegisterVerificationCode(input: {
  email: string
}): Promise<{ delivery: 'EMAIL' }> {
  const response = await fetchWithTimeout(`${API_URL}/auth/register/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(input.email) }),
  })

  const payload = (await response.json()) as {
    data?: { delivery?: 'EMAIL' }
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Falha ao enviar codigo de verificacao')
  }

  return {
    delivery: payload.data?.delivery ?? 'EMAIL',
  }
}

export async function registerWithVerificationCode(input: {
  name: string
  handle: string
  email: string
  password: string
  verificationCode: string
  // Opcional pra compat com clientes antigos; quando ausente o backend
  // grava acceptedTermsAt=null e o gate vai pedir aceite na primeira tela.
  termsVersion?: string
}): Promise<AuthSession> {
  const response = await fetchWithTimeout(`${API_URL}/auth/register/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      email: normalizeEmail(input.email),
    }),
  })

  const payload = (await response.json()) as {
    data?: {
      accessToken?: string
      refreshToken?: string
      user?: Record<string, unknown>
    }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.accessToken || !payload.data?.refreshToken || !payload.data.user) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Falha ao validar codigo de verificacao')
  }

  return {
    user: asAuthUser(payload.data.user),
    tokens: {
      accessToken: payload.data.accessToken,
      refreshToken: payload.data.refreshToken,
    },
  }
}

export async function requestForgotPasswordCode(input: { email: string }): Promise<void> {
  const response = await fetchWithTimeout(`${API_URL}/auth/forgot-password/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizeEmail(input.email) }),
  })

  const payload = (await response.json()) as {
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Falha ao solicitar codigo de recuperacao')
  }
}

export async function confirmForgotPasswordWithCode(input: {
  email: string
  verificationCode: string
  newPassword: string
}): Promise<void> {
  const response = await fetchWithTimeout(`${API_URL}/auth/forgot-password/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...input,
      email: normalizeEmail(input.email),
    }),
  })

  const payload = (await response.json()) as {
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Falha ao redefinir senha')
  }
}

export async function loginWithEmail(input: {
  email: string
  password: string
}): Promise<AuthSession> {
  // Timeout largo de propósito: um login que falha por cold start do
  // Render seria interpretado pelo usuário como "senha errada".
  const response = await fetchWithTimeout(
    `${API_URL}/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        email: normalizeEmail(input.email),
      }),
    },
    BACKGROUND_TIMEOUT_MS,
  )

  const payload = (await response.json()) as {
    data?: {
      accessToken?: string
      refreshToken?: string
      user?: Record<string, unknown>
    }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.accessToken || !payload.data?.refreshToken || !payload.data.user) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Falha ao autenticar')
  }

  return {
    user: asAuthUser(payload.data.user),
    tokens: {
      accessToken: payload.data.accessToken,
      refreshToken: payload.data.refreshToken,
    },
  }
}

// Renova o par de tokens. Lança ApiError com `status` preenchido pra quem
// chama conseguir separar "o servidor recusou o refresh token" (401 → tem
// que deslogar) de NetworkError (rede/cold start → mantém a sessão local).
// Timeout generoso porque o Render free pode estar acordando.
export async function refreshAuthToken(refreshToken: string): Promise<AuthTokens> {
  const response = await fetchWithTimeout(
    `${API_URL}/auth/refresh`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    },
    BACKGROUND_TIMEOUT_MS,
  )

  const payload = (await response.json().catch(() => null)) as {
    data?: { accessToken?: string; refreshToken?: string }
    error?: ApiErrorPayload
  } | null

  if (!response.ok || !payload?.data?.accessToken || !payload.data?.refreshToken) {
    throw new ApiError(extractApiErrorMessage(payload) ?? 'Falha ao renovar sessao', {
      code: payload?.error?.code,
      status: response.status,
    })
  }

  return {
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken,
  }
}

export async function getProfile(
  accessToken: string,
  opts?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<AuthUser> {
  const response = await fetchWithTimeout(
    `${API_URL}/auth/profile`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: opts?.signal,
    },
    opts?.timeoutMs ?? BACKGROUND_TIMEOUT_MS,
  )

  const payload = (await response.json().catch(() => null)) as {
    data?: Record<string, unknown>
    error?: ApiErrorPayload
  } | null

  if (!response.ok || !payload?.data) {
    throw new ApiError(extractApiErrorMessage(payload) ?? 'Falha ao carregar perfil', {
      code: payload?.error?.code,
      status: response.status,
    })
  }

  return asAuthUser(payload.data)
}

export async function secureLogout(accessToken: string): Promise<void> {
  await fetchWithTimeout(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

// DELETE /auth/profile — wipes the account on the server. The handle is
// echoed back as the confirmation token; server re-validates against the DB.
// Returns void on 204. Specific server-side errors (404 USER_NOT_FOUND,
// 400 HANDLE_CONFIRMATION_MISMATCH) bubble up as Error messages.
export async function deleteAccount(
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>,
  confirmHandle: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/auth/profile`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmHandle }),
  })

  if (response.status === 204) return

  const payload = (await response.json().catch(() => null)) as { error?: ApiErrorPayload } | null
  throw new Error(extractApiErrorMessage(payload) ?? 'Erro ao excluir conta')
}

// PATCH /auth/profile/name — returns the refreshed AuthUser so the caller
// can update its local cache without a full refetch.
export async function updateUserName(
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>,
  newName: string,
): Promise<AuthUser> {
  const response = await authorizedFetch(`${API_URL}/auth/profile/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  })

  const payload = (await response.json().catch(() => null)) as
    | { data?: { user?: Record<string, unknown> }; error?: ApiErrorPayload }
    | null

  if (!response.ok || !payload?.data?.user) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Erro ao salvar nome')
  }

  return asAuthUser(payload.data.user)
}

export type ProfileDefaults = {
  weightKg: number | null
  heightCm: number | null
  gender: string | null
  birthDate: string | null // YYYY-MM-DD
  age: number | null
  // Onboarding v2 — quiz da IA usa pra pular steps já conhecidos e
  // pré-preencher o "objetivo" (editável por plano).
  experienceLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null
  primaryGoal:
    | 'STRENGTH'
    | 'HYPERTROPHY'
    | 'WEIGHT_LOSS'
    | 'ENDURANCE'
    | 'GENERAL_FITNESS'
    | null
}

// GET /auth/profile/defaults — valores p/ pré-preencher o quiz da IA
// (peso atual do progresso, altura, gênero e idade calculada do nascimento).
export async function getProfileDefaults(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<ProfileDefaults> {
  const response = await authorizedFetch(`${API_URL}/auth/profile/defaults`)
  const payload = (await response.json().catch(() => null)) as
    | { data?: ProfileDefaults; error?: ApiErrorPayload }
    | null
  if (!response.ok || !payload?.data) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Erro ao carregar dados do perfil')
  }
  return payload.data
}

// PATCH /auth/profile/birthdate — salva a data de nascimento (YYYY-MM-DD | null).
export async function updateBirthDate(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  birthDate: string | null,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/auth/profile/birthdate`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ birthDate }),
  })
  const payload = (await response.json().catch(() => null)) as { error?: ApiErrorPayload } | null
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Erro ao salvar data de nascimento')
  }
}

// GET /auth/profile/google-status — indica se o login Google está vinculado.
export async function getGoogleLinkStatus(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): Promise<boolean> {
  const response = await authorizedFetch(`${API_URL}/auth/profile/google-status`)
  const payload = (await response.json().catch(() => null)) as { data?: { linked?: boolean } } | null
  return Boolean(payload?.data?.linked)
}

// PATCH /auth/profile/gender — salva o gênero (Masculino | Feminino).
export async function updateGender(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  gender: 'Masculino' | 'Feminino',
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/auth/profile/gender`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gender }),
  })
  const payload = (await response.json().catch(() => null)) as { error?: ApiErrorPayload } | null
  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Erro ao salvar gênero')
  }
}

// POST /auth/profile/email/request-code — sends a 6-digit code to the NEW
// email so the user proves they own it before we swap.
export async function requestEmailChangeCode(
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>,
  newEmail: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/auth/profile/email/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: newEmail }),
  })

  if (response.ok) return

  const payload = (await response.json().catch(() => null)) as { error?: ApiErrorPayload } | null
  throw new Error(extractApiErrorMessage(payload) ?? 'Erro ao enviar código de verificação')
}

// POST /auth/profile/email/confirm — verifies the code emitted above and
// returns the AuthUser with the new email applied.
export async function confirmEmailChange(
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>,
  newEmail: string,
  verificationCode: string,
): Promise<AuthUser> {
  const response = await authorizedFetch(`${API_URL}/auth/profile/email/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: newEmail, verificationCode }),
  })

  const payload = (await response.json().catch(() => null)) as
    | { data?: { user?: Record<string, unknown> }; error?: ApiErrorPayload }
    | null

  if (!response.ok || !payload?.data?.user) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Erro ao confirmar troca de email')
  }

  return asAuthUser(payload.data.user)
}

// GET /auth/profile/export — returns the data archive as a Blob so the UI
// can drive a browser-side download without re-parsing the JSON.
export async function exportUserData(
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<Blob> {
  const response = await authorizedFetch(`${API_URL}/auth/profile/export`)

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: ApiErrorPayload } | null
    throw new Error(extractApiErrorMessage(payload) ?? 'Erro ao exportar dados')
  }

  return response.blob()
}

export async function getGoogleAuthorizationUrl(): Promise<string> {
  const response = await fetchWithTimeout(`${API_URL}/auth/google/start`)
  const payload = (await response.json()) as {
    data?: { authorizationUrl?: string }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.authorizationUrl) {
    throw new Error(payload.error?.message ?? 'Falha ao iniciar login com Google')
  }

  return payload.data.authorizationUrl
}

// GET /auth/google/link/start — needs auth. Returns the same Google
// authorization URL flow as login, but tagged with mode="link" + userId so
// the callback knows to attach the Google identity to the *current* user
// instead of trying to create a new one.
export async function getGoogleLinkAuthorizationUrl(
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<string> {
  const response = await authorizedFetch(`${API_URL}/auth/google/link/start`)
  const payload = (await response.json().catch(() => null)) as
    | { data?: { authorizationUrl?: string }; error?: ApiErrorPayload }
    | null

  if (!response.ok || !payload?.data?.authorizationUrl) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Falha ao iniciar vinculação com Google')
  }

  return payload.data.authorizationUrl
}

// POST /auth/google/link — second leg of the link flow. Sends the code we
// just received from Google back to our API along with the state token, and
// returns the user (now with the Google provider attached).
export async function linkGoogleAccount(
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>,
  code: string,
  state: string,
): Promise<AuthSession> {
  const response = await authorizedFetch(`${API_URL}/auth/google/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, state }),
  })

  const payload = (await response.json().catch(() => null)) as
    | {
        data?: {
          accessToken?: string
          refreshToken?: string
          user?: Record<string, unknown>
        }
        error?: ApiErrorPayload
      }
    | null

  if (!response.ok || !payload?.data?.accessToken || !payload.data?.refreshToken || !payload.data?.user) {
    throw new Error(extractApiErrorMessage(payload) ?? 'Falha ao vincular conta Google')
  }

  return {
    user: asAuthUser(payload.data.user),
    tokens: {
      accessToken: payload.data.accessToken,
      refreshToken: payload.data.refreshToken,
    },
  }
}

export async function loginWithGoogleCode(code: string, state: string): Promise<AuthSession> {
  const params = new URLSearchParams({ code, state })
  const response = await fetchWithTimeout(`${API_URL}/auth/google/callback?${params.toString()}`)

  const payload = (await response.json().catch(() => null)) as {
    data?: {
      accessToken?: string
      refreshToken?: string
      user?: Record<string, unknown>
    }
    error?: ApiErrorPayload
  } | null

  if (!response.ok || !payload?.data?.accessToken || !payload.data?.refreshToken || !payload.data.user) {
    // ApiError (e não Error) pra preservar o `code`: a tela de callback usa
    // ACCOUNT_BANNED/SUSPENDED/DISABLED pra oferecer um canal de contato a
    // quem foi barrado — que, justamente por não conseguir entrar, não tem
    // como abrir um ticket no suporte interno.
    throw new ApiError(extractApiErrorMessage(payload) ?? 'Falha no callback do Google', {
      code: payload?.error?.code,
      status: response.status,
    })
  }

  return {
    user: asAuthUser(payload.data.user),
    tokens: {
      accessToken: payload.data.accessToken,
      refreshToken: payload.data.refreshToken,
    },
  }
}

export async function completeOnboardingProfile(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  input: {
    sex: 'MALE' | 'FEMALE' | 'OTHER'
    availableDaysPerWeek: number
    birthDate: string // YYYY-MM-DD
    experienceLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
    primaryGoal:
      | 'STRENGTH'
      | 'HYPERTROPHY'
      | 'WEIGHT_LOSS'
      | 'ENDURANCE'
      | 'GENERAL_FITNESS'
    heightCm?: number
    weightKg?: number
  },
): Promise<AuthUser> {
  const response = await authorizedFetch(`${API_URL}/auth/onboarding/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const payload = (await response.json()) as {
    data?: { user?: Record<string, unknown> }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.user) {
    throw new Error(payload.error?.message ?? 'Falha ao concluir onboarding')
  }

  return asAuthUser(payload.data.user)
}

// PATCH /auth/profile — edita perfil em Settings ou WorkoutRecommendations
// sem refazer onboarding. Aceita partial; undefined = não mexe, null =
// limpa o campo (só pros que aceitam null no backend).
export type ProfileUpdatePatch = {
  sex?: 'MALE' | 'FEMALE' | 'OTHER'
  availableDaysPerWeek?: number
  heightCm?: number | null
  weightKg?: number | null
  experienceLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | null
  primaryGoal?:
    | 'STRENGTH'
    | 'HYPERTROPHY'
    | 'WEIGHT_LOSS'
    | 'ENDURANCE'
    | 'GENERAL_FITNESS'
    | null
}

export async function updateProfileFields(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  patch: ProfileUpdatePatch,
): Promise<AuthUser> {
  const response = await authorizedFetch(`${API_URL}/auth/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

  const payload = (await response.json()) as {
    data?: { user?: Record<string, unknown> }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.user) {
    throw new Error(payload.error?.message ?? 'Falha ao atualizar perfil')
  }

  return asAuthUser(payload.data.user)
}


// Registra aceite de uma nova versão dos termos pro user logado. Disparado
// pelo TermsAcceptanceGate quando detecta version mismatch.
export async function acceptTerms(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  version: string,
): Promise<AuthUser> {
  const response = await authorizedFetch(`${API_URL}/auth/accept-terms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version }),
  })

  const payload = (await response.json()) as {
    data?: { user?: Record<string, unknown> }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.user) {
    throw new Error(payload.error?.message ?? 'Falha ao registrar aceite dos termos')
  }

  return asAuthUser(payload.data.user)
}
