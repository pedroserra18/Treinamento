/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// ───────── PRECACHE ─────────
// Lista injetada pelo workbox em build time: HTML + JS + CSS + ícones.
// Cada um vem com hash no nome, então o cache é versionado naturalmente.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ───────── NAVIGATION (HTML) ─────────
// Network-first com fallback pra cache. Garante que o usuário sempre
// pega a versão nova quando online, mas funciona offline com a versão
// cacheada. Exclui rotas de API/admin/sentry — passam direto.
const denyList = [/^\/api\//, /^\/admin\//, /^\/sentry\//]
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'html-cache',
      networkTimeoutSeconds: 3,
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
    { denylist: denyList },
  ),
)

// ───────── API (mesmo origin) ─────────
// Network-first com TTL curto (30s) — se cair a rede, serve o último
// fetch bem-sucedido. Não usar pra POSTs (workbox só cacheia GET por
// padrão, então isso já está OK).
// /auth/* fica de fora: são respostas por-usuário (perfil, tokens) e o
// workbox indexa o cache só pela URL, ignorando o header Authorization —
// duas contas no mesmo aparelho compartilhariam a mesma entrada.
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    !url.pathname.includes('/auth/') &&
    request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 30,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

// ───────── ASSETS ESTÁTICOS ─────────
// JS/CSS/fontes/imagens locais com cache-first agressivo — eles têm
// hash no nome (assets/index-XXXXX.js), então versionamento é nativo.
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    (request.destination === 'script' ||
     request.destination === 'style' ||
     request.destination === 'font' ||
     request.destination === 'image'),
  new CacheFirst({
    cacheName: 'static-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 dias
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

// ───────── FONTES GOOGLE ─────────
// Stale-while-revalidate pra carregar do cache instantâneo e atualizar
// em background. Aceita resposta opaca (status 0) pra cross-origin.
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
)

// ───────── PASSTHROUGH (não cachear) ─────────
// Requests do Sentry, Supabase realtime e analytics passam direto.
// Sem interceptar evita conflito com session tokens, WebSockets e
// error reports.
const passthroughHosts = [
  /sentry\.io$/,
  /supabase\.co$/,
  /supabase\.in$/,
]
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (passthroughHosts.some((re) => re.test(url.host))) {
    // Não chama event.respondWith — deixa o browser tratar nativamente.
    return
  }
})

// ───────── PUSH NOTIFICATIONS ─────────
// Recebe push do backend (futuro) e exibe notificação. O payload é
// JSON livre — usamos title/body/url/tag pra agrupar e deep-link.
self.addEventListener('push', (event) => {
  if (!event.data) return
  try {
    const payload = event.data.json() as {
      title?: string
      body?: string
      url?: string
      tag?: string
      icon?: string
    }
    const title = payload.title || 'SerraAthlo'
    // vibrate é spec mas DOM types do TS ainda não pegam — cast simples
    // pra contornar sem perder type safety nos campos legítimos.
    const notifOptions: NotificationOptions & { vibrate?: number[] } = {
      body: payload.body,
      icon: payload.icon || '/icons/pwa-192x192.png',
      badge: '/icons/pwa-64x64.png',
      tag: payload.tag || 'default',
      data: { url: payload.url || '/' },
      vibrate: [80, 40, 80],
    }
    event.waitUntil(self.registration.showNotification(title, notifOptions))
  } catch {
    // Payload inválido — exibe notificação genérica em vez de silenciar.
    event.waitUntil(
      self.registration.showNotification('SerraAthlo', {
        body: 'Nova atividade disponível',
        icon: '/icons/pwa-192x192.png',
      }),
    )
  }
})

// Tap na notificação — abre ou foca a aba do app na URL de destino.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data as { url?: string } | null)?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Se já tem janela aberta, foca e navega.
      const existing = wins.find((w) => w.url.startsWith(self.location.origin))
      if (existing) {
        return existing.focus().then(() => existing.navigate(targetUrl))
      }
      // Senão abre uma nova.
      return self.clients.openWindow(targetUrl)
    }),
  )
})

// ───────── UPDATE FLOW ─────────
// O cliente (registerSW.ts) controla skipWaiting via postMessage
// {type: 'SKIP_WAITING'} quando o usuário aceita atualizar.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
