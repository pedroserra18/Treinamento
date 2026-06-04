// Wrapper sobre Notification API com fallback gracioso. Usado pra
// notificações locais (cliente decide e dispara), ex.: "Descanso
// acabou". Pra notificações push REMOTAS (backend dispara), use
// `requestPushSubscription` que registra a subscription pro backend
// poder enviar via Web Push Protocol.

const KEY_PERMISSION_ASKED = 'acad:notif-permission-asked'

/**
 * Status atual da permissão de notificação. 'unsupported' quando o
 * browser não tem a API (iOS Safari < 16.4 antes do PWA standalone, etc.)
 */
export type NotificationPermissionState =
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied'

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('Notification' in window)) return 'unsupported'
  return window.Notification.permission as NotificationPermissionState
}

/**
 * Pede permissão. Retorna o estado FINAL. Idempotente: se já foi
 * granted/denied, retorna direto sem pedir de novo (browser não
 * permitiria mesmo).
 *
 * IMPORTANTE: chame em resposta a uma ação direta do usuário
 * (click), nunca em mount. iOS Safari só atende permission request
 * dentro de gesture handler.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const current = getNotificationPermission()
  if (current === 'unsupported' || current === 'granted' || current === 'denied') {
    return current
  }
  try {
    const result = await window.Notification.requestPermission()
    try { window.localStorage.setItem(KEY_PERMISSION_ASKED, '1') } catch { /* ignora */ }
    return result as NotificationPermissionState
  } catch {
    return 'denied'
  }
}

/**
 * Exibe notificação local. Usa o Service Worker se disponível
 * (necessário pra notificações persistirem com a aba fechada);
 * fallback pra Notification direta na main thread.
 */
export async function showLocalNotification(
  title: string,
  options?: {
    body?: string
    tag?: string
    url?: string
    icon?: string
    vibrate?: number[]
  }
): Promise<void> {
  if (getNotificationPermission() !== 'granted') return

  // vibrate é spec (Notification Triggers) mas DOM types do TS ainda
  // não pegam. Tipo estendido contornando sem perder type safety.
  const init: NotificationOptions & { vibrate?: number[]; badge?: string } = {
    body: options?.body,
    tag: options?.tag,
    icon: options?.icon || '/icons/pwa-192x192.png',
    badge: '/icons/pwa-64x64.png',
    data: { url: options?.url || '/' },
  }
  if (options?.vibrate) {
    init.vibrate = options.vibrate
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, init)
      return
    }
  } catch {
    // cai pro fallback abaixo
  }
  try {
    new window.Notification(title, init)
  } catch {
    // ignora silenciosamente — notificação é melhoria, não crítico
  }
}

/**
 * Inscreve o cliente pra receber push notifications do backend.
 * Retorna a PushSubscription pra ser enviada ao backend (que vai
 * armazenar e usar pra enviar com VAPID).
 *
 * Pré-requisito: SW deve estar registrado E permissão deve estar
 * granted. Use `requestNotificationPermission()` antes.
 */
export async function requestPushSubscription(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  if (getNotificationPermission() !== 'granted') return null
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) return existing
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
    return sub
  } catch {
    return null
  }
}

/**
 * Helper pra converter VAPID public key (base64 URL-safe) em Uint8Array
 * que o PushManager espera. Padrão da spec.
 */
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  // Aloca ArrayBuffer fresh — tipos do TS 5.7 são estritos sobre não
  // aceitar SharedArrayBuffer no PushManager.subscribe. Buffer
  // dedicado garante o ArrayBuffer puro.
  const buffer = new ArrayBuffer(rawData.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i += 1) {
    view[i] = rawData.charCodeAt(i)
  }
  return view
}
