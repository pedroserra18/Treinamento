// Detecção + persistência do estado do install prompt PWA.
// Roda no browser, expõe utilitários e o evento `beforeinstallprompt`
// (Chrome/Edge/Android) pra UI consumir.

const KEY_DISMISSED_UNTIL = 'acad:pwa-install-dismissed-until'
const KEY_VISIT_COUNT = 'acad:pwa-visit-count'

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * App rodando como PWA instalado? (Android standalone, iOS standalone).
 * Quando true, NÃO mostra banner de install (já está instalado).
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS legacy property
  // @ts-expect-error iOS-only
  if (window.navigator.standalone === true) return true
  // Modern: display-mode media query
  return window.matchMedia('(display-mode: standalone)').matches
}

/**
 * Detecta iOS Safari — necessário pra mostrar tutorial manual
 * (Apple não expõe a API beforeinstallprompt).
 */
export function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIos = /iPhone|iPad|iPod/.test(ua)
  // Safari (não Chrome/Firefox dentro do iOS)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return isIos && isSafari
}

/**
 * Detecta Android (qualquer browser baseado em Chromium).
 */
export function isAndroidChromium(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  return /Android/.test(ua) && /Chrome/.test(ua)
}

/**
 * Banner foi dismissed dentro do snooze (7 dias)?
 */
export function isSnoozed(): boolean {
  try {
    const until = window.localStorage.getItem(KEY_DISMISSED_UNTIL)
    if (!until) return false
    return Date.now() < parseInt(until, 10)
  } catch {
    return false
  }
}

export function snoozeForDays(days: number): void {
  try {
    const until = Date.now() + days * 24 * 60 * 60 * 1000
    window.localStorage.setItem(KEY_DISMISSED_UNTIL, String(until))
  } catch {
    // ignora — sem snooze é só mostrar de novo
  }
}

/**
 * Conta visitas. Usado pra só mostrar banner na 2ª visita +
 * (sinal de "esse usuário está usando mesmo").
 */
export function bumpVisitCount(): number {
  try {
    const current = parseInt(window.localStorage.getItem(KEY_VISIT_COUNT) || '0', 10)
    const next = current + 1
    window.localStorage.setItem(KEY_VISIT_COUNT, String(next))
    return next
  } catch {
    return 1
  }
}

export function getVisitCount(): number {
  try {
    return parseInt(window.localStorage.getItem(KEY_VISIT_COUNT) || '0', 10)
  } catch {
    return 0
  }
}
