import { ApiError } from '../lib/api-error'

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

async function parsePayload<T>(response: Response): Promise<{ data?: T; errorMessage?: string; errorCode?: string; errorDetails?: unknown }> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string; code?: string; details?: unknown } }
    | null
  return {
    data: payload?.data,
    errorMessage: payload?.error?.message,
    errorCode: payload?.error?.code,
    errorDetails: payload?.error?.details,
  }
}

async function throwIfNotOk<T>(response: Response, payload: Awaited<ReturnType<typeof parsePayload<T>>>, defaultMessage: string): Promise<void> {
  if (response.ok && payload.data !== undefined) return
  throw new ApiError(payload.errorMessage ?? defaultMessage, {
    code: payload.errorCode,
    details: payload.errorDetails,
    status: response.status,
  })
}

// ─── Plan summary ────────────────────────────────────────────────────────

export type PlanFeatureKey =
  | 'workoutPlans'
  | 'aiGenerations'
  | 'aiHistoryEntries'
  | 'customExercises'
  | 'competitionsOwned'
  | 'pinnedExercises'

export type PlanSummary = {
  plan: 'FREE' | 'PRO'
  role: 'USER' | 'COACH' | 'ADMIN'
  planExpiresAt: string | null
  // null = ilimitado (backend serializa POSITIVE_INFINITY pra null)
  limits: Record<PlanFeatureKey, number | null>
  usage: Record<PlanFeatureKey, number>
}

export async function getPlanSummary(authorizedFetch: AuthorizedFetch): Promise<PlanSummary> {
  const response = await authorizedFetch(`${API_URL}/subscription/plan`)
  const payload = await parsePayload<PlanSummary>(response)
  await throwIfNotOk(response, payload, 'Falha ao carregar plano')
  return payload.data!
}

// ─── PRO invites (admin) ─────────────────────────────────────────────────

export type ProInviteSummary = {
  id: string
  token: string
  note: string | null
  expiresAt: string | null
  usedAt: string | null
  usedByName: string | null
  revokedAt: string | null
  createdAt: string
  shareUrl: string
}

export async function createProInvite(
  authorizedFetch: AuthorizedFetch,
  input: { expiresInDays?: number; note?: string },
): Promise<ProInviteSummary> {
  const response = await authorizedFetch(`${API_URL}/admin/pro-invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parsePayload<ProInviteSummary>(response)
  await throwIfNotOk(response, payload, 'Falha ao criar convite')
  return payload.data!
}

export async function listProInvites(
  authorizedFetch: AuthorizedFetch,
  limit = 50,
): Promise<ProInviteSummary[]> {
  const response = await authorizedFetch(`${API_URL}/admin/pro-invites?limit=${limit}`)
  const payload = await parsePayload<ProInviteSummary[]>(response)
  await throwIfNotOk(response, payload, 'Falha ao listar convites')
  return payload.data!
}

export async function revokeProInvite(
  authorizedFetch: AuthorizedFetch,
  inviteId: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/admin/pro-invites/${inviteId}`, {
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 204) {
    const payload = await parsePayload<unknown>(response)
    throw new ApiError(payload.errorMessage ?? 'Falha ao revogar convite', {
      code: payload.errorCode,
      status: response.status,
    })
  }
}

// ─── PRO invites (public redeem) ─────────────────────────────────────────

export type ProInvitePreview = {
  valid: boolean
  reason?: 'USED' | 'REVOKED' | 'EXPIRED' | 'NOT_FOUND'
  createdByName: string | null
  note: string | null
}

// Preview NÃO precisa de auth — o token já é segredo. Permite a página
// /pro-invite/:token mostrar "Convite válido de XYZ" antes do user logar
// ou se cadastrar.
export async function previewProInvite(token: string): Promise<ProInvitePreview> {
  const response = await fetch(`${API_URL}/pro-invites/${token}`)
  const payload = await parsePayload<ProInvitePreview>(response)
  if (!response.ok || !payload.data) {
    // Erros aqui são informacionais — o backend sempre devolve 200 com
    // { valid: false } pra tokens inválidos. Se chegou aqui é erro de rede.
    throw new ApiError(payload.errorMessage ?? 'Falha ao validar convite', {
      code: payload.errorCode,
      status: response.status,
    })
  }
  return payload.data
}

export async function redeemProInvite(
  authorizedFetch: AuthorizedFetch,
  token: string,
): Promise<{ plan: 'PRO'; planExpiresAt: null }> {
  const response = await authorizedFetch(`${API_URL}/pro-invites/${token}/redeem`, {
    method: 'POST',
  })
  const payload = await parsePayload<{ plan: 'PRO'; planExpiresAt: null }>(response)
  await throwIfNotOk(response, payload, 'Falha ao resgatar convite')
  return payload.data!
}
