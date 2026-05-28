import type {
  Competition,
  CompetitionInvite,
  CompetitionInvitePreview,
  CompetitionType,
} from '../types/competition'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

async function parsePayload<T>(response: Response): Promise<{ data?: T; errorMessage?: string }> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null

  return {
    data: payload?.data,
    errorMessage: payload?.error?.message,
  }
}

export async function createCompetition(
  authorizedFetch: AuthorizedFetch,
  input: { name?: string; type: CompetitionType; durationDays: 30 | 60 | 90 },
): Promise<Competition> {
  const response = await authorizedFetch(`${API_URL}/competitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parsePayload<Competition>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao criar competição')
  }
  return payload.data
}

export async function getMyActiveCompetition(
  authorizedFetch: AuthorizedFetch,
): Promise<Competition | null> {
  const response = await authorizedFetch(`${API_URL}/competitions/me`)
  const payload = await parsePayload<Competition | null>(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar competição ativa')
  }
  return payload.data ?? null
}

export async function listMyCompetitions(
  authorizedFetch: AuthorizedFetch,
): Promise<{ items: Competition[] }> {
  const response = await authorizedFetch(`${API_URL}/competitions/mine`)
  const payload = await parsePayload<{ items: Competition[] }>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar suas competições')
  }
  return payload.data
}

export async function getCompetition(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
): Promise<Competition> {
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}`)
  const payload = await parsePayload<Competition>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar competição')
  }
  return payload.data
}

export async function inviteMember(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  input: { invitedUserId?: string },
): Promise<CompetitionInvite> {
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parsePayload<CompetitionInvite>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao convidar')
  }
  return payload.data
}

export async function listMyInvites(
  authorizedFetch: AuthorizedFetch,
): Promise<{ items: CompetitionInvitePreview[] }> {
  const response = await authorizedFetch(`${API_URL}/competitions/invites`)
  const payload = await parsePayload<{ items: CompetitionInvitePreview[] }>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar convites')
  }
  return payload.data
}

export async function getInvitePreview(
  authorizedFetch: AuthorizedFetch,
  token: string,
): Promise<CompetitionInvitePreview> {
  const response = await authorizedFetch(`${API_URL}/competitions/invites/${token}`)
  const payload = await parsePayload<CompetitionInvitePreview>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Convite não encontrado')
  }
  return payload.data
}

export async function acceptInvite(
  authorizedFetch: AuthorizedFetch,
  token: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/competitions/invites/${token}/accept`, {
    method: 'POST',
  })
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao aceitar convite')
  }
}

export async function declineInvite(
  authorizedFetch: AuthorizedFetch,
  token: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/competitions/invites/${token}/decline`, {
    method: 'POST',
  })
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao recusar convite')
  }
}

export async function leaveCompetition(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}/leave`, {
    method: 'POST',
  })
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao sair da competição')
  }
}
