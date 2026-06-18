type AuthorizedFetch = (input: string, init?: RequestInit) => Promise<Response>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  metadata: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
}

export type NotificationsPayload = {
  items: NotificationItem[]
  unreadCount: number
}

// Deriva o destino in-app de uma notificação a partir do seu type + metadata.
// Espelha as `url`s que o backend manda no push (mas o sininho não recebe
// `url`, só metadata — por isso derivamos aqui). Retorna null quando não há
// destino útil (a notificação fica clicável mas só marca como lida).
export function notificationLink(item: Pick<NotificationItem, 'type' | 'metadata'>): string | null {
  const meta = item.metadata ?? {}
  const str = (k: string): string | null => (typeof meta[k] === 'string' ? (meta[k] as string) : null)

  const postId = str('postId')
  const competitionId = str('competitionId')
  const followerUserId = str('followerUserId')
  const inviteToken = str('inviteToken')

  switch (item.type) {
    case 'POST_LIKE':
    case 'POST_COMMENT':
      return postId ? `/post/${postId}` : '/feed'
    case 'POST_REMOVED_BY_ADMIN':
      return '/profile'
    case 'USER_FOLLOWED':
      return followerUserId ? `/u/${followerUserId}` : null
    case 'COMPETITION_INVITE_RECEIVED':
      return inviteToken ? `/desafios/convite/${inviteToken}` : (competitionId ? `/desafios/${competitionId}` : '/desafios')
    case 'COMPETITION_STARTED':
    case 'COMPETITION_FINISHED':
    case 'COMPETITION_MEMBER_JOINED':
    case 'COMPETITION_RANKING_OVERTAKEN':
    case 'COMPETITION_ENDING_SOON':
      return competitionId ? `/desafios/${competitionId}` : '/desafios'
    default:
      return null
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message ?? 'Erro na requisição')
  return json?.data as T
}

export async function listNotifications(authorizedFetch: AuthorizedFetch): Promise<NotificationsPayload> {
  const res = await authorizedFetch(`${API_URL}/notifications`)
  return handleResponse<NotificationsPayload>(res)
}

export async function markNotificationRead(authorizedFetch: AuthorizedFetch, id: string): Promise<void> {
  const res = await authorizedFetch(`${API_URL}/notifications/${id}/read`, { method: 'PATCH' })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error?.message ?? 'Erro ao marcar notificação')
  }
}

export async function markAllNotificationsRead(authorizedFetch: AuthorizedFetch): Promise<void> {
  const res = await authorizedFetch(`${API_URL}/notifications/read-all`, { method: 'POST' })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error?.message ?? 'Erro ao marcar notificações')
  }
}
