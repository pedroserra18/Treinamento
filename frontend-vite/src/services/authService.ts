import type { AuthSession, AuthTokens, AuthUser } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

type ApiErrorPayload = {
  message?: string
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
  return {
    id: String(value.id ?? ''),
    name: typeof value.name === 'string' ? value.name : null,
    email: String(value.email ?? ''),
    role: (value.role ?? 'USER') as AuthUser['role'],
    sex: (value.sex ?? 'OTHER') as AuthUser['sex'],
    availableDaysPerWeek:
      typeof value.availableDaysPerWeek === 'number' ? value.availableDaysPerWeek : null,
    onboardingCompleted: Boolean(value.onboardingCompleted),
  }
}

export async function registerWithEmail(input: {
  name: string
  email: string
  password: string
}): Promise<AuthSession> {
  const response = await fetch(`${API_URL}/auth/register`, {
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
  const response = await fetch(`${API_URL}/auth/register/request-code`, {
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
  email: string
  password: string
  verificationCode: string
}): Promise<AuthSession> {
  const response = await fetch(`${API_URL}/auth/register/verify-code`, {
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
  const response = await fetch(`${API_URL}/auth/forgot-password/request-code`, {
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
  const response = await fetch(`${API_URL}/auth/forgot-password/confirm`, {
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
  const response = await fetch(`${API_URL}/auth/login`, {
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

export async function refreshAuthToken(refreshToken: string): Promise<AuthTokens> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  const payload = (await response.json()) as {
    data?: { accessToken?: string; refreshToken?: string }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.accessToken || !payload.data?.refreshToken) {
    throw new Error(payload.error?.message ?? 'Falha ao renovar sessao')
  }

  return {
    accessToken: payload.data.accessToken,
    refreshToken: payload.data.refreshToken,
  }
}

export async function getProfile(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/auth/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const payload = (await response.json()) as {
    data?: Record<string, unknown>
    error?: { message?: string }
  }

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? 'Falha ao carregar perfil')
  }

  return asAuthUser(payload.data)
}

export async function secureLogout(accessToken: string): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
}

export async function getGoogleAuthorizationUrl(): Promise<string> {
  const response = await fetch(`${API_URL}/auth/google/start`)
  const payload = (await response.json()) as {
    data?: { authorizationUrl?: string }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.authorizationUrl) {
    throw new Error(payload.error?.message ?? 'Falha ao iniciar login com Google')
  }

  return payload.data.authorizationUrl
}

export async function loginWithGoogleCode(code: string, state: string): Promise<AuthSession> {
  const params = new URLSearchParams({ code, state })
  const response = await fetch(`${API_URL}/auth/google/callback?${params.toString()}`)

  const payload = (await response.json()) as {
    data?: {
      accessToken?: string
      refreshToken?: string
      user?: Record<string, unknown>
    }
    error?: { message?: string }
  }

  if (!response.ok || !payload.data?.accessToken || !payload.data?.refreshToken || !payload.data.user) {
    throw new Error(payload.error?.message ?? 'Falha no callback do Google')
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
