import { useSyncExternalStore } from 'react'
import {
  deriveElapsedSec,
  readActiveWorkout,
  subscribeActiveWorkout,
} from '../lib/active-workout-storage'

// Relógio ÚNICO do tempo decorrido do treino. Em vez de cada cronômetro (tela
// ativa, mini barra) manter seu próprio âncora — o que causava diferença
// persistente entre eles —, todos consomem este store compartilhado via
// useSyncExternalStore. Resultado: TODOS mostram exatamente o mesmo valor, do
// mesmo relógio de parede (deriveElapsedSec = elapsedSec + (now - lastSavedAt)),
// preciso como o cronômetro do sistema.

const listeners = new Set<() => void>()
let current = 0
let started = false
let intervalId: number | null = null
let unsubStorage: (() => void) | null = null

function compute(): number {
  const snap = readActiveWorkout()
  return snap ? deriveElapsedSec(snap) : 0
}

function tick(): void {
  const next = compute()
  // Só notifica quando o segundo inteiro muda — evita re-render desnecessário.
  if (next !== current) {
    current = next
    for (const listener of listeners) listener()
  }
}

function onResume(): void {
  if (document.visibilityState === 'visible') tick()
}

function start(): void {
  if (started) return
  started = true
  current = compute()
  intervalId = window.setInterval(tick, 1000)
  // Recalcula quando o snapshot muda (iniciar/pausar/retomar/salvar) e ao voltar
  // pro foreground/bfcache/foco — corrige na hora qualquer período suspenso.
  unsubStorage = subscribeActiveWorkout(tick)
  document.addEventListener('visibilitychange', onResume)
  window.addEventListener('pageshow', onResume)
  window.addEventListener('focus', onResume)
}

function stop(): void {
  if (!started) return
  started = false
  if (intervalId != null) window.clearInterval(intervalId)
  intervalId = null
  unsubStorage?.()
  unsubStorage = null
  document.removeEventListener('visibilitychange', onResume)
  window.removeEventListener('pageshow', onResume)
  window.removeEventListener('focus', onResume)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}

function getSnapshot(): number {
  return current
}

// Tempo decorrido do treino ativo, em segundos. Mesmo valor em qualquer lugar
// do app que use este hook.
export function useActiveWorkoutElapsed(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}
