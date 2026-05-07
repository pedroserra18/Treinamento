type AuthorizedFetch = (input: string, init?: RequestInit) => Promise<Response>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

export type TicketTopic = 'ACCOUNT' | 'POST_REMOVED' | 'LOGIN' | 'BUG' | 'OTHER'
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_USER' | 'RESOLVED' | 'CLOSED'
export type MessageAuthorRole = 'USER' | 'ADMIN' | 'SYSTEM'

export type SupportTicketSummary = {
  id: string
  publicId: number
  code: string
  topic: TicketTopic
  subject: string
  status: TicketStatus
  lastActivityAt: string
  resolvedAt: string | null
  closedAt: string | null
  createdAt: string
  user: { id: string; name: string | null; email: string; avatarUrl: string | null }
}

export type SupportMessage = {
  id: string
  ticketId: string
  body: string
  attachments: string[]
  authorRole: MessageAuthorRole
  isInternalNote: boolean
  createdAt: string
  author:
    | { displayName: string }
    | { id: string; displayName: string; avatarUrl: string | null }
  viewerCanSeeInternalNote: boolean
}

export type SupportTicketDetail = {
  ticket: SupportTicketSummary
  messages: SupportMessage[]
}

export type SupportTemplate = {
  id: string
  title: string
  body: string
  updatedAt: string
}

async function handle<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const message = json?.error?.message ?? 'Erro na requisição'
    throw new Error(message)
  }
  return json?.data as T
}

export async function createTicket(
  fetcher: AuthorizedFetch,
  input: { topic: TicketTopic; subject: string; body: string; attachments?: string[] }
): Promise<{ ticket: SupportTicketSummary }> {
  const res = await fetcher(`${API_URL}/support/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handle(res)
}

export async function listMyTickets(fetcher: AuthorizedFetch): Promise<{ items: SupportTicketSummary[] }> {
  const res = await fetcher(`${API_URL}/support/tickets`)
  return handle(res)
}

export async function getMyTicket(fetcher: AuthorizedFetch, ticketId: string): Promise<SupportTicketDetail> {
  const res = await fetcher(`${API_URL}/support/tickets/${ticketId}`)
  return handle(res)
}

export async function postUserReply(
  fetcher: AuthorizedFetch,
  ticketId: string,
  input: { body: string; attachments?: string[] }
): Promise<{ message: SupportMessage }> {
  const res = await fetcher(`${API_URL}/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handle(res)
}

export async function userResolveTicket(fetcher: AuthorizedFetch, ticketId: string): Promise<void> {
  const res = await fetcher(`${API_URL}/support/tickets/${ticketId}/resolve`, { method: 'POST' })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error?.message ?? 'Erro ao resolver ticket')
  }
}

// Admin
export async function adminListTickets(
  fetcher: AuthorizedFetch,
  params: { status?: TicketStatus; search?: string; page?: number; pageSize?: number } = {}
): Promise<{ items: SupportTicketSummary[]; total: number; page: number; pageSize: number }> {
  const url = new URL(`${API_URL}/admin/support/tickets`)
  if (params.status) url.searchParams.set('status', params.status)
  if (params.search) url.searchParams.set('search', params.search)
  if (params.page) url.searchParams.set('page', String(params.page))
  if (params.pageSize) url.searchParams.set('pageSize', String(params.pageSize))
  const res = await fetcher(url.toString())
  return handle(res)
}

export async function adminGetTicket(fetcher: AuthorizedFetch, ticketId: string): Promise<SupportTicketDetail> {
  const res = await fetcher(`${API_URL}/admin/support/tickets/${ticketId}`)
  return handle(res)
}

export async function adminPostReply(
  fetcher: AuthorizedFetch,
  ticketId: string,
  input: { body: string; attachments?: string[]; isInternalNote?: boolean; nextStatus?: TicketStatus }
): Promise<{ message: SupportMessage }> {
  const res = await fetcher(`${API_URL}/admin/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handle(res)
}

export async function adminUpdateStatus(
  fetcher: AuthorizedFetch,
  ticketId: string,
  status: TicketStatus
): Promise<void> {
  const res = await fetcher(`${API_URL}/admin/support/tickets/${ticketId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error?.message ?? 'Erro ao atualizar status')
  }
}

export async function listTemplates(fetcher: AuthorizedFetch): Promise<{ items: SupportTemplate[] }> {
  const res = await fetcher(`${API_URL}/admin/support/templates`)
  return handle(res)
}

export async function createTemplate(
  fetcher: AuthorizedFetch,
  input: { title: string; body: string }
): Promise<{ template: SupportTemplate }> {
  const res = await fetcher(`${API_URL}/admin/support/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handle(res)
}

export async function updateTemplate(
  fetcher: AuthorizedFetch,
  templateId: string,
  input: { title: string; body: string }
): Promise<{ template: SupportTemplate }> {
  const res = await fetcher(`${API_URL}/admin/support/templates/${templateId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return handle(res)
}

export async function deleteTemplate(fetcher: AuthorizedFetch, templateId: string): Promise<void> {
  const res = await fetcher(`${API_URL}/admin/support/templates/${templateId}`, { method: 'DELETE' })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error?.message ?? 'Erro ao excluir template')
  }
}

export async function adminAutoClose(fetcher: AuthorizedFetch): Promise<{ closed: number }> {
  const res = await fetcher(`${API_URL}/admin/support/auto-close`, { method: 'POST' })
  return handle(res)
}

export type RemovedPost = {
  id: string
  caption: string | null
  photoUrl: string | null
  privacy: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'
  likesCount: number
  createdAt: string
  removedAt: string
  removalReason: string | null
  removedByAdminId: string | null
}

export async function adminListRemovedPosts(
  fetcher: AuthorizedFetch,
  userId: string
): Promise<{ items: RemovedPost[] }> {
  const res = await fetcher(`${API_URL}/admin/support/users/${userId}/removed-posts`)
  return handle(res)
}

export async function adminRestorePost(fetcher: AuthorizedFetch, postId: string): Promise<void> {
  const res = await fetcher(`${API_URL}/admin/support/posts/${postId}/restore`, { method: 'POST' })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error?.message ?? 'Erro ao restaurar post')
  }
}

export const TOPIC_LABELS: Record<TicketTopic, string> = {
  ACCOUNT: 'Conta',
  POST_REMOVED: 'Post removido',
  LOGIN: 'Login / acesso',
  BUG: 'Bug ou erro',
  OTHER: 'Outro',
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em análise',
  AWAITING_USER: 'Aguardando você',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
}

export const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: 'bg-blue-500/15 text-blue-300',
  IN_PROGRESS: 'bg-amber-500/15 text-amber-300',
  AWAITING_USER: 'bg-purple-500/15 text-purple-300',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300',
  CLOSED: 'bg-zinc-500/15 text-zinc-300',
}
