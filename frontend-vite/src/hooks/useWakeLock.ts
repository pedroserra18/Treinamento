import { useEffect } from 'react'

// API mínima do Wake Lock — tipada localmente pra não depender da versão da
// lib DOM do TS.
type WakeLockSentinelLike = { release: () => Promise<void> }
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> }

function getWakeLock(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null
  const wl = (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock
  return wl ?? null
}

// Mantém a tela do device acesa enquanto `active` for true (ex.: durante o
// treino), como Hevy/Strava. O browser libera o lock automaticamente quando a
// aba perde o foco, então re-adquirimos no visibilitychange ao voltar. No-op
// onde a API não existe — degrada em silêncio (iOS só suporta em Safari
// recente / PWA instalado).
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const wakeLock = getWakeLock()
    if (!wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let released = false

    const acquire = async () => {
      try {
        sentinel = await wakeLock.request('screen')
      } catch {
        // permissão negada / não suportado / aba não-visível — ignora
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !released) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void sentinel?.release().catch(() => undefined)
      sentinel = null
    }
  }, [active])
}
