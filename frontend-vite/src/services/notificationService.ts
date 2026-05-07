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
