// Cliente do módulo de push do backend. Aqui ficam só os wrappers HTTP;
// a lógica do browser (permission, subscribe via PushManager) está em
// `lib/notifications.ts`. Dividido assim porque o lib não precisa do
// authorizedFetch e pode ser usado em contextos sem auth (ex.: pedir
// permission depois de cadastrar mas antes de logar pela primeira vez).

type AuthorizedFetch = (input: string, init?: RequestInit) => Promise<Response>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

async function parseError(res: Response): Promise<string> {
  try {
    const json = await res.json()
    return json?.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

// Bootstrap — pede ao backend qual é a chave VAPID pública. Retorna
// null se o backend não estiver configurado (env vars faltando) — nesse
// caso o frontend cai pro modo "local only" (notificação só dispara
// enquanto a aba está viva).
export async function getVapidPublicKey(): Promise<{ publicKey: string | null; configured: boolean }> {
  const res = await fetch(`${API_URL}/push/vapid-public-key`)
  if (!res.ok) return { publicKey: null, configured: false }
  const json = await res.json().catch(() => null) as {
    data?: { publicKey: string | null; configured: boolean }
  } | null
  return {
    publicKey: json?.data?.publicKey ?? null,
    configured: Boolean(json?.data?.configured),
  }
}

// Envia a PushSubscription do browser pro backend armazenar. O backend
// faz upsert por endpoint, então chamar várias vezes (ex.: a cada
// login) é idempotente.
export async function registerPushSubscription(
  authorizedFetch: AuthorizedFetch,
  subscription: PushSubscription,
): Promise<void> {
  const raw = subscription.toJSON()
  // .toJSON() retorna {endpoint, keys: {p256dh, auth}} — exatamente o
  // formato esperado pelo schema do backend.
  const body = {
    endpoint: raw.endpoint!,
    keys: {
      p256dh: raw.keys?.p256dh ?? '',
      auth: raw.keys?.auth ?? '',
    },
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 255) : undefined,
  }
  const res = await authorizedFetch(`${API_URL}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res))
  }
}

// Desinscreve do backend. Idealmente chamado quando o usuário desativa
// notificações na UI ou no logout. Não é crítico — endpoint expirado
// é limpo pelo backend automaticamente quando o gateway retorna 410.
export async function unregisterPushSubscription(
  authorizedFetch: AuthorizedFetch,
  endpoint: string,
): Promise<void> {
  const res = await authorizedFetch(`${API_URL}/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res))
  }
}

// Agenda uma notificação push pra um momento futuro. Retorna o id do
// agendamento pra possível cancelamento posterior. fireAt deve ser ISO
// 8601 (Date.toISOString()).
export type ScheduleNotificationInput = {
  fireAt: string
  title: string
  body: string
  url?: string
  tag?: string
}

export async function scheduleBackendNotification(
  authorizedFetch: AuthorizedFetch,
  input: ScheduleNotificationInput,
): Promise<{ id: string; fireAt: string }> {
  const res = await authorizedFetch(`${API_URL}/push/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const json = await res.json() as { data: { id: string; fireAt: string } }
  return json.data
}

export async function cancelBackendNotification(
  authorizedFetch: AuthorizedFetch,
  scheduleId: string,
): Promise<void> {
  const res = await authorizedFetch(`${API_URL}/push/schedule/${scheduleId}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res))
  }
}

// Preferências granulares de notificação por categoria. Lidas/escritas
// no endpoint /notifications/preferences. Defaults (quando user nunca
// teve a row) são tudo true — quem opt-in global e nunca tocou nos
// toggles recebe push de tudo.
export type NotificationPreferences = {
  pushSocial: boolean
  pushCompetition: boolean
  pushSupport: boolean
  pushEngagement: boolean
}

export async function getNotificationPreferences(
  authorizedFetch: AuthorizedFetch,
): Promise<NotificationPreferences> {
  const res = await authorizedFetch(`${API_URL}/notifications/preferences`)
  if (!res.ok) throw new Error(await parseError(res))
  const json = (await res.json()) as { data: NotificationPreferences }
  return json.data
}

export async function updateNotificationPreferences(
  authorizedFetch: AuthorizedFetch,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const res = await authorizedFetch(`${API_URL}/notifications/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const json = (await res.json()) as { data: NotificationPreferences }
  return json.data
}
