import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import {
  getNotificationPermission,
  requestNotificationPermission,
  requestPushSubscription,
  type NotificationPermissionState,
} from '../lib/notifications'
import {
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
} from '../services/pushService'

// Estado consolidado das push notifications. Combina o que o browser
// reporta (permission + subscription ativa) com o que o backend suporta
// (VAPID configurado).
export type PushNotificationsState = {
  // O browser tem PushManager + Notification API?
  supported: boolean
  // Estado da permissão de notificação.
  permission: NotificationPermissionState
  // Tem subscription ativa no PushManager (browser cacheia entre sessões).
  subscribed: boolean
  // Backend tem VAPID configurado? Quando false, push remoto não vai
  // funcionar mesmo se o user dar permissão — só dispara enquanto a aba
  // está viva.
  backendConfigured: boolean
  // Carregamento inicial (checando estado do browser + backend).
  loading: boolean
  // Última falha — útil pra mostrar mensagem específica no Settings.
  error: string | null
}

const initial: PushNotificationsState = {
  supported: false,
  permission: 'unsupported',
  subscribed: false,
  backendConfigured: false,
  loading: true,
  error: null,
}

// Hook único pra gerenciar tudo de push. Componentes (Settings panel,
// CreateExerciseModal, TrainPage) consomem o mesmo estado e disparam
// enable/disable via os métodos retornados. Internamente cuida de:
//   • Detectar suporte do browser.
//   • Pegar VAPID public key do backend.
//   • Verificar permission atual e subscription ativa.
//   • Fluxo de opt-in: permission → PushManager.subscribe → POST pro backend.
//   • Fluxo de opt-out: unsubscribe local + DELETE no backend.
export function usePushNotifications() {
  const { authorizedFetch } = useAuth()
  const [state, setState] = useState<PushNotificationsState>(initial)
  const [vapidKey, setVapidKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const detect = async (): Promise<void> => {
      // Suporte do browser. PushManager e Notification são separados —
      // ambos precisam existir.
      const hasNotification = typeof window !== 'undefined' && 'Notification' in window
      const hasPushManager = typeof window !== 'undefined' && 'PushManager' in window
      const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      const supported = hasNotification && hasPushManager && hasServiceWorker

      if (!supported) {
        if (!cancelled) {
          setState({
            ...initial,
            supported: false,
            permission: 'unsupported',
            loading: false,
          })
        }
        return
      }

      const permission = getNotificationPermission()
      let subscribed = false
      try {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        subscribed = existing !== null
      } catch { /* ignora — tratado como não inscrito */ }

      // Bootstrap VAPID do backend. Falha silenciosa se o backend não
      // estiver respondendo — backendConfigured fica false e UI reflete.
      let backendConfigured = false
      try {
        const { publicKey, configured } = await getVapidPublicKey()
        if (publicKey) setVapidKey(publicKey)
        backendConfigured = configured && publicKey !== null
      } catch { /* idem */ }

      if (!cancelled) {
        setState({
          supported: true,
          permission,
          subscribed,
          backendConfigured,
          loading: false,
          error: null,
        })
      }
    }

    void detect()
    return () => { cancelled = true }
  }, [])

  // Liga as push notifications. Sequência:
  //   1. Pede permissão (se ainda não foi dada/negada).
  //   2. Subscreve no PushManager com a VAPID key.
  //   3. Manda a subscription pro backend.
  // Retorna true em sucesso. Em falha intermediária, error fica setado
  // mas o estado interno é restaurado (subscribed=false).
  const enable = useCallback(async (): Promise<boolean> => {
    if (!state.supported) return false
    setState((s) => ({ ...s, loading: true, error: null }))

    const permission = await requestNotificationPermission()
    if (permission !== 'granted') {
      setState((s) => ({ ...s, permission, loading: false, error: permission === 'denied'
        ? 'Permissão negada. Habilite manualmente nas configurações do navegador.'
        : 'Permissão não concedida.' }))
      return false
    }

    if (!vapidKey) {
      setState((s) => ({ ...s, permission, loading: false, error: 'Servidor não configurado pra push (VAPID ausente).' }))
      return false
    }

    const subscription = await requestPushSubscription(vapidKey)
    if (!subscription) {
      setState((s) => ({ ...s, permission, loading: false, error: 'Falha ao subscrever no navegador.' }))
      return false
    }

    try {
      await registerPushSubscription(authorizedFetch, subscription)
    } catch (err) {
      // Subscrevemos no browser mas falhamos no backend — desfaz a
      // subscription local pra não ficar com estado inconsistente.
      try { await subscription.unsubscribe() } catch { /* ignora */ }
      setState((s) => ({ ...s, permission, loading: false, error: err instanceof Error ? err.message : 'Falha ao registrar no servidor.' }))
      return false
    }

    setState((s) => ({ ...s, permission, subscribed: true, loading: false, error: null }))
    return true
  }, [state.supported, vapidKey, authorizedFetch])

  // Desliga. Unsubscribe local + DELETE no backend (idempotente). Mantém
  // a permission concedida — o user pode reativar sem precisar pedir
  // permissão de novo.
  const disable = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        const endpoint = existing.endpoint
        try { await existing.unsubscribe() } catch { /* ignora */ }
        try { await unregisterPushSubscription(authorizedFetch, endpoint) } catch { /* não bloqueia */ }
      }
      setState((s) => ({ ...s, subscribed: false, loading: false, error: null }))
      return true
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Falha ao desinscrever.' }))
      return false
    }
  }, [authorizedFetch])

  return { state, enable, disable }
}
