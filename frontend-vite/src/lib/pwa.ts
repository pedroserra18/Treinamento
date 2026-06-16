// Cliente PWA: registra o Service Worker e expõe um pequeno EventTarget
// pra o resto do app reagir a eventos importantes (update disponível,
// app instalado, push permission). Mantém complexidade longe dos
// componentes React — eles só precisam ouvir 1-2 eventos.
//
// Atualização: build #pwa-v1-installable (force-deploy ping)

import { Workbox } from 'workbox-window'

type PwaEvent = 'updateAvailable' | 'updateActivated' | 'controlling'

class PwaController {
  private listeners: Partial<Record<PwaEvent, Set<() => void>>> = {}
  private updateRegistration: (() => Promise<void>) | null = null

  /**
   * Registra o SW. Chamado UMA vez no boot do app. Em ambientes sem
   * suporte (dev sem HTTPS, certos navegadores), é no-op silencioso.
   */
  register() {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // Só registra em produção — vite-plugin-pwa devOptions desliga
    // o build do SW em dev, então essa checagem é defesa em camadas.
    if (!import.meta.env.PROD) return

    const wb = new Workbox('/sw.js', { scope: '/' })

    wb.addEventListener('waiting', () => {
      // Nova versão pronta esperando — emite pra UI mostrar o toast
      // de "Atualizar agora". O update real só roda quando o usuário
      // confirma (skipWaiting via update()).
      this.emit('updateAvailable')
    })

    wb.addEventListener('controlling', () => {
      // SW novo agora está controlando esta página — reload pra pegar
      // os assets novos. Importante: só recarrega DEPOIS de confirmar.
      this.emit('controlling')
      window.location.reload()
    })

    wb.addEventListener('activated', () => {
      // Primeira ativação após install. Não recarrega — apenas registra.
      this.emit('updateActivated')
    })

    this.updateRegistration = async () => {
      // Triggered pelo botão "Atualizar". Mensagem manda o SW pular o
      // estado waiting e ativar imediatamente.
      try {
        await wb.messageSkipWaiting()
      } catch {
        // ignora — vai disparar de novo na próxima visita
      }
    }

    wb.register().catch((err) => {
      // SW não conseguiu registrar. Não é fatal — app continua como
      // site normal. Log via Sentry se quiser observar.
      console.warn('[PWA] Falha ao registrar service worker', err)
    })

    // PWAs instalados quase sempre são RETOMADOS do segundo plano em vez de
    // abertos do zero, então register() (que só roda no boot) raramente
    // re-checa por uma versão nova — e o toast "Atualizar" nunca aparece.
    // Aqui a gente checa por update sempre que o app volta ao foco/visível,
    // com throttle pra não martelar a rede. wb.update() só busca o SW novo;
    // não recarrega nada (o reload só acontece quando o usuário confirma).
    let lastUpdateCheck = Date.now()
    const checkForUpdate = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastUpdateCheck < 30_000) return
      lastUpdateCheck = now
      wb.update().catch(() => {
        // offline ou erro transitório — tenta de novo no próximo foco
      })
    }
    document.addEventListener('visibilitychange', checkForUpdate)
    window.addEventListener('focus', checkForUpdate)
  }

  /**
   * Confirma update pendente. Chame quando o usuário toca em "Atualizar".
   * O reload acontece automaticamente via 'controlling' handler.
   */
  applyUpdate() {
    this.updateRegistration?.()
  }

  /**
   * Inscreve um handler pra um dos eventos do ciclo de vida.
   * Retorna função de unsubscribe — ideal pra useEffect cleanup.
   */
  on(event: PwaEvent, handler: () => void): () => void {
    if (!this.listeners[event]) this.listeners[event] = new Set()
    this.listeners[event]!.add(handler)
    return () => {
      this.listeners[event]?.delete(handler)
    }
  }

  private emit(event: PwaEvent) {
    this.listeners[event]?.forEach((h) => h())
  }
}

export const pwa = new PwaController()
