// Vibração tátil (haptics) — sensação de app nativo ao marcar série / fim de
// descanso. No-op onde não há suporte (iOS Safari ignora; Android/Chrome
// suportam). Envolto em try/catch porque alguns browsers lançam quando
// chamado fora de um gesto do usuário ou com a aba em background.
export function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    /* ignore — vibração é um "nice to have", nunca crítico */
  }
}
