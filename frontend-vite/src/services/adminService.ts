import type { AdminUser, AdminUsersResponse } from '../types/admin'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

function isTestEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  const [localPart = ''] = normalized.split('@')

  if (normalized.endsWith('@example.com') || normalized.endsWith('@local.dev')) {
    return true
  }

  return /^[a-z0-9-]+-\d{10,}(?:-[a-z0-9]{3,8})?$/i.test(localPart)
}

function toAdminUser(value: Record<string, unknown>): AdminUser {
  const email = String(value.email ?? '')
  const accountTypeFromApi = value.accountType === 'TEST' || value.accountType === 'REAL'
    ? value.accountType
    : undefined
  const inferredTest = isTestEmail(email)

  return {
    id: String(value.id ?? ''),
    name: typeof value.name === 'string' ? value.name : null,
    email,
    accountType: inferredTest ? 'TEST' : accountTypeFromApi ?? 'REAL',
    role: (value.role ?? 'USER') as AdminUser['role'],
    status: String(value.status ?? ''),
    createdAt: String(value.createdAt ?? ''),
    lastLoginAt: typeof value.lastLoginAt === 'string' ? value.lastLoginAt : null,
    onboardingCompletedAt:
      typeof value.onboardingCompletedAt === 'string' ? value.onboardingCompletedAt : null,
    availableDaysPerWeek:
      typeof value.availableDaysPerWeek === 'number' ? value.availableDaysPerWeek : null,
    mfaEnabled: Boolean(value.mfaEnabled),
  }
}

type AdminUsersQueryOptions = {
  accountScope?: 'REAL' | 'TEST' | 'ALL'
  includeTest?: boolean
  registrationOrder?: 'asc' | 'desc'
}

type AdminUsersPayload = {
  data?: {
    page?: number
    pageSize?: number
    total?: number
    items?: Array<Record<string, unknown>>
  }
  error?: { message?: string; code?: string }
}

async function requestAdminUsers(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  query: URLSearchParams,
): Promise<{ response: Response; payload: AdminUsersPayload }> {
  const response = await authorizedFetch(`${API_URL}/admin/users?${query.toString()}`)
  const payload = (await response.json().catch(() => ({}))) as AdminUsersPayload

  return { response, payload }
}

export async function listUsersForAdmin(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  page = 1,
  pageSize = 20,
  options: AdminUsersQueryOptions = {},
): Promise<AdminUsersResponse> {
  const fullQuery = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    accountScope: options.accountScope ?? (options.includeTest ? 'ALL' : 'REAL'),
    includeTest: options.includeTest || options.accountScope === 'TEST' ? 'true' : 'false',
    registrationOrder: options.registrationOrder ?? 'desc',
  })

  let { response, payload } = await requestAdminUsers(authorizedFetch, fullQuery)

  // Backward compatibility: if API is running an older schema, retry with legacy query params.
  if (!response.ok && payload.error?.code === 'VALIDATION_ERROR') {
    const legacyQuery = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      includeTest: options.includeTest || options.accountScope === 'TEST' ? 'true' : 'false',
    })

    ;({ response, payload } = await requestAdminUsers(authorizedFetch, legacyQuery))
  }

  if (!response.ok && payload.error?.code === 'VALIDATION_ERROR') {
    const minimumQuery = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    })

    ;({ response, payload } = await requestAdminUsers(authorizedFetch, minimumQuery))
  }

  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? 'Falha ao carregar usuarios cadastrados')
  }

  const mappedItems = (payload.data.items ?? []).map(toAdminUser)
  const accountScope = options.accountScope ?? (options.includeTest ? 'ALL' : 'REAL')
  const filteredItems =
    accountScope === 'TEST'
      ? mappedItems.filter((item) => item.accountType === 'TEST')
      : accountScope === 'REAL'
        ? mappedItems.filter((item) => item.accountType === 'REAL')
        : mappedItems

  return {
    page: payload.data.page ?? page,
    pageSize: payload.data.pageSize ?? pageSize,
    total: filteredItems.length,
    items: filteredItems,
  }
}

export async function deactivateUserByAdmin(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  userId: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/admin/users/${userId}/deactivate`, {
    method: 'PATCH',
  })

  if (response.ok) {
    return
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | null

  if (payload?.error?.code === 'ROUTE_NOT_FOUND') {
    throw new Error('API desatualizada. Reinicie o servidor da API para habilitar desativacao/exclusao.')
  }

  throw new Error(payload?.error?.message ?? 'Falha ao desativar conta do usuario')
}

export async function deleteUserByAdmin(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  userId: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/admin/users/${userId}`, {
    method: 'DELETE',
  })

  if (response.ok) {
    return
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | null

  if (payload?.error?.code === 'ROUTE_NOT_FOUND') {
    throw new Error('API desatualizada. Reinicie o servidor da API para habilitar desativacao/exclusao.')
  }

  throw new Error(payload?.error?.message ?? 'Falha ao excluir conta do usuario')
}
