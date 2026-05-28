import type {
  Competition,
  CompetitionChatMessage,
  CompetitionEntryComment,
  CompetitionEntryKind,
  CompetitionFeedItem,
  CompetitionInvite,
  CompetitionInvitePreview,
  CompetitionReactionKind,
  CompetitionStandings,
  CompetitionType,
  CompetitionUserSummary,
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

export async function startCompetition(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
): Promise<Competition> {
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}/start`, {
    method: 'POST',
  })
  const payload = await parsePayload<Competition>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao iniciar desafio')
  }
  return payload.data
}

export async function getStandings(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
): Promise<CompetitionStandings> {
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}/standings`)
  const payload = await parsePayload<CompetitionStandings>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar ranking')
  }
  return payload.data
}

export async function getCompetitionFeed(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
): Promise<{ items: CompetitionFeedItem[] }> {
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}/feed`)
  const payload = await parsePayload<{ items: CompetitionFeedItem[] }>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar feed')
  }
  return payload.data
}

// Upload a base64 data URL to Supabase Storage via the backend. Returns
// the resolved public URL + storage path. We do the upload separately
// from the entry POST so the entry endpoint stays a cheap insert.
export async function uploadCompetitionPhoto(
  authorizedFetch: AuthorizedFetch,
  dataUrl: string,
): Promise<{ photoUrl: string; photoPath: string }> {
  const response = await authorizedFetch(`${API_URL}/uploads/competition-photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl }),
  })
  const payload = await parsePayload<{ photoUrl: string; photoPath: string }>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao subir foto')
  }
  return payload.data
}

export async function postCompetitionEntry(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  input: {
    kind: CompetitionEntryKind
    photoUrl: string
    photoPath?: string
    photoHash: string
    workoutSessionId?: string
  },
): Promise<void> {
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao registrar prova do desafio')
  }
}

export async function listInvitableFriends(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
): Promise<{ items: CompetitionUserSummary[] }> {
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}/invitable-friends`)
  const payload = await parsePayload<{ items: CompetitionUserSummary[] }>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar amigos')
  }
  return payload.data
}

export async function promoteMember(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  userId: string,
): Promise<void> {
  const response = await authorizedFetch(
    `${API_URL}/competitions/${competitionId}/members/${userId}/admin`,
    { method: 'POST' },
  )
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao promover membro')
  }
}

export async function demoteMember(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  userId: string,
): Promise<void> {
  const response = await authorizedFetch(
    `${API_URL}/competitions/${competitionId}/members/${userId}/admin`,
    { method: 'DELETE' },
  )
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao remover admin')
  }
}

export async function kickMember(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  userId: string,
): Promise<void> {
  const response = await authorizedFetch(
    `${API_URL}/competitions/${competitionId}/members/${userId}`,
    { method: 'DELETE' },
  )
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao remover membro')
  }
}

// Toggles a reaction kind for the calling user on a feed entry. Returns
// whether it was added or removed so the client can patch optimistically.
export async function toggleReaction(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  entryId: string,
  kind: CompetitionReactionKind,
): Promise<{ action: 'added' | 'removed'; kind: CompetitionReactionKind }> {
  const response = await authorizedFetch(
    `${API_URL}/competitions/${competitionId}/entries/${entryId}/reactions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    },
  )
  const payload = await parsePayload<{ action: 'added' | 'removed'; kind: CompetitionReactionKind }>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao reagir')
  }
  return payload.data
}

// Admin-only: hard-delete a proof entry. Cascades reactions + comments.
export async function deleteCompetitionEntry(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  entryId: string,
): Promise<void> {
  const response = await authorizedFetch(
    `${API_URL}/competitions/${competitionId}/entries/${entryId}`,
    { method: 'DELETE' },
  )
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao remover prova')
  }
}

export async function listEntryComments(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  entryId: string,
): Promise<{ items: CompetitionEntryComment[] }> {
  const response = await authorizedFetch(
    `${API_URL}/competitions/${competitionId}/entries/${entryId}/comments`,
  )
  const payload = await parsePayload<{ items: CompetitionEntryComment[] }>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar comentários')
  }
  return payload.data
}

export async function postEntryComment(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  entryId: string,
  content: string,
): Promise<CompetitionEntryComment> {
  const response = await authorizedFetch(
    `${API_URL}/competitions/${competitionId}/entries/${entryId}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    },
  )
  const payload = await parsePayload<CompetitionEntryComment>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao comentar')
  }
  return payload.data
}

export async function deleteEntryComment(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  entryId: string,
  commentId: string,
): Promise<void> {
  const response = await authorizedFetch(
    `${API_URL}/competitions/${competitionId}/entries/${entryId}/comments/${commentId}`,
    { method: 'DELETE' },
  )
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao apagar comentário')
  }
}

export async function listChatMessages(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  options: { before?: string; limit?: number } = {},
): Promise<{ items: CompetitionChatMessage[] }> {
  const params = new URLSearchParams()
  if (options.before) params.set('before', options.before)
  if (options.limit) params.set('limit', String(options.limit))
  const qs = params.toString()
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}/chat${qs ? `?${qs}` : ''}`)
  const payload = await parsePayload<{ items: CompetitionChatMessage[] }>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao carregar conversa')
  }
  return payload.data
}

// Posts a chat message. The backend rejects with a 400 + specific code
// for profanity and a 429 for rate limit — the caller surfaces those
// codes back to the user inline.
export async function postChatMessage(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  content: string,
): Promise<CompetitionChatMessage> {
  const response = await authorizedFetch(`${API_URL}/competitions/${competitionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  const payload = await parsePayload<CompetitionChatMessage>(response)
  if (!response.ok || !payload.data) {
    throw new Error(payload.errorMessage ?? 'Falha ao enviar mensagem')
  }
  return payload.data
}

export async function deleteChatMessage(
  authorizedFetch: AuthorizedFetch,
  competitionId: string,
  messageId: string,
): Promise<void> {
  const response = await authorizedFetch(
    `${API_URL}/competitions/${competitionId}/chat/${messageId}`,
    { method: 'DELETE' },
  )
  const payload = await parsePayload(response)
  if (!response.ok) {
    throw new Error(payload.errorMessage ?? 'Falha ao apagar mensagem')
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
