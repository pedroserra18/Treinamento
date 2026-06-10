import type { AdminSortBy, AdminUser, AdminUserDetail, AdminUsersResponse } from '../types/admin'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

function isTestEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  const [localPart = ''] = normalized.split('@')

  if (normalized.endsWith('@example.com') || normalized.endsWith('@local.dev')) {
    return true
  }

  const testPrefixes = [
    'test',
    'teste',
    'qa',
    'mock',
    'demo',
    'seed',
    'tmp',
    'temp',
    'fake',
    'recover',
    'authcheck',
    'logincheck',
    'cadastro.teste',
  ]

  if (testPrefixes.some((prefix) => localPart.startsWith(prefix))) {
    return true
  }

  if (localPart.includes('.teste') || localPart.includes('.test')) {
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
    handle: typeof value.handle === 'string' ? value.handle : null,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
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
    plan: value.plan === 'PRO' ? 'PRO' : 'FREE',
    planExpiresAt: typeof value.planExpiresAt === 'string' ? value.planExpiresAt : null,
    aiGenerationsTotal:
      typeof value.aiGenerationsTotal === 'number' ? value.aiGenerationsTotal : 0,
  }
}

type AdminUsersQueryOptions = {
  accountScope?: 'REAL' | 'TEST' | 'ALL'
  includeTest?: boolean
  registrationOrder?: 'asc' | 'desc'
  search?: string
  sortBy?: AdminSortBy
  sortOrder?: 'asc' | 'desc'
  role?: 'USER' | 'COACH' | 'ADMIN'
  status?: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DISABLED'
  onboarding?: 'completed' | 'pending'
  plan?: 'FREE' | 'PRO'
}

type AdminUsersPayload = {
  data?: {
    page?: number
    pageSize?: number
    total?: number
    summary?: {
      realCount?: number
      testCount?: number
      totalCount?: number
      newRealLast7Days?: number
      proRealCount?: number
    }
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
    sortBy: options.sortBy ?? 'createdAt',
    sortOrder: options.sortOrder ?? 'desc',
  })
  if (options.search?.trim()) fullQuery.set('search', options.search.trim())
  if (options.role) fullQuery.set('role', options.role)
  if (options.status) fullQuery.set('status', options.status)
  if (options.onboarding) fullQuery.set('onboarding', options.onboarding)
  if (options.plan) fullQuery.set('plan', options.plan)

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

  // API moderna já escopa, busca e conta no servidor: confia no total/summary.
  // Só refiltra no client como rede de segurança para APIs legadas (sem summary).
  const hasServerSummary = typeof payload.data.summary?.totalCount === 'number'
  const items = hasServerSummary
    ? mappedItems
    : accountScope === 'TEST'
      ? mappedItems.filter((item) => item.accountType === 'TEST')
      : accountScope === 'REAL'
        ? mappedItems.filter((item) => item.accountType === 'REAL')
        : mappedItems

  return {
    page: payload.data.page ?? page,
    pageSize: payload.data.pageSize ?? pageSize,
    total: hasServerSummary ? payload.data.total ?? items.length : items.length,
    summary: {
      realCount:
        typeof payload.data.summary?.realCount === 'number'
          ? payload.data.summary.realCount
          : mappedItems.filter((item) => item.accountType === 'REAL').length,
      testCount:
        typeof payload.data.summary?.testCount === 'number'
          ? payload.data.summary.testCount
          : mappedItems.filter((item) => item.accountType === 'TEST').length,
      totalCount:
        typeof payload.data.summary?.totalCount === 'number'
          ? payload.data.summary.totalCount
          : mappedItems.length,
      newRealLast7Days:
        typeof payload.data.summary?.newRealLast7Days === 'number'
          ? payload.data.summary.newRealLast7Days
          : 0,
      proRealCount:
        typeof payload.data.summary?.proRealCount === 'number'
          ? payload.data.summary.proRealCount
          : mappedItems.filter((item) => item.accountType === 'REAL' && item.plan === 'PRO').length,
    },
    items,
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

export async function getUserDetailForAdmin(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  userId: string,
): Promise<AdminUserDetail> {
  const response = await authorizedFetch(`${API_URL}/admin/users/${userId}`)
  const payload = (await response.json().catch(() => null)) as
    | { data?: AdminUserDetail; error?: { message?: string; code?: string } }
    | null

  if (!response.ok || !payload?.data) {
    if (payload?.error?.code === 'ROUTE_NOT_FOUND') {
      throw new Error('API desatualizada. Reinicie o servidor da API para ver os detalhes.')
    }
    throw new Error(payload?.error?.message ?? 'Falha ao carregar detalhes do usuário')
  }
  return payload.data
}

export async function updateUserRoleByAdmin(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  userId: string,
  role: 'USER' | 'COACH' | 'ADMIN',
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })

  if (response.ok) return

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | null

  if (payload?.error?.code === 'ROUTE_NOT_FOUND') {
    throw new Error('API desatualizada. Reinicie o servidor da API para gerenciar papéis.')
  }
  throw new Error(payload?.error?.message ?? 'Falha ao alterar o papel do usuário')
}

// Promoção/rebaixamento manual de tier por admin. expiresAt opcional:
// undefined = vitalício; string ISO = define expiração; null = limpa.
export async function updateUserPlanByAdmin(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  userId: string,
  plan: 'FREE' | 'PRO',
  expiresAt?: string | null,
): Promise<void> {
  const body: { plan: 'FREE' | 'PRO'; expiresAt?: string | null } = { plan }
  if (expiresAt !== undefined) body.expiresAt = expiresAt
  const response = await authorizedFetch(`${API_URL}/admin/users/${userId}/plan`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (response.ok) return

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | null

  if (payload?.error?.code === 'ROUTE_NOT_FOUND') {
    throw new Error('API desatualizada. Reinicie o servidor da API pra alterar o plano.')
  }
  if (payload?.error?.code === 'CANNOT_CHANGE_ADMIN_PLAN') {
    throw new Error('Admins são automaticamente PRO em runtime — altere o acesso pra USER antes de mexer no plano.')
  }
  throw new Error(payload?.error?.message ?? 'Falha ao alterar o plano do usuário')
}

export async function reactivateUserByAdmin(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  userId: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/admin/users/${userId}/reactivate`, {
    method: 'PATCH',
  })

  if (response.ok) {
    return
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | null

  if (payload?.error?.code === 'ROUTE_NOT_FOUND') {
    throw new Error('API desatualizada. Reinicie o servidor da API para habilitar a reativação.')
  }

  throw new Error(payload?.error?.message ?? 'Falha ao reativar conta do usuario')
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
